import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, bookingsTable, ordersTable, digitalProductsTable } from "@workspace/db";
import { getStripeSync, getUncachableStripeClient, getStripeCredentials } from "./stripeClient";
import { logger } from "./lib/logger";

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
  }
}

async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  eventId: string,
): Promise<void> {
  const metadata = session.metadata ?? {};
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

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

    if (existing.status === "pending") {
      await db
        .update(bookingsTable)
        .set({
          status: "confirmed",
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
        })
        .where(eq(bookingsTable.id, bookingId));
      logger.info({ bookingId, sessionId: session.id, eventId }, "Booking confirmed via checkout.session.completed");
    } else {
      logger.info({ bookingId, status: existing.status, eventId }, "Booking already in non-pending state — skipping idempotent update");
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

    if (existing.status === "pending") {
      await db
        .update(ordersTable)
        .set({
          status: "paid",
          paidAt: new Date(),
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
        })
        .where(eq(ordersTable.id, orderId));
      logger.info({ orderId, sessionId: session.id, eventId }, "Order paid via checkout.session.completed");

      await unlockDigitalDownload(orderId);
    } else {
      logger.info({ orderId, status: existing.status, eventId }, "Order already in non-pending state — skipping idempotent update");
    }
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

    const [existing] = await db
      .select({ status: bookingsTable.status })
      .from(bookingsTable)
      .where(eq(bookingsTable.id, bookingId));

    if (existing && existing.status === "pending") {
      await db
        .update(bookingsTable)
        .set({
          status: "confirmed",
          stripePaymentIntentId: paymentIntent.id,
        })
        .where(eq(bookingsTable.id, bookingId));
      logger.info({ bookingId, paymentIntentId: paymentIntent.id, eventId }, "Booking confirmed via payment_intent.succeeded");
    } else {
      logger.info({ bookingId, status: existing?.status, eventId }, "Booking already in non-pending state — skipping idempotent update");
    }
  }

  if (metadata.order_id) {
    const orderId = parseInt(metadata.order_id, 10);
    if (isNaN(orderId)) {
      throw new Error(`Invalid order_id in payment_intent metadata: ${metadata.order_id}`);
    }

    const [existing] = await db
      .select({ status: ordersTable.status })
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));

    if (existing && existing.status === "pending") {
      await db
        .update(ordersTable)
        .set({
          status: "paid",
          paidAt: new Date(),
          stripePaymentIntentId: paymentIntent.id,
        })
        .where(eq(ordersTable.id, orderId));
      logger.info({ orderId, paymentIntentId: paymentIntent.id, eventId }, "Order paid via payment_intent.succeeded");

      await unlockDigitalDownload(orderId);
    } else {
      logger.info({ orderId, status: existing?.status, eventId }, "Order already in non-pending state — skipping idempotent update");
    }
  }
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

  const DOWNLOAD_TTL_HOURS = 48;
  const expiresAt = new Date(Date.now() + DOWNLOAD_TTL_HOURS * 60 * 60 * 1000);

  const downloadUrl = `/api/orders/${orderId}/download`;

  await db
    .update(ordersTable)
    .set({
      downloadUrl,
      downloadExpiresAt: expiresAt,
    })
    .where(eq(ordersTable.id, orderId));

  await db
    .update(digitalProductsTable)
    .set({ downloadCount: (product.downloadCount ?? 0) + 1 })
    .where(eq(digitalProductsTable.id, product.id));

  logger.info({ orderId, productId: product.id, expiresAt }, "Digital download unlocked");
}
