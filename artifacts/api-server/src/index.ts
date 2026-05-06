import app from "./app";
import { logger } from "./lib/logger";
import { initStripe } from "./stripeInit";
import { backfillMissingProfileSlugs } from "./backfillSlugs";
import { db, bookingsTable } from "@workspace/db";
import { and, eq, lte, isNotNull } from "drizzle-orm";

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

// ── Last-minute booking expiry sweep ─────────────────────────────────────────
// Run every 5 minutes: mark pending last-minute bookings expired when expiresAt has passed.
async function expireStaleLastMinuteBookings() {
  try {
    const expired = await db
      .update(bookingsTable)
      .set({ status: "expired", updatedAt: new Date() })
      .where(
        and(
          eq(bookingsTable.status, "pending"),
          isNotNull(bookingsTable.expiresAt),
          lte(bookingsTable.expiresAt, new Date()),
        ),
      )
      .returning({ id: bookingsTable.id, studentId: bookingsTable.studentId, teacherId: bookingsTable.teacherId });

    for (const booking of expired) {
      // Notification placeholder — replace with real email when provider is configured
      logger.info({ bookingId: booking.id }, "[NOTIFICATION][expired] Last-minute booking expired — student and teacher should be notified.");
    }
    if (expired.length > 0) {
      logger.info({ count: expired.length }, "Expired stale last-minute bookings");
    }
  } catch (err) {
    logger.error({ err }, "Failed to expire stale last-minute bookings");
  }
}

// Run once on startup, then every 5 minutes
expireStaleLastMinuteBookings();
setInterval(expireStaleLastMinuteBookings, 5 * 60 * 1000);

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
