import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, ne, count, sum, lt, inArray } from "drizzle-orm";
import { db, concertCampaignsTable, campaignTicketsTable, usersTable, teacherProfilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getUncachableStripeClient } from "../stripeClient";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/email";
import { randomUUID } from "crypto";
import QRCode from "qrcode";

// Keep campaigns within Stripe's authorization validity window (~7 days on most networks).
// Manual-capture PaymentIntents are authorized at checkout; captured on success.
const MAX_CAMPAIGN_DAYS = 7;
const PLATFORM_FEE_RATE = 0.08;

const router: IRouter = Router();

async function getCampaignTicketCount(campaignId: number): Promise<number> {
  const [row] = await db
    .select({ total: sum(campaignTicketsTable.quantity) })
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), ne(campaignTicketsTable.status, "cancelled")));
  return Number(row?.total ?? 0);
}

// Atomically claim a campaign status transition FROM "active".
// Uses UPDATE...WHERE status='active' RETURNING — single atomic DB round-trip.
// Returns true only if this caller won the transition; false if already transitioned.
async function atomicTransitionFromActive(
  campaignId: number,
  newStatus: "settling" | "failed" | "cancelled",
): Promise<boolean> {
  const [row] = await db
    .update(concertCampaignsTable)
    .set({ status: newStatus, updatedAt: new Date() })
    .where(and(eq(concertCampaignsTable.id, campaignId), eq(concertCampaignsTable.status, "active")))
    .returning({ id: concertCampaignsTable.id });
  return !!row;
}

// Classify Stripe errors: permanent (card decline, invalid request) vs transient (network).
// Permanent failures are cancelled immediately; transient ones are left for sweep retry.
function isCapturePermanentFailure(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: string };
  // StripeCardError: insufficient funds, card blocked, authentication required, etc.
  // StripeInvalidRequestError: auth expired, PI in wrong state (e.g., already captured/cancelled)
  return e.type === "StripeCardError" || e.type === "StripeInvalidRequestError";
}

// ─── Campaign success processing ──────────────────────────────────────────────
//
// Manual-capture flow:
//  1. Active + goal met → atomically transition to "settling" (prevents concurrent double-entry)
//  2. Already "settling" → proceed directly (retry path from hourly sweep)
//  3. For each "authorised" ticket:
//     - Capture PI using per-ticket idempotency key (Stripe returns same result on retry)
//     - Capture succeeds → mark ticket "captured"
//     - Permanent failure (card decline, expired auth) → cancel PI, mark ticket "cancelled"
//     - Transient error (network/Stripe outage) → leave "authorised" for next sweep retry
//  4. When zero "authorised" tickets remain → transition settling → succeeded
//     - Stores all captured PI IDs on campaign for audit
//     - Sends QR confirmation emails for captured tickets
//  5. If "authorised" tickets still remain → logged; next sweep will retry

