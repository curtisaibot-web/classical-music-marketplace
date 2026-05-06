import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, avg, count } from "drizzle-orm";
import { db, reviewsTable, usersTable, bookingsTable, teacherProfilesTable, coachProfilesTable } from "@workspace/db";
import {
  GetTeacherReviewsResponse,
  CreateReviewBody,
  GetTeacherReviewsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/reviews/teacher/:userId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const params = GetTeacherReviewsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 10) : 10;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const rows = await db
    .select()
    .from(reviewsTable)
    .leftJoin(usersTable, eq(reviewsTable.reviewerId, usersTable.id))
    .where(and(eq(reviewsTable.teacherId, rawId), eq(reviewsTable.isPublished, true)))
    .orderBy(reviewsTable.createdAt)
    .limit(limit)
    .offset(offset);

  const [totalRow] = await db
    .select({ count: count() })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.teacherId, rawId), eq(reviewsTable.isPublished, true)));

  const reviews = rows.map((r) => ({
    ...r.reviews,
    reviewer: r.users,
  }));

  res.json(GetTeacherReviewsResponse.parse({ reviews, total: totalRow?.count ?? 0 }));
});

router.post("/reviews", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = CreateReviewBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.rating < 1 || parsed.data.rating > 5) {
    res.status(400).json({ error: "Rating must be between 1 and 5" });
    return;
  }

  const { teacherId, bookingId } = parsed.data;

  if (bookingId !== undefined) {
    const booking = await db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.id, bookingId),
          eq(bookingsTable.studentId, userId),
          eq(bookingsTable.teacherId, teacherId),
          eq(bookingsTable.status, "completed"),
        )
      )
      .limit(1);

    if (booking.length === 0) {
      res.status(403).json({ error: "Booking not found, does not belong to you, or is not completed." });
      return;
    }

    const existingReview = await db
      .select()
      .from(reviewsTable)
      .where(and(eq(reviewsTable.reviewerId, userId), eq(reviewsTable.bookingId, bookingId)))
      .limit(1);

    if (existingReview.length > 0) {
      res.status(409).json({ error: "You have already reviewed this booking." });
      return;
    }
  } else {
    const completedBookings = await db
      .select()
      .from(bookingsTable)
      .where(
        and(
          eq(bookingsTable.studentId, userId),
          eq(bookingsTable.teacherId, teacherId),
          eq(bookingsTable.status, "completed"),
        )
      )
      .limit(1);

    if (completedBookings.length === 0) {
      res.status(403).json({ error: "You can only review teachers after a completed booking." });
      return;
    }

    const existingReview = await db
      .select()
      .from(reviewsTable)
      .where(and(eq(reviewsTable.reviewerId, userId), eq(reviewsTable.teacherId, teacherId)))
      .limit(1);

    if (existingReview.length > 0) {
      res.status(409).json({ error: "You have already reviewed this teacher." });
      return;
    }
  }

  const [review] = await db
    .insert(reviewsTable)
    .values({ ...parsed.data, reviewerId: userId })
    .returning();

  const [stats] = await db
    .select({
      avgRating: avg(reviewsTable.rating),
      cnt: count(),
    })
    .from(reviewsTable)
    .where(and(eq(reviewsTable.teacherId, teacherId), eq(reviewsTable.isPublished, true)));

  if (stats) {
    const newAvg = Math.round(Number(stats.avgRating ?? 0) * 100);
    await db
      .update(teacherProfilesTable)
      .set({ averageRating: newAvg, reviewCount: Number(stats.cnt) })
      .where(eq(teacherProfilesTable.userId, teacherId));

    const coachingStats = await db
      .select({ avgRating: avg(reviewsTable.rating), cnt: count() })
      .from(reviewsTable)
      .innerJoin(bookingsTable, eq(reviewsTable.bookingId, bookingsTable.id))
      .where(and(eq(reviewsTable.teacherId, teacherId), eq(reviewsTable.isPublished, true), eq(bookingsTable.type, "coaching")));
    const cs = coachingStats[0];
    if (cs && Number(cs.cnt) > 0) {
      await db
        .update(coachProfilesTable)
        .set({ averageRating: Math.round(Number(cs.avgRating ?? 0) * 100), reviewCount: Number(cs.cnt) })
        .where(eq(coachProfilesTable.userId, teacherId));
    }
  }

  res.status(201).json(review);
});

export default router;
