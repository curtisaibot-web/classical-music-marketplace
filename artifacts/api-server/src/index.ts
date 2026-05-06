import app from "./app";
import { logger } from "./lib/logger";
import { initStripe } from "./stripeInit";
import { backfillMissingProfileSlugs } from "./backfillSlugs";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

try {
  await initStripe();
} catch (err) {
  logger.warn({ err }, "Stripe initialization failed — server will start without payment support");
}

await backfillMissingProfileSlugs();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
