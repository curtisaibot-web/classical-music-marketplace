import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or, ilike, inArray, count, lte, gte, isNull } from "drizzle-orm";
import {
  db,
  bookingsTable,
  listingsTable,
  teacherProfilesTable,
  usersTable,
  eventListingDetailsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

const PLATFORM_FEE_RATE = 0.15;
const LAST_MINUTE_PLATFORM_FEE_RATE = 0.20;
const LAST_MINUTE_THRESHOLD_HOURS = 72;
const LAST_MINUTE_SURGE_PERCENT = 25;
const ACCEPTANCE_WINDOW_HOURS = 2;

function parseIntOrUndefined(val: unknown): number | undefined {
  if (val === undefined || val === null || val === "") return undefined;
  const n = Number(val);
  return isNaN(n) ? undefined : n;
}

function buildEventListing(
  listing: typeof listingsTable.$inferSelect,
  detail: typeof eventListingDetailsTable.$inferSelect | null,
  profile: typeof teacherProfilesTable.$inferSelect | null,
  user: typeof usersTable.$inferSelect | null,
) {
  return {
    id: listing.id,
    teacherId: listing.teacherId,
    type: "event" as const,
    status: listing.status,
    title: listing.title,
    description: listing.description,
    instrument: listing.instrument,
    priceInCents: listing.priceInCents,
    currency: listing.currency,
    imageUrl: listing.imageUrl,
    tags: listing.tags,
    isOnline: listing.isOnline,
    city: listing.city,
    country: listing.country,
    eventDetails: detail
      ? {
          id: detail.id,
          eventTypes: detail.eventTypes,
          venueTypes: detail.venueTypes,
          minHeadcount: detail.minHeadcount,
          maxHeadcount: detail.maxHeadcount,
          travelRadiusMiles: detail.travelRadiusMiles,
          requiresDeposit: detail.requiresDeposit,
          depositPercent: detail.depositPercent,
          repertoire: detail.repertoire,
          setupTimeMinutes: detail.setupTimeMinutes,
          performanceDurationMinutes: detail.performanceDurationMinutes,
          additionalInfo: detail.additionalInfo,
        }
      : null,
    teacher: profile
      ? {
          id: profile.id,
          userId: profile.userId,
          bio: profile.bio,
          instruments: profile.instruments,
          genres: profile.genres,
          city: profile.city,
          country: profile.country,
          hourlyRate: profile.hourlyRate,
          averageRating: profile.averageRating,
          reviewCount: profile.reviewCount,
          isVerified: profile.isVerified,
          profileImageUrl: profile.profileImageUrl,
          lastMinuteAvailable: profile.lastMinuteAvailable,
          user: user
            ? {
                firstName: user.firstName,
                lastName: user.lastName,
                imageUrl: user.imageUrl,
              }
            : undefined,
        }
      : undefined,
    createdAt: listing.createdAt,
  };
}

router.get("/events", async (req, res): Promise<void> => {
  const limit = parseIntOrUndefined(req.query.limit) ?? 20;
  const offset = parseIntOrUndefined(req.query.offset) ?? 0;
  const instrument =
    typeof req.query.instrument === "string" && req.query.instrument
      ? req.query.instrument
      : undefined;
  const city =
    typeof req.query.city === "string" && req.query.city
      ? req.query.city
      : undefined;
  const eventType =
    typeof req.query.eventType === "string" && req.query.eventType
      ? req.query.eventType
      : undefined;
  const lastMinute = req.query.lastMinute === "true";

  const conditions = [
    eq(listingsTable.type, "event"),
    eq(listingsTable.status, "active"),
  ];

  if (instrument) conditions.push(ilike(listingsTable.instrument, `%${instrument}%`));
  if (city) conditions.push(ilike(listingsTable.city, `%${city}%`));

  if (lastMinute) {
    const now = new Date();
    conditions.push(eq(teacherProfilesTable.lastMinuteAvailable, true));
    conditions.push(
      or(
        isNull(teacherProfilesTable.lastMinuteFromDate),
        lte(teacherProfilesTable.lastMinuteFromDate, now),
      )!,
    );
    conditions.push(
      or(
        isNull(teacherProfilesTable.lastMinuteToDate),
        gte(teacherProfilesTable.lastMinuteToDate, now),
      )!,
    );
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db
      .select({ count: count() })
      .from(listingsTable)
      .leftJoin(teacherProfilesTable, eq(listingsTable.teacherId, teacherProfilesTable.userId))
      .where(where),
    db
      .select()
      .from(listingsTable)
      .leftJoin(teacherProfilesTable, eq(listingsTable.teacherId, teacherProfilesTable.userId))
      .leftJoin(usersTable, eq(listingsTable.teacherId, usersTable.id))
      .where(where)
      .limit(limit)
      .offset(offset),
  ]);

  const listingIds = rows.map((r) => r.listings.id);
  let detailRows: (typeof eventListingDetailsTable.$inferSelect)[] = [];
  if (listingIds.length > 0) {
    detailRows = await db
      .select()
      .from(eventListingDetailsTable)
      .where(inArray(eventListingDetailsTable.listingId, listingIds));
  }

  const detailMap = new Map(detailRows.map((d) => [d.listingId, d]));

  let events = rows.map((r) =>
    buildEventListing(r.listings, detailMap.get(r.listings.id) ?? null, r.teacher_profiles, r.users),
  );

  // eventType filter is in-memory since it lives in the jsonb/array column of event_listing_details
  let total = totalRow[0]?.count ?? 0;
  if (eventType) {
    const filterLower = eventType.toLowerCase();
    events = events.filter((e) =>
      e.eventDetails?.eventTypes.some((t) => t.toLowerCase().includes(filterLower)),
    );
    total = events.length;
  }

  res.json({ events, total });
});

