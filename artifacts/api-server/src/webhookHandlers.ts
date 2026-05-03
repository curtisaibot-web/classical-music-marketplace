import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { db, bookingsTable, ordersTable } from "@workspace/db";
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
    }
  }
}