export async function processCampaignSuccess(campaignId: number): Promise<void> {
  const [campaign] = await db
    .select()
    .from(concertCampaignsTable)
    .where(and(
      eq(concertCampaignsTable.id, campaignId),
      inArray(concertCampaignsTable.status, ["active", "settling"]),
    ));
  if (!campaign) return;

  if (campaign.status === "active") {
    const ticketsSold = await getCampaignTicketCount(campaignId);
    if (ticketsSold < campaign.goalCount) return;

    // Atomically claim settling — concurrent processors (webhook + sweep) both attempt this;
    // only one wins. The loser exits immediately with no Stripe calls made.
    const won = await atomicTransitionFromActive(campaignId, "settling");
    if (!won) {
      logger.info({ campaignId }, "Campaign settling transition already claimed — skipping");
      return;
    }
    logger.info({ campaignId, goalCount: campaign.goalCount }, "Campaign transitioning to settling — capturing authorizations");
  } else {
    logger.info({ campaignId }, "Campaign already settling — resuming capture (retry path)");
  }

  const tickets = await db
    .select()
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "authorised")));

  const stripe = await getUncachableStripeClient();
  let capturedCount = 0;
  let permanentFailures = 0;
  let transientFailures = 0;

  for (const ticket of tickets) {
    if (!ticket.stripePaymentIntentId) {
      // Data integrity gap — no PI ID; leave authorised for manual reconciliation
      logger.error({ campaignId, ticketId: ticket.id }, "Ticket has no PaymentIntent ID — skipping; manual reconciliation required");
      transientFailures++;
      continue;
    }

    try {
      // Idempotency key: safe to retry — Stripe returns cached result for duplicate key
      await stripe.paymentIntents.capture(
        ticket.stripePaymentIntentId,
        {},
        { idempotencyKey: `campaign_capture_${campaignId}_${ticket.id}` },
      );
      await db.update(campaignTicketsTable)
        .set({ status: "captured", updatedAt: new Date() })
        .where(eq(campaignTicketsTable.id, ticket.id));
      capturedCount++;
    } catch (captureErr) {
      if (isCapturePermanentFailure(captureErr)) {
        // Permanent failure — release the auth hold and mark ticket cancelled
        permanentFailures++;
        logger.warn({ captureErr, campaignId, ticketId: ticket.id, piId: ticket.stripePaymentIntentId },
          "Capture permanently failed — cancelling authorization and marking ticket cancelled");
        try {
          await stripe.paymentIntents.cancel(
            ticket.stripePaymentIntentId,
            {},
            { idempotencyKey: `campaign_capture_cancel_${campaignId}_${ticket.id}` },
          );
        } catch (cancelErr) {
          logger.error({ cancelErr, ticketId: ticket.id }, "Failed to cancel PI after permanent capture failure — manual action required");
        }
        await db.update(campaignTicketsTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(campaignTicketsTable.id, ticket.id));
      } else {
        // Transient error — leave "authorised" so next sweep retry can attempt capture again
        transientFailures++;
        logger.error({ captureErr, campaignId, ticketId: ticket.id },
          "Transient error during capture — ticket left authorised for next sweep retry");
      }
    }
  }

  // Check if all tickets are now terminal (no more "authorised" rows)
  const [{ remaining }] = await db
    .select({ remaining: count() })
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "authorised")));

  if (Number(remaining) > 0) {
    logger.warn({ campaignId, remaining: Number(remaining), capturedCount, permanentFailures, transientFailures },
      "Settlement incomplete — authorised tickets remain; sweep will retry");
    return;
  }

  // Collect all captured PI IDs across all settlement runs (idempotent retries may have added more)
  const capturedRows = await db
    .select({ piId: campaignTicketsTable.stripePaymentIntentId })
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "captured")));
  const allPiIds = capturedRows.map((r) => r.piId).filter(Boolean) as string[];

  // Transition settling → succeeded (idempotent — only updates if still settling)
  await db.update(concertCampaignsTable)
    .set({ status: "succeeded", stripePaymentIntentIds: allPiIds, updatedAt: new Date() })
    .where(and(eq(concertCampaignsTable.id, campaignId), eq(concertCampaignsTable.status, "settling")));

  logger.info({ campaignId, captured: capturedCount, declined: permanentFailures, totalPiIds: allPiIds.length },
    "Campaign succeeded — all payments settled");

  // Send confirmation emails for captured tickets
  const capturedTickets = await db
    .select()
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "captured")));

  for (const ticket of capturedTickets) {
    if (!ticket.buyerEmail) continue;
    try {
      const qrDataUrl = await QRCode.toDataURL(ticket.accessCode ?? String(ticket.id), { width: 200, margin: 2 });
      await sendEmail({
        to: ticket.buyerEmail,
        subject: `Your tickets are confirmed — ${campaign.title}`,
        html: `<p>Great news, ${ticket.buyerName ?? "music fan"}!</p>
<p>The campaign for <strong>${campaign.title}</strong> reached its goal. Your ${ticket.quantity} ticket${ticket.quantity > 1 ? "s are" : " is"} confirmed and $${(ticket.totalPriceCents / 100).toFixed(2)} has been captured.</p>
${campaign.scheduledDate ? `<p><strong>Date:</strong> ${campaign.scheduledDate}</p>` : ""}
${campaign.venueName ? `<p><strong>Venue:</strong> ${campaign.venueName}</p>` : ""}
<p><strong>Access Code:</strong> <code>${ticket.accessCode}</code></p>
<p>Show this QR code at the venue:</p>
<img src="${qrDataUrl}" alt="QR Code" width="200" height="200" style="display:block;border:1px solid #eee;" />
<p style="color:#999;font-size:12px;">Powered by Harmonia</p>`,
      });
    } catch (emailErr) {
      logger.error({ emailErr, ticketId: ticket.id }, "Failed to send confirmation email");
    }
  }
}