router.get("/events/availability/:teacherId", async (req, res): Promise<void> => {
  const teacherId = Array.isArray(req.params.teacherId)
    ? req.params.teacherId[0]
    : req.params.teacherId;

  const bookings = await db
    .select({ eventDate: bookingsTable.eventDate, scheduledAt: bookingsTable.scheduledAt })
    .from(bookingsTable)
    .where(
      and(
        eq(bookingsTable.teacherId, teacherId),
        eq(bookingsTable.type, "event"),
        or(eq(bookingsTable.status, "confirmed"), eq(bookingsTable.status, "pending")),
      ),
    );

  const bookedDates = bookings
    .map((b) => b.eventDate ?? b.scheduledAt)
    .filter((d): d is Date => d !== null);

  res.json({ bookedDates });
});

router.get("/events/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid event listing id" });
    return;
  }

  const [row] = await db
    .select()
    .from(listingsTable)
    .leftJoin(teacherProfilesTable, eq(listingsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(listingsTable.teacherId, usersTable.id))
    .where(and(eq(listingsTable.id, id), eq(listingsTable.type, "event")));

  if (!row) {
    res.status(404).json({ error: "Event listing not found" });
    return;
  }

  const [detail] = await db
    .select()
    .from(eventListingDetailsTable)
    .where(eq(eventListingDetailsTable.listingId, id));

  res.json(buildEventListing(row.listings, detail ?? null, row.teacher_profiles, row.users));
});

