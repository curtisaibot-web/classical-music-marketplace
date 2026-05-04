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

    try {
      const stripe = await getUncachableStripeClient();
      const { webhookSecret } = await getStripeCredentials();
      if (webhookSecret) {
        const event = stripe.webhooks.constructEvent(payload, signature, webhookSecret);
        await handleStripeEvent(event);
      }
    } catch (err) {
      logger.error({ err }, "Failed to handle custom Stripe event logic");
    }
  }
}

async function handleStripeEvent(event: Stripe.Event): Promise<void> {
  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    await handleCheckoutSessionCompleted(session);
  } else if (event.type === "payment_intent.succeeded") {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;
    await handlePaymentIntentSucceeded(paymentIntent);
  }
}

async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session): Promise<void> {
  const metadata = session.metadata ?? {};
  const paymentIntentId =
    typeof session.payment_intent === "string" ? session.payment_intent : null;

  if (metadata.booking_id) {
    const bookingId = parseInt(metadata.booking_id, 10);
    if (!isNaN(bookingId)) {
      await db
        .update(bookingsTable)
        .set({
          status: "confirmed",
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
        })
        .where(eq(bookingsTable.id, bookingId));
      logger.info({ bookingId, sessionId: session.id }, "Booking confirmed via Stripe");
    }
  }

  if (metadata.order_id) {
    const orderId = parseInt(metadata.order_id, 10);
    if (!isNaN(orderId)) {
      await db
        .update(ordersTable)
        .set({
          status: "paid",
          paidAt: new Date(),
          stripeCheckoutSessionId: session.id,
          stripePaymentIntentId: paymentIntentId,
        })
        .where(eq(ordersTable.id, orderId));
      logger.info({ orderId, sessionId: session.id }, "Order paid via Stripe");

      await unlockDigitalDownload(orderId);
    }
  }
}

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
  const metadata = paymentIntent.metadata ?? {};

  if (metadata.booking_id) {
    const bookingId = parseInt(metadata.booking_id, 10);
    if (!isNaN(bookingId)) {
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
        logger.info({ bookingId, paymentIntentId: paymentIntent.id }, "Booking confirmed via payment_intent.succeeded");
      }
    }
  }

  if (metadata.order_id) {
    const orderId = parseInt(metadata.order_id, 10);
    if (!isNaN(orderId)) {
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
        logger.info({ orderId, paymentIntentId: paymentIntent.id }, "Order paid via payment_intent.succeeded");

        await unlockDigitalDownload(orderId);
      }
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