// ─── Campaign failure processing ──────────────────────────────────────────────
// Atomically transitions active → failed, then cancels all authorization holds
// so fans' cards are released immediately.

export async function processCampaignFailure(campaignId: number): Promise<void> {
  const won = await atomicTransitionFromActive(campaignId, "failed");
  if (!won) {
    logger.info({ campaignId }, "Campaign already transitioned — skipping failure processing");
    return;
  }

  const tickets = await db
    .select()
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "authorised")));

  const stripe = await getUncachableStripeClient();
  const [campaign] = await db
    .select({ title: concertCampaignsTable.title })
    .from(concertCampaignsTable)
    .where(eq(concertCampaignsTable.id, campaignId));

  for (const ticket of tickets) {
    try {
      if (ticket.stripePaymentIntentId) {
        await stripe.paymentIntents.cancel(
          ticket.stripePaymentIntentId,
          {},
          { idempotencyKey: `campaign_cancel_${campaignId}_${ticket.id}` },
        );
      }
      await db.update(campaignTicketsTable)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(campaignTicketsTable.id, ticket.id));
      if (ticket.buyerEmail) {
        await sendEmail({
          to: ticket.buyerEmail,
          subject: `Campaign update — ${campaign?.title ?? "your campaign"}`,
          html: `<p>Hi ${ticket.buyerName ?? "there"},</p>
<p>The crowdfunding campaign for <strong>${campaign?.title ?? "the concert"}</strong> did not reach its goal. Your card authorization has been cancelled — no charge was made.</p>
<p style="color:#999;font-size:12px;">Powered by Harmonia</p>`,
        }).catch((e) => logger.error({ e, ticketId: ticket.id }, "Failed to send failure email"));
      }
    } catch (err) {
      logger.error({ err, ticketId: ticket.id }, "Failed to cancel PI for failed campaign — manual action required");
    }
  }
  logger.info({ campaignId }, "Campaign failed — authorization holds cancelled");
}

// ─── Public routes ─────────────────────────────────────────────────────────────

router.get("/campaigns", async (req, res): Promise<void> => {
  try {
    const campaigns = await db
      .select({
        id: concertCampaignsTable.id,
        teacherId: concertCampaignsTable.teacherId,
        title: concertCampaignsTable.title,
        description: concertCampaignsTable.description,
        coverImageUrl: concertCampaignsTable.coverImageUrl,
        scheduledDate: concertCampaignsTable.scheduledDate,
        venueName: concertCampaignsTable.venueName,
        ticketPriceCents: concertCampaignsTable.ticketPriceCents,
        goalCount: concertCampaignsTable.goalCount,
        deadlineAt: concertCampaignsTable.deadlineAt,
        status: concertCampaignsTable.status,
        createdAt: concertCampaignsTable.createdAt,
        teacherFirstName: usersTable.firstName,
        teacherLastName: usersTable.lastName,
        teacherProfileImageUrl: teacherProfilesTable.profileImageUrl,
      })
      .from(concertCampaignsTable)
      .leftJoin(usersTable, eq(concertCampaignsTable.teacherId, usersTable.id))
      .leftJoin(teacherProfilesTable, eq(concertCampaignsTable.teacherId, teacherProfilesTable.userId))
      .where(eq(concertCampaignsTable.status, "active"))
      .orderBy(concertCampaignsTable.deadlineAt)
      .limit(50);

    const withCounts = await Promise.all(campaigns.map(async (c) => ({
      ...c,
      ticketsSold: await getCampaignTicketCount(c.id),
    })));

    res.json({ campaigns: withCounts, total: withCounts.length });
  } catch (err) {
    logger.error({ err }, "Failed to list campaigns");
    res.status(500).json({ error: "Failed to list campaigns" });
  }
});

