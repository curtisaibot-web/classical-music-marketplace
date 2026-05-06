import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, ne, count, sum, lt } from "drizzle-orm";
import { db, concertCampaignsTable, campaignTicketsTable, usersTable, teacherProfilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getUncachableStripeClient } from "../stripeClient";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/email";
import { randomUUID } from "crypto";
import QRCode from "qrcode";

const MAX_CAMPAIGN_DAYS = 60;
const PLATFORM_FEE_RATE = 0.08;

const router: IRouter = Router();

async function getCampaignTicketCount(campaignId: number): Promise<number> {
  const [row] = await db
    .select({ total: sum(campaignTicketsTable.quantity) })
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), ne(campaignTicketsTable.status, "cancelled")));
  return Number(row?.total ?? 0);
}

// Atomically claim a campaign status transition from active.
// Uses UPDATE...WHERE status='active' RETURNING which is a single round-trip
// and relies on PostgreSQL row-level locking to prevent concurrent updates.
// Returns true only if this caller won the transition; false if already transitioned.
async function atomicTransition(
  campaignId: number,
  newStatus: "succeeded" | "failed" | "cancelled",
  extra: Record<string, unknown> = {},
): Promise<boolean> {
  const [row] = await db
    .update(concertCampaignsTable)
    .set({ status: newStatus, updatedAt: new Date(), ...extra })
    .where(and(eq(concertCampaignsTable.id, campaignId), eq(concertCampaignsTable.status, "active")))
    .returning({ id: concertCampaignsTable.id });
  return !!row;
}

// Campaign success: LOCK first, then capture.
//
// Order of operations:
//  1. Check goal is met
//  2. Atomically transition campaign to "succeeded" — prevents concurrent
//     webhook + sweep from double-charging backers; only one caller wins
//  3. Capture each authorized PaymentIntent using a per-ticket idempotency key
//     (safe to retry — Stripe returns cached result for duplicate keys)
//  4. Mark ticket "captured" after successful capture
//  5. Failed captures are logged for manual reconciliation; campaign remains
//     "succeeded" so fans with captured tickets get their confirmation
export async function processCampaignSuccess(campaignId: number): Promise<void> {
  const [campaign] = await db
    .select()
    .from(concertCampaignsTable)
    .where(and(eq(concertCampaignsTable.id, campaignId), eq(concertCampaignsTable.status, "active")));
  if (!campaign) return;

  const ticketsSold = await getCampaignTicketCount(campaignId);
  if (ticketsSold < campaign.goalCount) return;

  // Atomically claim the transition BEFORE any Stripe calls.
  // Concurrent processors (webhook, sweep) both attempt this; only one wins.
  const won = await atomicTransition(campaignId, "succeeded");
  if (!won) {
    logger.info({ campaignId }, "Campaign already transitioned — concurrent processor won; skipping");
    return;
  }

  const tickets = await db.select().from(campaignTicketsTable).where(
    and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "authorised")),
  );

  const stripe = await getUncachableStripeClient();
  const capturedPiIds: string[] = [];
  let captureFailures = 0;

  for (const ticket of tickets) {
    if (!ticket.stripePaymentIntentId) {
      captureFailures++;
      logger.error({ campaignId, ticketId: ticket.id }, "Ticket has no PaymentIntent ID — skipping capture; manual reconciliation required");
      continue;
    }
    try {
      // Idempotency key: safe to retry without double-capturing
      await stripe.paymentIntents.capture(
        ticket.stripePaymentIntentId,
        {},
        { idempotencyKey: `campaign_capture_${campaignId}_${ticket.id}` },
      );
      await db.update(campaignTicketsTable)
        .set({ status: "captured", updatedAt: new Date() })
        .where(eq(campaignTicketsTable.id, ticket.id));
      capturedPiIds.push(ticket.stripePaymentIntentId);
    } catch (err) {
      captureFailures++;
      logger.error({ err, campaignId, ticketId: ticket.id, piId: ticket.stripePaymentIntentId },
        "Capture failed — ticket remains authorised; manual reconciliation required");
    }
  }

  // Update campaign with captured PI IDs for audit trail
  await db.update(concertCampaignsTable)
    .set({ stripePaymentIntentIds: capturedPiIds, updatedAt: new Date() })
    .where(eq(concertCampaignsTable.id, campaignId));

  if (captureFailures > 0) {
    logger.warn({ campaignId, captured: capturedPiIds.length, captureFailures, total: tickets.length },
      "Campaign succeeded with partial capture failures — manual reconciliation required for failed tickets");
  } else {
    logger.info({ campaignId, captured: capturedPiIds.length, ticketsSold }, "Campaign succeeded — all payments captured");
  }

  // Send confirmation emails for captured tickets
  for (const ticket of tickets) {
    if (!ticket.buyerEmail || !capturedPiIds.includes(ticket.stripePaymentIntentId ?? "")) continue;
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

// Campaign failure: lock first, then cancel all authorizations.
export async function processCampaignFailure(campaignId: number): Promise<void> {
  const won = await atomicTransition(campaignId, "failed");
  if (!won) {
    logger.info({ campaignId }, "Campaign already transitioned — skipping failure processing");
    return;
  }

  const tickets = await db.select().from(campaignTicketsTable).where(
    and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "authorised")),
  );

  const stripe = await getUncachableStripeClient();
  for (const ticket of tickets) {
    try {
      if (ticket.stripePaymentIntentId) {
        await stripe.paymentIntents.cancel(
          ticket.stripePaymentIntentId,
          {},
          { idempotencyKey: `campaign_cancel_${campaignId}_${ticket.id}` },
        );
      }
      await db.update(campaignTicketsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(campaignTicketsTable.id, ticket.id));
      if (ticket.buyerEmail) {
        await sendEmail({
          to: ticket.buyerEmail,
          subject: `Campaign update — ${campaignId}`,
          html: `<p>Hi ${ticket.buyerName ?? "there"},</p>
<p>The crowdfunding campaign did not reach its goal. Your card authorization has been cancelled — no charge was made.</p>
<p style="color:#999;font-size:12px;">Powered by Harmonia</p>`,
        }).catch((e) => logger.error({ e, ticketId: ticket.id }, "Failed to send failure email"));
      }
    } catch (err) {
      logger.error({ err, ticketId: ticket.id }, "Failed to cancel PaymentIntent for failed campaign");
    }
  }
  logger.info({ campaignId }, "Campaign failed — authorizations cancelled");
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

