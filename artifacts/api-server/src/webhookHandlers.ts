import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { db, bookingsTable, ordersTable, digitalProductsTable, subscriptionsTable, campaignTicketsTable, concertCampaignsTable, programEnrollmentsTable, auditionProgramsTable } from "@workspace/db";
import { processCampaignSuccess } from "./routes/campaigns";
import { getStripeSync, getUncachableStripeClient, getStripeCredentials } from "./stripeClient";
import { logger } from "./lib/logger";
import { normalizeStripeStatus } from "./routes/subscriptions";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "Received type: " + typeof payload + ". " +
        "FIX: Ensure webhook route is registered BEFORE app.use(express.json()).",
      );
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    const { webhookSecret } = await getStripeCredentials();
    if (webhookSecret) {
      const stripe = await getUncachableStripeClient();
      const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
      await handleStripeEvent(event);
    }
  }
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  logger.info({ eventType: event.type, eventId: event.id }, "Processing Stripe event");

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await handleCheckoutSessionCompleted(session, event.id);
  } else if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await handlePaymentIntentSucceeded(paymentIntent, event.id);
  } else if (
    event.type === "customer.subscription.updated" ||
    event.type === "customer.subscription.created"
  ) {
    const sub = event.data.object as Stripe.Subscription;
    await handleSubscriptionUpdated(sub, event.id);
  } else if (event.type === "customer.subscription.deleted") {
    const sub = event.data.object as Stripe.Subscription;
    await handleSubscriptionDeleted(sub, event.id);
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
): Promise<void> {
  const metadata = session.metadata ?? {};
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  if (metadata.type === "business_suite") {
    const userId = metadata.userId as string | undefined;
    if (!userId) {
      logger.warn({ sessionId: session.id, eventId }, "Business Suite checkout without userId in metadata");
      return;
    }
    const stripe = await getUncachableStripeClient();
    const rawSub = session.subscription;
    const subscriptionId = typeof rawSub === "string" ? rawSub : (rawSub as { id?: string } | null)?.id ?? null;
    if (!subscriptionId) {
      logger.warn({ sessionId: session.id, eventId }, "Business Suite checkout without subscription ID");
      return;
    }
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const itemPeriodEnd = sub.items.data[0]?.current_period_end ?? null;
    const periodEnd = itemPeriodEnd ? new Date(itemPeriodEnd * 1000) : null;

    await db
      .insert(subscriptionsTable)
      .values({
        userId,
        stripeCustomerId: customerId,
        stripeSubscriptionId: sub.id,
        stripePriceId: sub.items.data[0]?.price.id ?? null,
        status: normalizeStripeStatus(sub.status),
        currentPeriodEnd: periodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptionsTable.userId,
        set: {
          stripeSubscriptionId: sub.id,
          stripePriceId: sub.items.data[0]?.price.id ?? null,
          status: normalizeStripeStatus(sub.status),
          currentPeriodEnd: periodEnd,
          updatedAt: new Date(),
        },
      });

    logger.info({ userId, status: sub.status, sessionId: session.id, eventId }, "Business Suite subscription activated via checkout");
    return;
  }

  if (metadata.booking_id) {
    const bookingId = parseInt(metadata.booking_id, 10);
    if (isNaN(bookingId)) {
      throw new Error(`Invalid booking_id in session metadata: ${metadata.booking_id}`);
    }

    const [existing] = await db
      .select({ status: bookingsTable.status })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId));

    if (!existing) {
      throw new Error(`Booking ${bookingId} not found for checkout session ${session.id} (event ${eventId})`);
    }

    const updatedBookings = await db
      .update(bookingsTable)
      .set({
        status: "confirmed",
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
      })
      .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.status, "pending")))
      .returning({ id: bookingsTable.id });
    if (updatedBookings.length > 0) {
      logger.info({ bookingId, sessionId: session.id, eventId }, "Booking confirmed via checkout.session.completed");
    } else {
      logger.info({ bookingId, eventId }, "Booking already in non-pending state — skipping idempotent update");
    }
  }

  if (metadata.order_id) {
    const orderId = parseInt(metadata.order_id, 10);
    if (isNaN(orderId)) {
      throw new Error(`Invalid order_id in session metadata: ${metadata.order_id}`);
    }

    const [existing] = await db
      .select({ status: ordersTable.status })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));

    if (!existing) {
      throw new Error(`Order ${orderId} not found for checkout session ${session.id} (event ${eventId})`);
    }

    const updatedOrders = await db
      .update(ordersTable)
      .set({
        status: "paid",
        paidAt: new Date(),
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
      })
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "pending")))
      .returning({ id: ordersTable.id });
    if (updatedOrders.length > 0) {
      logger.info({ orderId, sessionId: session.id, eventId }, "Order paid via checkout.session.completed");
      await unlockDigitalDownload(orderId);
    } else {
      logger.info({ orderId, eventId }, "Order already in non-pending state — skipping idempotent update");
    }
  }

  if (metadata.type === "program_enrollment" && metadata.enrollment_id) {
    const enrollmentId = parseInt(metadata.enrollment_id, 10);
    if (isNaN(enrollmentId)) {
      throw new Error(`Invalid enrollment_id in session metadata: ${metadata.enrollment_id}`);
    }

    // Atomically claim the pending enrollment — exactly-once guarantee even under duplicate webhooks.
    // If status is already active/completed this returns no rows and the block is skipped.
    const [activatedEnrollment] = await db
      .update(programEnrollmentsTable)
      .set({
        status: "active",
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId: paymentIntentId,
        paidAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(programEnrollmentsTable.id, enrollmentId), eq(programEnrollmentsTable.status, "pending")))
      .returning();

    if (!activatedEnrollment) {
      logger.info({ enrollmentId, eventId }, "Enrollment already in non-pending state — idempotent skip");
    } else {
      // Enrollment transitioned for the first time — create the paid order record.
      const [program] = await db
        .select()
        .from(auditionProgramsTable)
        .where(eq(auditionProgramsTable.id, activatedEnrollment.programId));

      let orderId: number | undefined;
      if (program) {
        const priceInCents = (session.amount_total != null && session.amount_total > 0)
          ? session.amount_total
          : program.priceCents;
        const platformFee = Math.round(priceInCents * 0.15);
        const [newOrder] = await db
          .insert(ordersTable)
          .values({
            buyerId: activatedEnrollment.studentId,
            sellerId: program.teacherId,
            type: "program_enrollment",
            status: "paid",
            priceInCents,
            platformFeeInCents: platformFee,
            stripePaymentIntentId: paymentIntentId ?? null,
            stripeCheckoutSessionId: session.id,
            paidAt: new Date(),
          })
          .returning({ id: ordersTable.id });
        orderId = newOrder?.id;
      }

      // Link the order back to the enrollment
      if (orderId) {
        await db
          .update(programEnrollmentsTable)
          .set({ orderId })
          .where(eq(programEnrollmentsTable.id, enrollmentId));
      }

      logger.info({ enrollmentId, orderId, sessionId: session.id, eventId }, "Program enrollment activated and order created");
    }
  }

  if (metadata.type === "campaign_ticket" && metadata.campaign_id) {
    const campaignId = parseInt(metadata.campaign_id, 10);
    if (isNaN(campaignId)) {
      throw new Error(`Invalid campaign_id in session metadata: ${metadata.campaign_id}`);
    }

    const buyerId = metadata.buyer_id as string | undefined;
    if (!buyerId) {
      logger.warn({ sessionId: session.id, eventId }, "Campaign ticket checkout without buyer_id in metadata");
      return;
    }

    // Idempotency check — skip if ticket already recorded for this session
    const [existing] = await db
      .select({ id: campaignTicketsTable.id })
      .from(campaignTicketsTable)
      .where(eq(campaignTicketsTable.stripeCheckoutSessionId, session.id));

    if (existing) {
      logger.info({ ticketId: existing.id, sessionId: session.id, eventId }, "Campaign ticket already recorded — idempotent skip");
    } else {
      // Race condition guard: verify campaign is still active before recording the authorization.
      // If campaign transitioned since checkout started, immediately cancel the PaymentIntent
      // to release the authorization hold — no charge has occurred.
      const [campaignCheck] = await db
        .select({ status: concertCampaignsTable.status, deadlineAt: concertCampaignsTable.deadlineAt })
        .from(concertCampaignsTable)
        .where(eq(concertCampaignsTable.id, campaignId));

      const isInactive = !campaignCheck ||
        campaignCheck.status !== "active" ||
        (campaignCheck.deadlineAt && new Date(campaignCheck.deadlineAt) < new Date());

      if (isInactive) {
        // Cancel the PI to release the authorization hold — fan's card is never charged
        if (paymentIntentId) {
          try {
            const stripe = await getUncachableStripeClient();
            await stripe.paymentIntents.cancel(paymentIntentId);
            logger.info({ paymentIntentId, campaignId, sessionId: session.id }, "Cancelled PI authorization — campaign inactive at checkout completion");
          } catch (err) {
            logger.error({ err, paymentIntentId }, "Failed to cancel PI for inactive campaign — manual action required");
          }
        }
        return;
      }

      const quantity = parseInt(String(metadata.quantity ?? "1"), 10);
      const accessCode = (metadata.access_code as string | undefined) ?? randomUUID();
      const buyerEmail = (metadata.buyer_email as string | undefined) || undefined;
      const buyerName = (metadata.buyer_name as string | undefined) || undefined;
      const totalPriceCents = parseInt(String(metadata.total_price_cents ?? "0"), 10) || 0;
      const platformFeeCents = parseInt(String(metadata.platform_fee_cents ?? "0"), 10) || 0;

      const [ticket] = await db
        .insert(campaignTicketsTable)
        .values({
          campaignId,
          buyerId,
          buyerEmail: buyerEmail || null,
          buyerName: buyerName || null,
          quantity,
          totalPriceCents,
          platformFeeCents,
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId ?? null,
          accessCode,
          status: "authorised",
        })
        .returning();

      logger.info({ campaignId, ticketId: ticket.id, sessionId: session.id, eventId, paymentIntentId }, "Campaign ticket authorised (manual-capture hold)");
    }

    await processCampaignSuccess(campaignId).catch((err) => {
      logger.error({ err, campaignId }, "Failed to check campaign success after ticket recorded");
    });
  }
}