// /campaigns/my must be before /campaigns/:id — prevents Express treating "my" as a numeric ID
router.get("/campaigns/my", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  try {
    const campaigns = await db
      .select()
      .from(concertCampaignsTable)
      .where(eq(concertCampaignsTable.teacherId, userId))
      .orderBy(concertCampaignsTable.createdAt);

    const withStats = await Promise.all(campaigns.map(async (c) => {
      const ticketsSold = await getCampaignTicketCount(c.id);
      const [backerRow] = await db.select({ count: count() }).from(campaignTicketsTable)
        .where(and(eq(campaignTicketsTable.campaignId, c.id), ne(campaignTicketsTable.status, "cancelled")));
      const grossRaisedCents = ticketsSold * c.ticketPriceCents;
      const platformFeeCents = Math.round(grossRaisedCents * PLATFORM_FEE_RATE);
      return {
        ...c,
        ticketsSold,
        backerCount: Number(backerRow?.count ?? 0),
        grossRaisedCents,
        platformFeeCents,
        netRaisedCents: grossRaisedCents - platformFeeCents,
      };
    }));

    res.json({ campaigns: withStats });
  } catch (err) {
    logger.error({ err }, "Failed to list my campaigns");
    res.status(500).json({ error: "Failed to list campaigns" });
  }
});

router.get("/campaigns/:id", async (req, res): Promise<void> => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  try {
    const [campaign] = await db
      .select({
        id: concertCampaignsTable.id,
        teacherId: concertCampaignsTable.teacherId,
        title: concertCampaignsTable.title,
        description: concertCampaignsTable.description,
        coverImageUrl: concertCampaignsTable.coverImageUrl,
        scheduledDate: concertCampaignsTable.scheduledDate,
        venueName: concertCampaignsTable.venueName,
        ticketPriceCents: concertCampaignsTable.ticketPriceCents,
        goalCount: concertCampaignsTable.goalCount,
        deadlineAt: concertCampaignsTable.deadlineAt,
        status: concertCampaignsTable.status,
        createdAt: concertCampaignsTable.createdAt,
        teacherFirstName: usersTable.firstName,
        teacherLastName: usersTable.lastName,
        teacherProfileImageUrl: teacherProfilesTable.profileImageUrl,
      })
      .from(concertCampaignsTable)
      .leftJoin(usersTable, eq(concertCampaignsTable.teacherId, usersTable.id))
      .leftJoin(teacherProfilesTable, eq(concertCampaignsTable.teacherId, teacherProfilesTable.userId))
      .where(eq(concertCampaignsTable.id, id));

    if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }

    const ticketsSold = await getCampaignTicketCount(id);
    const [backerRow] = await db.select({ count: count() }).from(campaignTicketsTable)
      .where(and(eq(campaignTicketsTable.campaignId, id), ne(campaignTicketsTable.status, "cancelled")));

    res.json({ ...campaign, ticketsSold, backerCount: Number(backerRow?.count ?? 0) });
  } catch (err) {
    logger.error({ err }, "Failed to get campaign");
    res.status(500).json({ error: "Failed to get campaign" });
  }
});

// ─── Teacher-only mutation routes ─────────────────────────────────────────────