// /campaigns/my before /campaigns/:id — prevents Express treating "my" as numeric ID
router.get("/campaigns/my", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  try {
    const campaigns = await db.select().from(concertCampaignsTable).where(eq(concertCampaignsTable.teacherId, userId)).orderBy(concertCampaignsTable.createdAt);

    const withStats = await Promise.all(campaigns.map(async (c) => {
      const ticketsSold = await getCampaignTicketCount(c.id);
      const [backerRow] = await db.select({ count: count() }).from(campaignTicketsTable).where(and(eq(campaignTicketsTable.campaignId, c.id), ne(campaignTicketsTable.status, "cancelled")));
      const grossRaisedCents = ticketsSold * c.ticketPriceCents;
      const platformFeeCents = Math.round(grossRaisedCents * PLATFORM_FEE_RATE);
      return { ...c, ticketsSold, backerCount: Number(backerRow?.count ?? 0), grossRaisedCents, platformFeeCents, netRaisedCents: grossRaisedCents - platformFeeCents };
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
    const [backerRow] = await db.select({ count: count() }).from(campaignTicketsTable).where(and(eq(campaignTicketsTable.campaignId, id), ne(campaignTicketsTable.status, "cancelled")));

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
    res.status(201).json({ campaign: { ...campaign, ticketsSold: 0, backerCount: 0, grossRaisedCents: 0, platformFeeCents: 0, netRaisedCents: 0 } });
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

  const [campaign] = await db.select().from(concertCampaignsTable).where(and(eq(concertCampaignsTable.id, id), eq(concertCampaignsTable.teacherId, userId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (campaign.status !== "active") { res.status(400).json({ error: "Only active campaigns can be updated" }); return; }

  const { title, description, coverImageUrl, scheduledDate, venueName } = req.body as Record<string, string>;
  const [updated] = await db
    .update(concertCampaignsTable)
    .set({ title: title ?? campaign.title, description: description ?? campaign.description, coverImageUrl: coverImageUrl ?? campaign.coverImageUrl, scheduledDate: scheduledDate ?? campaign.scheduledDate, venueName: venueName ?? campaign.venueName, updatedAt: new Date() })
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

  const [campaign] = await db.select().from(concertCampaignsTable).where(and(eq(concertCampaignsTable.id, id), eq(concertCampaignsTable.teacherId, userId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (campaign.status !== "active") { res.status(400).json({ error: "Only active campaigns can be cancelled" }); return; }

  try {
    const won = await atomicTransition(id, "cancelled");
    if (!won) { res.status(409).json({ error: "Campaign already transitioned" }); return; }

    const tickets = await db.select().from(campaignTicketsTable).where(
      and(eq(campaignTicketsTable.campaignId, id), eq(campaignTicketsTable.status, "authorised")),
    );
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
        await db.update(campaignTicketsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(campaignTicketsTable.id, ticket.id));
        if (ticket.buyerEmail) {
          await sendEmail({
            to: ticket.buyerEmail,
            subject: `Campaign cancelled — ${campaign.title}`,
            html: `<p>Hi ${ticket.buyerName ?? "there"},</p>
<p>The campaign for <strong>${campaign.title}</strong> was cancelled. Your authorization has been cancelled — no charge was made.</p>
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

  const [campaign] = await db.select().from(concertCampaignsTable).where(and(eq(concertCampaignsTable.id, id), eq(concertCampaignsTable.teacherId, userId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found or access denied" }); return; }

  const tickets = await db
    .select()
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, id), ne(campaignTicketsTable.status, "cancelled")))
    .orderBy(campaignTicketsTable.createdAt);

  res.json({ tickets });
});

// ─── Fan checkout (manual-capture PaymentIntent) ──────────────────────────────
// Card is authorized (held) at checkout; captured on success, cancelled on failure.
// Authorization validity: ~7 days on most networks. Campaigns may exceed this window
// for long (up to 60-day) campaigns — captures that fail due to expired authorization
// are logged for manual reconciliation.

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
    const meta = {
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
            name: `${campaign.title} — Crowdfunding Ticket${quantity > 1 ? `s (×${quantity})` : ""}`,
            description: `Authorized now, only charged if the campaign reaches ${campaign.goalCount} tickets by ${campaign.deadlineAt.toLocaleDateString()}. Platform fee 8% on success.`,
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

    logger.info({ campaignId: id, sessionId: session.id, quantity, totalPriceCents, platformFeeCents }, "Campaign checkout session created (manual-capture)");
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    logger.error({ err }, "Failed to create campaign checkout");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// ─── Deadline sweep ───────────────────────────────────────────────────────────

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
    if (deadlined.length > 0) logger.info({ count: deadlined.length }, "Processed deadlined campaigns");
  } catch (err) {
    logger.error({ err }, "Failed to process deadlined campaigns");
  }
}

export default router;
