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

// 60-day max is supported because we use SetupIntent (card saved at checkout,
// charged only at success time). No authorization hold that could expire.
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

// Atomically transition campaign status from active → succeeded/failed/cancelled.
// Returns true if this process "won" the transition; false if another process beat it.
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

// SetupIntent approach: PaymentIntents are created + confirmed off-session at success time.
// No authorization holds at checkout, so 60-day campaign duration is safe.
export async function processCampaignSuccess(campaignId: number): Promise<void> {
  const [campaign] = await db
    .select()
    .from(concertCampaignsTable)
    .where(and(eq(concertCampaignsTable.id, campaignId), eq(concertCampaignsTable.status, "active")));
  if (!campaign) return;

  const ticketsSold = await getCampaignTicketCount(campaignId);
  if (ticketsSold < campaign.goalCount) return;

  const tickets = await db.select().from(campaignTicketsTable).where(
    and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "authorised")),
  );

  const stripe = await getUncachableStripeClient();
  const capturedPiIds: string[] = [];
  const capturedTicketIds: number[] = [];
  let failed = false;

  for (const ticket of tickets) {
    if (!ticket.stripePaymentMethodId) {
      logger.error({ campaignId, ticketId: ticket.id }, "No payment method ID on ticket — cannot charge");
      failed = true;
      break;
    }
    try {
      const pi = await stripe.paymentIntents.create({
        amount: ticket.totalPriceCents,
        currency: "usd",
        customer: ticket.stripeCustomerId ?? undefined,
        payment_method: ticket.stripePaymentMethodId,
        confirm: true,
        off_session: true,
        metadata: { type: "campaign_ticket_capture", campaign_id: String(campaignId), ticket_id: String(ticket.id) },
      });
      capturedPiIds.push(pi.id);
      capturedTicketIds.push(ticket.id);
    } catch (err) {
      logger.error({ err, campaignId, ticketId: ticket.id }, "Off-session charge failed — rolling back");
      failed = true;
      break;
    }
  }

  if (failed) {
    // Refund already-charged tickets then fail the campaign
    for (const piId of capturedPiIds) {
      try {
        await stripe.refunds.create({ payment_intent: piId });
      } catch (err) {
        logger.error({ err, piId }, "Refund failed during rollback — manual intervention required");
      }
    }
    await processCampaignFailure(campaignId);
    return;
  }

  // Atomically mark campaign succeeded (guard against concurrent processors)
  const won = await atomicTransition(campaignId, "succeeded", { stripePaymentIntentIds: capturedPiIds });
  if (!won) {
    logger.warn({ campaignId }, "Campaign already transitioned by another process — skipping");
    return;
  }

  for (const ticketId of capturedTicketIds) {
    const pi = capturedPiIds[capturedTicketIds.indexOf(ticketId)];
    await db.update(campaignTicketsTable)
      .set({ status: "captured", stripePaymentIntentId: pi, updatedAt: new Date() })
      .where(eq(campaignTicketsTable.id, ticketId));
  }

  logger.info({ campaignId, charged: capturedPiIds.length, ticketsSold }, "Campaign succeeded — all payments charged");

  for (const ticket of tickets) {
    if (!ticket.buyerEmail) continue;
    try {
      const qrDataUrl = await QRCode.toDataURL(ticket.accessCode ?? String(ticket.id), { width: 200, margin: 2 });
      await sendEmail({
        to: ticket.buyerEmail,
        subject: `Your tickets are confirmed — ${campaign.title}`,
        html: `<p>Great news, ${ticket.buyerName ?? "music fan"}!</p>
<p>The campaign for <strong>${campaign.title}</strong> reached its goal. Your ${ticket.quantity} ticket${ticket.quantity > 1 ? "s are" : " is"} confirmed and $${(ticket.totalPriceCents / 100).toFixed(2)} has been charged.</p>
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

export async function processCampaignFailure(campaignId: number): Promise<void> {
  const won = await atomicTransition(campaignId, "failed");
  if (!won) return;

  const tickets = await db.select().from(campaignTicketsTable).where(
    and(eq(campaignTicketsTable.campaignId, campaignId), eq(campaignTicketsTable.status, "authorised")),
  );

  const stripe = await getUncachableStripeClient();
  for (const ticket of tickets) {
    try {
      if (ticket.stripePaymentMethodId) {
        await stripe.paymentMethods.detach(ticket.stripePaymentMethodId);
      }
      await db.update(campaignTicketsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(campaignTicketsTable.id, ticket.id));
      if (ticket.buyerEmail) {
        await sendEmail({
          to: ticket.buyerEmail,
          subject: `Campaign update — ${ticket.campaignId}`,
          html: `<p>Hi ${ticket.buyerName ?? "there"},</p>
<p>The crowdfunding campaign did not reach its goal. Your saved payment method has been removed — no charge was made.</p>
<p style="color:#999;font-size:12px;">Powered by Harmonia</p>`,
        }).catch((e) => logger.error({ e, ticketId: ticket.id }, "Failed to send failure email"));
      }
    } catch (err) {
      logger.error({ err, ticketId: ticket.id }, "Failed to clean up ticket on campaign failure");
    }
  }
  logger.info({ campaignId }, "Campaign failed — payment methods detached");
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

// /campaigns/my must be before /campaigns/:id to prevent Express matching "my" as a numeric ID
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
        if (ticket.stripePaymentMethodId) await stripe.paymentMethods.detach(ticket.stripePaymentMethodId);
        await db.update(campaignTicketsTable).set({ status: "cancelled", updatedAt: new Date() }).where(eq(campaignTicketsTable.id, ticket.id));
        if (ticket.buyerEmail) {
          await sendEmail({
            to: ticket.buyerEmail,
            subject: `Campaign cancelled — ${campaign.title}`,
            html: `<p>Hi ${ticket.buyerName ?? "there"},</p>
<p>The campaign for <strong>${campaign.title}</strong> was cancelled. Your saved payment method has been removed — no charge was made.</p>
<p style="color:#999;font-size:12px;">Powered by Harmonia</p>`,
          }).catch((e) => logger.error({ e, ticketId: ticket.id }, "Failed to send cancel email"));
        }
      } catch (err) {
        logger.error({ err, ticketId: ticket.id }, "Failed to clean up ticket during cancellation");
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

// ─── Fan checkout (SetupIntent flow) ─────────────────────────────────────────

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

    // Find or create a Stripe Customer so the saved payment method can be used off-session
    let stripeCustomerId: string | undefined;
    if (buyerEmail) {
      const existing = await stripe.customers.list({ email: buyerEmail, limit: 1 });
      stripeCustomerId = existing.data[0]?.id ?? (await stripe.customers.create({ email: buyerEmail, name: buyerName || undefined, metadata: { harmonia_user_id: userId } })).id;
    }

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
      stripe_customer_id: stripeCustomerId ?? "",
    };

    const session = await stripe.checkout.sessions.create({
      mode: "setup",
      payment_method_types: ["card"],
      customer: stripeCustomerId,
      setup_intent_data: { metadata: meta },
      metadata: meta,
      success_url: successUrl,
      cancel_url: cancelUrl,
      custom_text: {
        submit: {
          message: `Your card will only be charged $${(totalPriceCents / 100).toFixed(2)} if "${campaign.title}" reaches ${campaign.goalCount} tickets by ${campaign.deadlineAt.toLocaleDateString()}.`,
        },
      },
    });

    logger.info({ campaignId: id, sessionId: session.id, quantity, totalPriceCents, platformFeeCents }, "Campaign SetupIntent checkout session created");
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
