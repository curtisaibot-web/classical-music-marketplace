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