router.post("/event-booking-requests", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const body = req.body as {
    listingId?: unknown;
    teacherId?: unknown;
    eventType?: unknown;
    eventDate?: unknown;
    eventLocation?: unknown;
    headcount?: unknown;
    durationMinutes?: unknown;
    notes?: unknown;
    instrument?: unknown;
  };

  if (typeof body.teacherId !== "string" || !body.teacherId.trim()) {
    res.status(400).json({ error: "teacherId is required" });
    return;
  }
  if (typeof body.eventType !== "string" || !body.eventType.trim()) {
    res.status(400).json({ error: "eventType is required" });
    return;
  }
  if (!body.eventDate) {
    res.status(400).json({ error: "eventDate is required" });
    return;
  }
  if (typeof body.eventLocation !== "string" || !body.eventLocation.trim()) {
    res.status(400).json({ error: "eventLocation is required" });
    return;
  }

  const eventDate = new Date(body.eventDate as string);
  if (isNaN(eventDate.getTime())) {
    res.status(400).json({ error: "eventDate must be a valid date" });
    return;
  }
  if (eventDate < new Date()) {
    res.status(400).json({ error: "eventDate must be in the future" });
    return;
  }

  const headcount = parseIntOrUndefined(body.headcount);
  if (headcount !== undefined && (headcount < 1 || headcount > 100000)) {
    res.status(400).json({ error: "headcount must be between 1 and 100,000" });
    return;
  }

  const durationMinutes = parseIntOrUndefined(body.durationMinutes);
  if (durationMinutes !== undefined && (durationMinutes < 15 || durationMinutes > 1440)) {
    res.status(400).json({ error: "durationMinutes must be between 15 and 1440" });
    return;
  }

  const listingId =
    typeof body.listingId === "number" ? body.listingId
    : typeof body.listingId === "string" ? parseInt(body.listingId, 10)
    : undefined;

  let basePriceInCents = 0;
  if (listingId && !isNaN(listingId)) {
    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(and(eq(listingsTable.id, listingId), eq(listingsTable.type, "event")));
    if (!listing) {
      res.status(400).json({ error: "Invalid listingId: listing not found or not an event listing" });
      return;
    }
    if (listing.teacherId !== (body.teacherId as string)) {
      res.status(400).json({ error: "Invalid listingId: listing does not belong to the specified teacher" });
      return;
    }
    basePriceInCents = listing.priceInCents;
  }

  // Determine if this is a last-minute booking (event within 72 hours)
  const now = new Date();
  const hoursUntilEvent = (eventDate.getTime() - now.getTime()) / (1000 * 60 * 60);
  const isLastMinute = hoursUntilEvent < LAST_MINUTE_THRESHOLD_HOURS;

  let surgePercent: number | null = null;
  let surgeAmountInCents: number | null = null;
  let expiresAt: Date | null = null;
  let platformFeeRate = PLATFORM_FEE_RATE;

  if (isLastMinute) {
    surgePercent = LAST_MINUTE_SURGE_PERCENT;
    surgeAmountInCents = Math.round(basePriceInCents * (surgePercent / 100));
    expiresAt = new Date(now.getTime() + ACCEPTANCE_WINDOW_HOURS * 60 * 60 * 1000);
    platformFeeRate = LAST_MINUTE_PLATFORM_FEE_RATE;

    // Email notification placeholder — swap with real provider when configured
    console.log(`[NOTIFICATION][last-minute] Teacher ${body.teacherId as string} has a new last-minute booking request for ${eventDate.toISOString()}. Acceptance window until ${expiresAt.toISOString()}.`);
  }

  const priceInCents = basePriceInCents + (surgeAmountInCents ?? 0);
  const platformFeeInCents = Math.round(priceInCents * platformFeeRate);

  const [booking] = await db
    .insert(bookingsTable)
    .values({
      studentId: userId,
      teacherId: body.teacherId as string,
      listingId: listingId && !isNaN(listingId) ? listingId : null,
      type: "event",
      status: "pending",
      priceInCents,
      platformFeeInCents,
      surgePercent,
      surgeAmountInCents,
      expiresAt,
      eventType: body.eventType as string,
      eventDate,
      eventLocation: body.eventLocation as string,
      headcount: headcount ?? null,
      durationMinutes: durationMinutes ?? null,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
      instrument: typeof body.instrument === "string" && body.instrument.trim() ? body.instrument.trim() : null,
    })
    .returning();

  res.status(201).json(booking);
});

export default router;