async function handlePaymentIntentSucceeded(
  paymentIntent: Stripe.PaymentIntent,
  eventId: string,
): Promise<void> {
  const metadata = paymentIntent.metadata ?? {};

  if (metadata.booking_id) {
    const bookingId = parseInt(metadata.booking_id, 10);
    if (isNaN(bookingId)) {
      throw new Error(`Invalid booking_id in payment_intent metadata: ${metadata.booking_id}`);
    }

    const updatedBookings = await db
      .update(bookingsTable)
      .set({
        status: "confirmed",
        stripePaymentIntentId: paymentIntent.id,
      })
      .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.status, "pending")))
      .returning({ id: bookingsTable.id });
    if (updatedBookings.length > 0) {
      logger.info({ bookingId, paymentIntentId: paymentIntent.id, eventId }, "Booking confirmed via payment_intent.succeeded");
    } else {
      logger.info({ bookingId, eventId }, "Booking already in non-pending state — skipping idempotent update");
    }
  }

  if (metadata.order_id) {
    const orderId = parseInt(metadata.order_id, 10);
    if (isNaN(orderId)) {
      throw new Error(`Invalid order_id in payment_intent metadata: ${metadata.order_id}`);
    }

    const updatedOrders = await db
      .update(ordersTable)
      .set({
        status: "paid",
        paidAt: new Date(),
        stripePaymentIntentId: paymentIntent.id,
      })
      .where(and(eq(ordersTable.id, orderId), eq(ordersTable.status, "pending")))
      .returning({ id: ordersTable.id });
    if (updatedOrders.length > 0) {
      logger.info({ orderId, paymentIntentId: paymentIntent.id, eventId }, "Order paid via payment_intent.succeeded");
      await unlockDigitalDownload(orderId);
    } else {
      logger.info({ orderId, eventId }, "Order already in non-pending state — skipping idempotent update");
    }
  }
}

