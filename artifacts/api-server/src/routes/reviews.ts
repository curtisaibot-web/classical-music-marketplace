import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, reviewsTable, usersTable } from "@workspace/db";
import {
  GetTeacherReviewsResponse,
  CreateReviewBody,
  GetTeacherReviewsQueryParams,
  GetTeacherReviewsParams,
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
    .limit(limit)
    .offset(offset);

  const reviews = rows.map((r) => ({
    ...r.reviews,
    reviewer: r.users,
  }));

  res.json(GetTeacherReviewsResponse.parse({ reviews, total: reviews.length }));
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

  const [review] = await db
    .insert(reviewsTable)
    .values({ ...parsed.data, reviewerId: userId })
    .returning();

  res.status(201).json(review);
});

export default router;
