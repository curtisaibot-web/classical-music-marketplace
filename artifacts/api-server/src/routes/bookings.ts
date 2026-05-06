import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or, desc } from "drizzle-orm";
import { db, bookingsTable, teacherProfilesTable, usersTable, listingsTable, reviewsTable, studentProfilesTable, orgMembersTable, organisationsTable } from "@workspace/db";
import { isProSubscriber } from "./subscriptions";
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
  let cancellationPolicyHoursSnapshot: number | null = null;
  let cancellationFeePercentSnapshot: number | null = null;

  const teacherId = parsed.data.teacherId as string | undefined;

  if (parsed.data.listingId) {
    const [listing] = await db
      .select()
      .from(listingsTable)
      .where(eq(listingsTable.id, parsed.data.listingId));
    if (listing) {
      priceInCents = listing.priceInCents;
    }
  }

  if (teacherId) {
    const teacherIsPro = await isProSubscriber(teacherId);
    if (teacherIsPro) {
      const [tp] = await db
        .select({
          cancellationPolicyHours: teacherProfilesTable.cancellationPolicyHours,
          cancellationFeePercent: teacherProfilesTable.cancellationFeePercent,
        })
        .from(teacherProfilesTable)
        .where(eq(teacherProfilesTable.userId, teacherId));
      if (tp) {
        cancellationPolicyHoursSnapshot = tp.cancellationPolicyHours ?? null;
        cancellationFeePercentSnapshot = tp.cancellationFeePercent ?? null;
      }
    }
  }

  // ── Org-scoped booking guard (bidirectional) ─────────────────────────────
  // Two rules enforced:
  //   A) If the TEACHER is in a school-private org, the student must be in
  //      the same org (prevents outsiders booking private-school teachers).
  //   B) If the STUDENT is in a school-private org, the teacher must be in
  //      the same org (prevents school students booking outside teachers).
  if (teacherId) {
    // Determine the teacher's private org (if any)
    const [teacherMemberRow] = await db
      .select({ orgId: orgMembersTable.orgId })
      .from(orgMembersTable)
      .innerJoin(organisationsTable, eq(orgMembersTable.orgId, organisationsTable.id))
      .where(
        and(
          eq(orgMembersTable.userId, teacherId),
          eq(orgMembersTable.role, "teacher"),
          eq(organisationsTable.isPublicMarketplace, false),
        ),
      )
      .limit(1);

    const teacherPrivateOrgId = teacherMemberRow?.orgId ?? null;

    // Determine the student's private org (if any)
    const [studentProfile] = await db
      .select({ orgId: studentProfilesTable.orgId })
      .from(studentProfilesTable)
      .where(eq(studentProfilesTable.userId, userId));

    const studentOrgId = studentProfile?.orgId ?? null;

    if (studentOrgId !== null) {
      // Rule B: student in private org → teacher must be in same org
      const [studentOrg] = await db
        .select({ isPublicMarketplace: organisationsTable.isPublicMarketplace })
        .from(organisationsTable)
        .where(eq(organisationsTable.id, studentOrgId));
      if (studentOrg && !studentOrg.isPublicMarketplace && teacherPrivateOrgId !== studentOrgId) {
        res.status(403).json({ error: "This teacher is not part of your school" });
        return;
      }
    }

    if (teacherPrivateOrgId !== null) {
      // Rule A: teacher in private org → student must be in same org,
      // UNLESS the teacher has opted into public visibility (isPubliclyVisible=true).
      const [teacherProfile] = await db
        .select({ isPubliclyVisible: teacherProfilesTable.isPubliclyVisible })
        .from(teacherProfilesTable)
        .where(eq(teacherProfilesTable.userId, teacherId));

      const teacherAllowsPublic = teacherProfile?.isPubliclyVisible ?? true;

      if (!teacherAllowsPublic) {
        const studentInTeacherOrg = studentOrgId === teacherPrivateOrgId;
        if (!studentInTeacherOrg) {
          // Check org_members directly (student might be enrolled without profile orgId set yet)
          const [membership] = await db
            .select({ id: orgMembersTable.id })
            .from(orgMembersTable)
            .where(
              and(
                eq(orgMembersTable.orgId, teacherPrivateOrgId),
                eq(orgMembersTable.userId, userId),
                eq(orgMembersTable.role, "student"),
              ),
            );
          if (!membership) {
            res.status(403).json({ error: "You must be enrolled in this teacher's school to book them" });
            return;
          }
        }
      }
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
      cancellationPolicyHoursSnapshot,
      cancellationFeePercentSnapshot,
    })
    .returning();

  res.status(201).json(GetBookingResponse.parse({ ...booking, teacher: undefined }));
});

