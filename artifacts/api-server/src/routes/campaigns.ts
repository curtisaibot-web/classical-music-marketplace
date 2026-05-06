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

// Atomically claim active → newStatus. Returns true if this caller won; false if already transitioned.
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

// Stripe capture errors: permanent (card decline, invalid state) vs transient (network/server).
function isCapturePermanentFailure(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { type?: string };
  return e.type === "StripeCardError" || e.type === "StripeInvalidRequestError";
}

// Capture all authorized PIs for a campaign that has met its goal.
// Flow: active+goal-met → settling (atomic lock) → capture each PI with idempotency key
//       → settling → succeeded when all tickets are terminal.
// Re-entrant: campaigns already "settling" (e.g. from sweep retry) continue from step 2.
// Permanent capture failures cancel the PI and mark the ticket cancelled.
// Transient failures leave the ticket "authorised" for the next sweep retry.
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
    const won = await atomicTransitionFromActive(campaignId, "settling");
    if (!won) return;
    logger.info({ campaignId, goalCount: campaign.goalCount }, "Campaign entering settling");
  }

  const tickets = await db
    .select()
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "authorised")));

  const stripe = await getUncachableStripeClient();

  for (const ticket of tickets) {
    if (!ticket.stripePaymentIntentId) {
      logger.error({ campaignId, ticketId: ticket.id }, "No PI ID on ticket — skipping; needs manual reconciliation");
      continue;
    }
    try {
      await stripe.paymentIntents.capture(
        ticket.stripePaymentIntentId,
        {},
        { idempotencyKey: `campaign_capture_${campaignId}_${ticket.id}` },
      );
      await db.update(campaignTicketsTable)
        .set({ status: "captured", updatedAt: new Date() })
        .where(eq(campaignTicketsTable.id, ticket.id));
    } catch (captureErr) {
      if (isCapturePermanentFailure(captureErr)) {
        logger.warn({ captureErr, campaignId, ticketId: ticket.id }, "Permanent capture failure — cancelling PI and marking ticket cancelled");
        try {
          await stripe.paymentIntents.cancel(
            ticket.stripePaymentIntentId,
            {},
            { idempotencyKey: `campaign_capture_cancel_${campaignId}_${ticket.id}` },
          );
        } catch (cancelErr) {
          logger.error({ cancelErr, ticketId: ticket.id }, "Failed to cancel PI after capture failure");
        }
        await db.update(campaignTicketsTable)
          .set({ status: "cancelled", updatedAt: new Date() })
          .where(eq(campaignTicketsTable.id, ticket.id));
      } else {
        logger.error({ captureErr, campaignId, ticketId: ticket.id }, "Transient capture error — leaving authorised for sweep retry");
      }
    }
  }

  const [{ remaining }] = await db
    .select({ remaining: count() })
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "authorised")));

  if (Number(remaining) > 0) {
    logger.warn({ campaignId, remaining: Number(remaining) }, "Settlement incomplete — sweep will retry");
    return;
  }

  const capturedRows = await db
    .select({ piId: campaignTicketsTable.stripePaymentIntentId })
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "captured")));
  const allPiIds = capturedRows.map((r) => r.piId).filter(Boolean) as string[];

  // Policy: campaign succeeds based on the original pledge count reaching goal, even if
  // some captures fail permanently after settlement begins (e.g., card decline post-auth).
  // Those tickets are cancelled and no charge is made; successfully captured tickets proceed.
  // This is consistent with standard crowdfunding practice.

  // Atomically claim the settling → succeeded transition.
  // Only the invocation that wins this update sends confirmation emails,
  // preventing duplicate emails under concurrent webhook + sweep execution.
  const [transitioned] = await db
    .update(concertCampaignsTable)
    .set({ status: "succeeded", stripePaymentIntentIds: allPiIds, updatedAt: new Date() })
    .where(and(eq(concertCampaignsTable.id, campaignId), eq(concertCampaignsTable.status, "settling")))
    .returning({ id: concertCampaignsTable.id });

  if (!transitioned) {
    logger.info({ campaignId }, "settling → succeeded transition already claimed by another invocation — skipping emails");
    return;
  }

  logger.info({ campaignId, captured: allPiIds.length }, "Campaign succeeded");

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
<p>The campaign for <strong>${campaign.title}</strong> reached its goal. Your ${ticket.quantity} ticket${ticket.quantity > 1 ? "s are" : " is"} confirmed — $${(ticket.totalPriceCents / 100).toFixed(2)} captured.</p>
${campaign.scheduledDate ? `<p><strong>Date:</strong> ${campaign.scheduledDate}</p>` : ""}
${campaign.venueName ? `<p><strong>Venue:</strong> ${campaign.venueName}</p>` : ""}
<p><strong>Access Code:</strong> <code>${ticket.accessCode}</code></p>
<img src="${qrDataUrl}" alt="QR Code" width="200" height="200" style="display:block;border:1px solid #eee;" />
<p style="color:#999;font-size:12px;">Powered by Harmonia</p>`,
      });
    } catch (emailErr) {
      logger.error({ emailErr, ticketId: ticket.id }, "Failed to send confirmation email");
    }
  }
}

// Cancel all authorization holds for a failed campaign.
// Transitions active → failed, then cancels PIs per ticket.
// Any PI cancels that fail transiently are retried by the sweep's orphan pass.
export async function processCampaignFailure(campaignId: number): Promise<void> {
  const won = await atomicTransitionFromActive(campaignId, "failed");
  if (!won) return;

  await cancelOrphanedAuthorizations(campaignId);
  logger.info({ campaignId }, "Campaign failed — authorizations cancelled");
}

// Cancel PIs for all "authorised" tickets on a terminal campaign (failed/cancelled).
// Called directly after transition and also retried by the sweep.
async function cancelOrphanedAuthorizations(campaignId: number): Promise<void> {
  const tickets = await db
    .select()
    .from(campaignTicketsTable)
    .where(and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "authorised")));
  if (tickets.length === 0) return;

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
      logger.error({ err, ticketId: ticket.id }, "Failed to cancel PI — sweep will retry");
    }
  }
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

// Must be declared before /campaigns/:id to prevent Express matching "my" as a numeric id.
router.get("/campaigns/my", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
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
    const [backerRow] = await db.select({ count: count() }).from(campaignTicketsTable)
      .where(and(eq(campaignTicketsTable.campaignId, id), ne(campaignTicketsTable.status, "cancelled")));
    res.json({ ...campaign, ticketsSold, backerCount: Number(backerRow?.count ?? 0) });
  } catch (err) {
    logger.error({ err }, "Failed to get campaign");
    res.status(500).json({ error: "Failed to get campaign" });
  }
});

router.post("/campaigns", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
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
  if (deadline <= new Date()) { res.status(400).json({ error: "Deadline must be in the future" }); return; }
  if (deadline > new Date(Date.now() + MAX_CAMPAIGN_DAYS * 24 * 60 * 60 * 1000)) {
    res.status(400).json({ error: `Deadline cannot be more than ${MAX_CAMPAIGN_DAYS} days from now` });
    return;
  }

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
  const userId = getAuth(req).userId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db.select().from(concertCampaignsTable)
    .where(and(eq(concertCampaignsTable.id, id), eq(concertCampaignsTable.teacherId, userId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (campaign.status !== "active") { res.status(400).json({ error: "Only active campaigns can be updated" }); return; }

  const { title, description, coverImageUrl, scheduledDate, venueName } = req.body as Record<string, string>;
  const [updated] = await db.update(concertCampaignsTable)
    .set({ title: title ?? campaign.title, description: description ?? campaign.description, coverImageUrl: coverImageUrl ?? campaign.coverImageUrl, scheduledDate: scheduledDate ?? campaign.scheduledDate, venueName: venueName ?? campaign.venueName, updatedAt: new Date() })
    .where(eq(concertCampaignsTable.id, id))
    .returning();

  const ticketsSold = await getCampaignTicketCount(id);
  const grossRaisedCents = ticketsSold * updated.ticketPriceCents;
  const platformFeeCents = Math.round(grossRaisedCents * PLATFORM_FEE_RATE);
  res.json({ campaign: { ...updated, ticketsSold, backerCount: 0, grossRaisedCents, platformFeeCents, netRaisedCents: grossRaisedCents - platformFeeCents } });
});

router.post("/campaigns/:id/cancel", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid campaign id" }); return; }

  const [campaign] = await db.select().from(concertCampaignsTable)
    .where(and(eq(concertCampaignsTable.id, id), eq(concertCampaignsTable.teacherId, userId)));
  if (!campaign) { res.status(404).json({ error: "Campaign not found" }); return; }
  if (campaign.status !== "active") { res.status(400).json({ error: "Only active campaigns can be cancelled" }); return; }

  try {
    const won = await atomicTransitionFromActive(id, "cancelled");
    if (!won) { res.status(409).json({ error: "Campaign already transitioned" }); return; }
    await cancelOrphanedAuthorizations(id);
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to cancel campaign");
    res.status(500).json({ error: "Failed to cancel campaign" });
  }
});

router.get("/campaigns/:id/tickets", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
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

// Fan checkout: authorizes card with capture_method:"manual". No funds move at purchase.
// On success the PI is captured; on failure/cancel it is cancelled (hold released).
router.post("/campaigns/:id/checkout", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
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
  const totalPriceCents = campaign.ticketPriceCents * quantity;
  const platformFeeCents = Math.round(totalPriceCents * PLATFORM_FEE_RATE);
  const buyerName = [buyer?.firstName, buyer?.lastName].filter(Boolean).join(" ");
  const buyerEmail = buyer?.email ?? "";
  const accessCode = randomUUID();

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
            description: `Authorized now; only charged if campaign reaches ${campaign.goalCount} tickets by deadline.`,
          },
          unit_amount: campaign.ticketPriceCents,
        },
        quantity,
      }],
      payment_intent_data: { capture_method: "manual", metadata: meta },
      metadata: meta,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    logger.info({ campaignId: id, sessionId: session.id, quantity, totalPriceCents }, "Campaign checkout session created");
    res.json({ checkoutUrl: session.url });
  } catch (err) {
    logger.error({ err }, "Failed to create campaign checkout");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

// Periodic sweep (e.g., hourly):
// 1. Active campaigns past deadline → succeed or fail them
// 2. Active campaigns that already met goal → succeed proactively (webhook-failure resilience)
// 3. Settling campaigns → retry captures for transient-error tickets
// 4. Failed/cancelled campaigns with orphaned "authorised" tickets → retry PI cancels
export async function expireDeadlinedCampaigns(): Promise<void> {
  try {
    // Pass 1 & 2: active campaigns
    const activeCampaigns = await db
      .select({ id: concertCampaignsTable.id, goalCount: concertCampaignsTable.goalCount, deadlineAt: concertCampaignsTable.deadlineAt })
      .from(concertCampaignsTable)
      .where(eq(concertCampaignsTable.status, "active"));

    for (const c of activeCampaigns) {
      const ticketsSold = await getCampaignTicketCount(c.id);
      const goalMet = ticketsSold >= c.goalCount;
      const pastDeadline = c.deadlineAt < new Date();

      if (goalMet) {
        await processCampaignSuccess(c.id);
      } else if (pastDeadline) {
        await processCampaignFailure(c.id);
      }
    }

    // Pass 3: retry settling campaigns with transient capture failures
    const settling = await db
      .select({ id: concertCampaignsTable.id })
      .from(concertCampaignsTable)
      .where(eq(concertCampaignsTable.status, "settling"));
    for (const c of settling) {
      await processCampaignSuccess(c.id);
    }

    // Pass 4: cancel orphaned "authorised" tickets on terminal campaigns
    const terminal = await db
      .select({ id: concertCampaignsTable.id })
      .from(concertCampaignsTable)
      .where(inArray(concertCampaignsTable.status, ["failed", "cancelled"]));
    for (const c of terminal) {
      await cancelOrphanedAuthorizations(c.id);
    }

    const counts = { active: activeCampaigns.length, settling: settling.length, terminal: terminal.length };
    if (Object.values(counts).some((n) => n > 0)) {
      logger.info(counts, "Campaign sweep completed");
    }
  } catch (err) {
    logger.error({ err }, "Campaign sweep failed");
  }
}

export default router;