router.post("/campaigns", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const { title, description, coverImageUrl, scheduledDate, venueName, ticketPriceCents, goalCount, deadlineAt } = req.body as {
    title?: string; description?: string; coverImageUrl?: string; scheduledDate?: string;
    venueName?: string; ticketPriceCents?: number; goalCount?: number; deadlineAt?: string;
  };

  if (!title || !ticketPriceCents || !goalCount || !deadlineAt) {
    res.status(400).json({ error: "title, ticketPriceCents, goalCount, and deadlineAt are required" });
    return;
  }
  if (ticketPriceCents < 100) { res.status(400).json({ error: "Ticket price must be at least $1" }); return; }
  if (goalCount < 1) { res.status(400).json({ error: "Goal must be at least 1 ticket" }); return; }

  const deadline = new Date(deadlineAt);
  if (isNaN(deadline.getTime())) { res.status(400).json({ error: "Invalid deadlineAt date" }); return; }
  if (deadline > new Date(Date.now() + MAX_CAMPAIGN_DAYS * 24 * 60 * 60 * 1000)) {
    res.status(400).json({ error: `Deadline cannot be more than ${MAX_CAMPAIGN_DAYS} days from now` });
    return;
  }
  if (deadline <= new Date()) { res.status(400).json({ error: "Deadline must be in the future" }); return; }

  try {
    const [campaign] = await db
      .insert(concertCampaignsTable)
      .values({ teacherId: userId, title, description, coverImageUrl, scheduledDate, venueName, ticketPriceCents, goalCount, deadlineAt: deadline })
      .returning();
    res.status(201).json({
      campaign: { ...campaign, ticketsSold: 0, backerCount: 0, grossRaisedCents: 0, platformFeeCents: 0, netRaisedCents: 0 },
    });
  } catch (err) {
    logger.error({ err }, "Failed to create campaign");
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

router.patch("/campaigns/:id", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db.select().from(concertCampaignsTable)
    .where(and(eq(concertCampaignsTable.id, id), eq(concertCampaignsTable.teacherId, userId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (campaign.status !== "active") { res.status(400).json({ error: "Only active campaigns can be updated" }); return; }

  const { title, description, coverImageUrl, scheduledDate, venueName } = req.body as Record<string, string>;
  const [updated] = await db.update(concertCampaignsTable)
    .set({
      title: title ?? campaign.title,
      description: description ?? campaign.description,
      coverImageUrl: coverImageUrl ?? campaign.coverImageUrl,
      scheduledDate: scheduledDate ?? campaign.scheduledDate,
      venueName: venueName ?? campaign.venueName,
      updatedAt: new Date(),
    })
    .where(eq(concertCampaignsTable.id, id))
    .returning();

  const ticketsSold = await getCampaignTicketCount(id);
  const grossRaisedCents = ticketsSold * updated.ticketPriceCents;
  const platformFeeCents = Math.round(grossRaisedCents * PLATFORM_FEE_RATE);
  res.json({ campaign: { ...updated, ticketsSold, backerCount: 0, grossRaisedCents, platformFeeCents, netRaisedCents: grossRaisedCents - platformFeeCents } });
});

router.post("/campaigns/:id/cancel", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db.select().from(concertCampaignsTable)
    .where(and(eq(concertCampaignsTable.id, id), eq(concertCampaignsTable.teacherId, userId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (campaign.status !== "active") { res.status(400).json({ error: "Only active campaigns can be cancelled" }); return; }

  try {
    const won = await atomicTransitionFromActive(id, "cancelled");
    if (!won) { res.status(409).json({ error: "Campaign already transitioned" }); return; }

    const tickets = await db.select().from(campaignTicketsTable)
      .where(and(eq(campaignTicketsTable.campaignId, id), eq(campaignTicketsTable.status, "authorised")));
    const stripe = await getUncachableStripeClient();

    for (const ticket of tickets) {
      try {
        if (ticket.stripePaymentIntentId) {
          await stripe.paymentIntents.cancel(
            ticket.stripePaymentIntentId,
            {},
            { idempotencyKey: `campaign_cancel_${id}_${ticket.id}` },
          );
        }
        await db.update(campaignTicketsTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(campaignTicketsTable.id, ticket.id));
        if (ticket.buyerEmail) {
          await sendEmail({
            to: ticket.buyerEmail,
            subject: `Campaign cancelled — ${campaign.title}`,
            html: `<p>Hi ${ticket.buyerName ?? "there"},</p>
<p>The campaign for <strong>${campaign.title}</strong> was cancelled. Your card authorization has been cancelled — no charge was made.</p>
<p style="color:#999;font-size:12px;">Powered by Harmonia</p>`,
          }).catch((e) => logger.error({ e, ticketId: ticket.id }, "Failed to send cancel email"));
        }
      } catch (err) {
        logger.error({ err, ticketId: ticket.id }, "Failed to cancel PI during campaign cancellation");
      }
    }
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to cancel campaign");
    res.status(500).json({ error: "Failed to cancel campaign" });
  }
});

router.get("/campaigns/:id/tickets", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db.select().from(concertCampaignsTable)
    .where(and(eq(concertCampaignsTable.id, id), eq(concertCampaignsTable.teacherId, userId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found or access denied" }); return; }

  const tickets = await db.select().from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, id), ne(campaignTicketsTable.status, "cancelled")))
    .orderBy(campaignTicketsTable.createdAt);

  res.json({ tickets });
});

// ─── Fan checkout (manual-capture PaymentIntent) ──────────────────────────────
//
// Card is authorized (held) at checkout with capture_method:"manual".
// No funds are moved at purchase time. On campaign success, the PI is captured
// (funds transferred). On failure/cancel, the PI is cancelled (authorization released).
//
// Campaign deadline is capped at MAX_CAMPAIGN_DAYS (7) days so authorizations
// remain valid through the entire campaign window before capture is attempted.

router.post("/campaigns/:id/checkout", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const { quantity = 1, successUrl, cancelUrl } = req.body as { quantity?: number; successUrl?: string; cancelUrl?: string };

  if (!successUrl || !cancelUrl) { res.status(400).json({ error: "successUrl and cancelUrl are required" }); return; }
  if (quantity < 1 || quantity > 10) { res.status(400).json({ error: "Quantity must be between 1 and 10" }); return; }

  const [campaign] = await db.select().from(concertCampaignsTable).where(eq(concertCampaignsTable.id, id));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (campaign.status !== "active") { res.status(400).json({ error: "This campaign is no longer accepting purchases" }); return; }
  if (campaign.deadlineAt < new Date()) { res.status(400).json({ error: "Campaign deadline has passed" }); return; }

  const [buyer] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  const accessCode = randomUUID();
  const totalPriceCents = campaign.ticketPriceCents * quantity;
  const platformFeeCents = Math.round(totalPriceCents * PLATFORM_FEE_RATE);
  const buyerName = [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ");
  const buyerEmail = buyer?.email ?? "";

  try {
    const stripe = await getUncachableStripeClient();

    const meta: Record<string, string> = {
      type: "campaign_ticket",
      campaign_id: String(id),
      buyer_id: userId,
      quantity: String(quantity),
      access_code: accessCode,
      buyer_email: buyerEmail,
      buyer_name: buyerName,
      total_price_cents: String(totalPriceCents),
      platform_fee_cents: String(platformFeeCents),
    };

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [{
        price_data: {
          currency: "usd",
          product_data: {
            name: `${campaign.title} — Crowdfunding Ticket${quantity > 1 ? ` (×${quantity})` : ""}`,
            description: `Authorized now, only charged if the campaign reaches ${campaign.goalCount} tickets by deadline. Authorization released if goal is not met.`,
          },
          unit_amount: campaign.ticketPriceCents,
        },
        quantity,
      }],
      payment_intent_data: {
        capture_method: "manual",
        metadata: meta,
      },
      metadata: meta,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    logger.info({ campaignId: id, sessionId: session.id, quantity, totalPriceCents }, "Campaign checkout session created (manual-capture authorization)");
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    logger.error({ err }, "Failed to create campaign checkout");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ─── Deadline sweep ───────────────────────────────────────────────────────────
// Runs periodically (e.g., hourly). Two passes:
//  1. Active campaigns past deadline → succeed or fail
//  2. Settling campaigns → retry captures for tickets with transient errors

export async function expireDeadlinedCampaigns(): Promise<void> {
  try {
    const deadlined = await db
      .select({ id: concertCampaignsTable.id, goalCount: concertCampaignsTable.goalCount })
      .from(concertCampaignsTable)
      .where(and(eq(concertCampaignsTable.status, "active"), lt(concertCampaignsTable.deadlineAt, new Date())));

    for (const c of deadlined) {
      const ticketsSold = await getCampaignTicketCount(c.id);
      if (ticketsSold >= c.goalCount) await processCampaignSuccess(c.id);
      else await processCampaignFailure(c.id);
    }

    // Retry settlement for campaigns with transient capture failures
    const settling = await db
      .select({ id: concertCampaignsTable.id })
      .from(concertCampaignsTable)
      .where(eq(concertCampaignsTable.status, "settling"));

    for (const c of settling) {
      await processCampaignSuccess(c.id);
    }

    if (deadlined.length > 0 || settling.length > 0) {
      logger.info({ deadlined: deadlined.length, retried: settling.length }, "Campaign sweep completed");
    }
  } catch (err) {
    logger.error({ err }, "Failed to sweep campaigns");
  }
}

export default router;