router.get("/bookings/cancellations", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  const rows = await db
    .select({
      id: bookingsTable.id,
      studentId: bookingsTable.studentId,
      scheduledAt: bookingsTable.scheduledAt,
      priceInCents: bookingsTable.priceInCents,
      currency: bookingsTable.currency,
      instrument: bookingsTable.instrument,
      cancelledAt: bookingsTable.cancelledAt,
      cancelReason: bookingsTable.cancelReason,
      cancellationPolicyHoursSnapshot: bookingsTable.cancellationPolicyHoursSnapshot,
      cancellationFeePercentSnapshot: bookingsTable.cancellationFeePercentSnapshot,
      cancellationFeeOwedInCents: bookingsTable.cancellationFeeOwedInCents,
      cancellationFeeCollected: bookingsTable.cancellationFeeCollected,
      cancellationFeeCollectedAt: bookingsTable.cancellationFeeCollectedAt,
      studentFirstName: usersTable.firstName,
      studentLastName: usersTable.lastName,
      studentEmail: usersTable.email,
    })
    .from(bookingsTable)
    .leftJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .where(and(
      eq(bookingsTable.teacherId, userId),
      eq(bookingsTable.status, "cancelled"),
    ))
    .orderBy(desc(bookingsTable.cancelledAt))
    .limit(50);

  const totalFeeOwedInCents = rows.reduce((s, r) => s + (r.cancellationFeeOwedInCents ?? 0), 0);
  const lateCancellations = rows.filter(r => (r.cancellationFeeOwedInCents ?? 0) > 0);

  res.json({
    cancellations: rows.map(r => ({
      id: r.id,
      studentName: [r.studentFirstName, r.studentLastName].filter(Boolean).join(" ") || r.studentEmail || "Unknown",
      studentEmail: r.studentEmail,
      scheduledAt: r.scheduledAt,
      cancelledAt: r.cancelledAt,
      cancelReason: r.cancelReason,
      priceInCents: r.priceInCents,
      currency: r.currency,
      instrument: r.instrument,
      cancellationPolicyHoursSnapshot: r.cancellationPolicyHoursSnapshot,
      cancellationFeePercentSnapshot: r.cancellationFeePercentSnapshot,
      cancellationFeeOwedInCents: r.cancellationFeeOwedInCents,
      cancellationFeeCollected: r.cancellationFeeCollected === 1,
      cancellationFeeCollectedAt: r.cancellationFeeCollectedAt,
    })),
    totalFeeOwedInCents,
    lateCancellationCount: lateCancellations.length,
  });
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

    const [current] = await db
      .select()
      .from(bookingsTable)
      .where(and(
        eq(bookingsTable.id, id),
        or(eq(bookingsTable.studentId, userId), eq(bookingsTable.teacherId, userId)),
      ));

    const studentIsCancelling = current?.studentId === userId;
    if (studentIsCancelling && current.cancellationPolicyHoursSnapshot && current.cancellationFeePercentSnapshot) {
      const scheduledAt = current.scheduledAt ? new Date(current.scheduledAt) : null;
      if (scheduledAt) {
        const hoursUntilLesson = (scheduledAt.getTime() - Date.now()) / (1000 * 60 * 60);
        if (hoursUntilLesson < current.cancellationPolicyHoursSnapshot) {
          extra.cancellationFeeOwedInCents = Math.round(
            current.priceInCents * (current.cancellationFeePercentSnapshot / 100),
          );
        }
      }
    }
  }

  if (parsed.data.status === "completed") {
    extra.completedAt = new Date();
  }
  if (parsed.data.status === "expired") {
    console.log(`[NOTIFICATION][expired] Booking ${id} has expired. Client should be notified.`);
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

router.patch("/bookings/:id/collect-cancellation-fee", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid booking id" }); return; }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.teacherId, userId)));

  if (!booking) { res.status(404).json({ error: "Booking not found" }); return; }
  if (booking.status !== "cancelled") { res.status(400).json({ error: "Booking is not cancelled" }); return; }
  if (!booking.cancellationFeeOwedInCents || booking.cancellationFeeOwedInCents <= 0) {
    res.status(400).json({ error: "No cancellation fee owed for this booking" }); return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ cancellationFeeCollected: 1, cancellationFeeCollectedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(bookingsTable.id, id), eq(bookingsTable.teacherId, userId)))
    .returning();

  res.json({ id: updated.id, cancellationFeeCollected: updated.cancellationFeeCollected, cancellationFeeCollectedAt: updated.cancellationFeeCollectedAt });
});

export default router;
