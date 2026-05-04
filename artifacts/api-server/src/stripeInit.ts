import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { logger } from "./lib/logger";

export async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — skipping Stripe initialization");
    return;
  }

  try {
    logger.info("Initializing Stripe schema...");
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret && !process.env.REPLIT_CONNECTORS_HOSTNAME) {
      logger.warn(
        "STRIPE_WEBHOOK_SECRET is not set. " +
        "Webhook events will not update booking/order status. " +
        "Set STRIPE_WEBHOOK_SECRET or connect Stripe via the Replit Integrations tab.",
      );
    }

    const stripeSync = await getStripeSync();

    const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
    if (domain) {
      const webhookUrl = `https://${domain}/api/stripe/webhook`;
      logger.info({ webhookUrl }, "Setting up managed webhook...");
      await stripeSync.findOrCreateManagedWebhook(webhookUrl);
      logger.info("Webhook configured");
    }

    stripeSync
      .syncBackfill()
      .then(() => logger.info("Stripe data synced"))
      .catch((err) => logger.error({ err }, "Error syncing Stripe data"));
  } catch (error) {
    logger.error({ error }, "Failed to initialize Stripe — payments will be unavailable");
  }
}