async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
  eventId: string,
): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const userId = (sub.metadata?.userId as string | undefined) ?? null;

  if (!userId) {
    const [existing] = await db
      .select({ userId: subscriptionsTable.userId })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.stripeCustomerId, customerId));
    if (!existing?.userId) {
      logger.warn({ customerId, eventId }, "No userId found for subscription update — skipping");
      return;
    }
    await syncSubscription(existing.userId, sub, eventId);
    return;
  }
  await syncSubscription(userId, sub, eventId);
}

async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
  eventId: string,
): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const [existing] = await db
    .select({ userId: subscriptionsTable.userId })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.stripeCustomerId, customerId));

  if (!existing?.userId) {
    logger.warn({ customerId, eventId }, "No userId found for subscription deletion — skipping");
    return;
  }

  await db
    .update(subscriptionsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(subscriptionsTable.userId, existing.userId));

  logger.info({ userId: existing.userId, eventId }, "Business Suite subscription cancelled");
}

async function syncSubscription(
  userId: string,
  sub: Stripe.Subscription,
  eventId: string,
): Promise<void> {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const itemPeriodEnd = sub.items.data[0]?.current_period_end ?? null;
  const periodEnd = itemPeriodEnd ? new Date(itemPeriodEnd * 1000) : null;

  await db
    .insert(subscriptionsTable)
    .values({
      userId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      stripePriceId: sub.items.data[0]?.price.id ?? null,
      status: normalizeStripeStatus(sub.status),
      currentPeriodEnd: periodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptionsTable.userId,
      set: {
        stripeSubscriptionId: sub.id,
        stripePriceId: sub.items.data[0]?.price.id ?? null,
        status: normalizeStripeStatus(sub.status),
        currentPeriodEnd: periodEnd,
        updatedAt: new Date(),
      },
    });

  logger.info({ userId, status: sub.status, eventId }, "Business Suite subscription synced");
}

async function unlockDigitalDownload(orderId: number): Promise<void> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId));

  if (!order || order.type !== "digital_product" || !order.digitalProductId) {
    return;
  }

  const [product] = await db
    .select()
    .from(digitalProductsTable)
    .where(eq(digitalProductsTable.id, order.digitalProductId));

  if (!product?.fileKey) {
    logger.warn({ orderId, productId: order.digitalProductId }, "No file key for digital product — download unlock skipped");
    return;
  }

  // The download link is the API endpoint that generates fresh signed URLs on each access.
  // It expires after 24 hours — after that the buyer must contact the seller.
  const DOWNLOAD_TTL_HOURS = 24;
  const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_HOURS * 60 * 60 * 1000);

  // Store the API download URL — the endpoint itself verifies auth and generates a short-lived GCS signed URL
  const downloadUrl = `/api/orders/${orderId}/download`;

  await db
    .update(ordersTable)
    .set({
      downloadUrl,
      downloadExpiresAt: expiresAt,
    })
    .where(eq(ordersTable.id, orderId));

  logger.info({ orderId, productId: product.id, expiresAt }, "Digital download unlocked");
}
