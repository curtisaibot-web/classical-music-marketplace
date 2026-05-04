import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or } from "drizzle-orm";
import { db, bookingsTable, teacherProfilesTable, usersTable, listingsTable, reviewsTable } from "@workspace/db";
import {
  GetBookingResponse,
  ListBookingsResponse,
  CreateBookingBody,
  UpdateBookingBody,
  ListBookingsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const PLATFORM_FEE_RATE = 0.15;

const router: IRouter = Router();

router.get("/bookings", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const params = ListBookingsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const rows = await db
    .select()
    .from(bookingsTable)
    .leftJoin(teacherProfilesTable, eq(bookingsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(bookingsTable.teacherId, usersTable.id))
    .where(or(eq(bookingsTable.studentId, userId), eq(bookingsTable.teacherId, userId)))
    .limit(limit)
    .offset(offset);

  const bookingIds = rows.map((r) => r.bookings.id);
  const reviewedBookingIds = new Set<number>();
  if (bookingIds.length > 0) {
    const existingReviews = await db
      .select({ bookingId: reviewsTable.bookingId })
      .from(reviewsTable)
      .where(eq(reviewsTable.reviewerId, userId));
    for (const r of existingReviews) {
      if (r.bookingId !== null) reviewedBookingIds.add(r.bookingId);
    }
  }

  const bookings = rows.map((r) => ({
    ...r.bookings,
    hasReview: reviewedBookingIds.has(r.bookings.id),
    teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
  }));

  res.json(ListBookingsResponse.parse({ bookings, total: bookings.length }));
});

router.post("/bookings", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = CreateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Get listing price if provided
  let priceInCents = 0;
  if (parsed.data.listingId) {
    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, parsed.data.listingId));
    if (listing) {
      priceInCents = listing.priceInCents;
    }
  }

  const platformFeeInCents = Math.round(priceInCents * PLATFORM_FEE_RATE);

  const [booking] = await db
    .insert(bookingsTable)
    .values({
      ...parsed.data,
      studentId: userId,
      priceInCents,
      platformFeeInCents,
    })
    .returning();

  res.status(201).json(GetBookingResponse.parse({ ...booking, teacher: undefined }));
});

router.get("/bookings/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }

  const [row] = await db
    .select()
    .from(bookingsTable)
    .leftJoin(teacherProfilesTable, eq(bookingsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(bookingsTable.teacherId, usersTable.id))
    .where(and(
      eq(bookingsTable.id, id),
      or(eq(bookingsTable.studentId, userId), eq(bookingsTable.teacherId, userId)),
    ));

  if (!row) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json(GetBookingResponse.parse({ ...row.bookings, teacher: row.teacher_profiles ? { ...row.teacher_profiles, user: row.users } : undefined }));
});

router.patch("/bookings/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid booking id" });
    return;
  }

  const parsed = UpdateBookingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const extra: Record<string, unknown> = {};
  if (parsed.data.status === "cancelled") {
    extra.cancelledAt = new Date();
  }
  if (parsed.data.status === "completed") {
    extra.completedAt = new Date();
  }

  const [booking] = await db
    .update(bookingsTable)
    .set({ ...parsed.data, ...extra, updatedAt: new Date() })
    .where(and(
      eq(bookingsTable.id, id),
      or(eq(bookingsTable.studentId, userId), eq(bookingsTable.teacherId, userId)),
    ))
    .returning();

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  res.json(GetBookingResponse.parse({ ...booking, teacher: undefined }));
});

export default router;
