import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { db, listingsTable, teacherProfilesTable, usersTable } from "@workspace/db";
import {
  GetListingResponse,
  ListListingsResponse,
  CreateListingBody,
  UpdateListingBody,
  ListListingsQueryParams,
  GetTeacherListingsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

const router: IRouter = Router();

router.get("/listings", async (req, res): Promise<void> => {
  const params = ListListingsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;
  const type = params.success ? params.data.type : undefined;

  const query = db
    .select()
    .from(listingsTable)
    .leftJoin(teacherProfilesTable, eq(listingsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(listingsTable.teacherId, usersTable.id))
    .limit(limit)
    .offset(offset);

  if (type) {
    query.where(and(eq(listingsTable.status, "active"), eq(listingsTable.type, type as "lesson" | "event" | "masterclass" | "digital_product")));
  } else {
    query.where(eq(listingsTable.status, "active"));
  }

  const rows = await query;
  const listings = rows.map((r) => ({
    ...r.listings,
    teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
  }));

  res.json(ListListingsResponse.parse({ listings, total: listings.length }));
});

router.post("/listings", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [listing] = await db
    .insert(listingsTable)
    .values({ ...parsed.data, teacherId: userId })
    .returning();

  res.status(201).json(GetListingResponse.parse({ ...listing, teacher: undefined }));
});

router.get("/listings/teacher/:userId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const rows = await db
    .select()
    .from(listingsTable)
    .leftJoin(teacherProfilesTable, eq(listingsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(listingsTable.teacherId, usersTable.id))
    .where(eq(listingsTable.teacherId, rawId));

  const listings = rows.map((r) => ({
    ...r.listings,
    teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
  }));

  res.json(GetTeacherListingsResponse.parse({ listings, total: listings.length }));
});

router.get("/listings/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  const [row] = await db
    .select()
    .from(listingsTable)
    .leftJoin(teacherProfilesTable, eq(listingsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(listingsTable.teacherId, usersTable.id))
    .where(eq(listingsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.json(GetListingResponse.parse({ ...row.listings, teacher: row.teacher_profiles ? { ...row.teacher_profiles, user: row.users } : undefined }));
});

router.patch("/listings/:id", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  const parsed = UpdateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [listing] = await db
    .update(listingsTable)
    .set({
      ...parsed.data,
      skillLevel: parsed.data.skillLevel as "beginner" | "intermediate" | "advanced" | "all" | undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(listingsTable.id, id), eq(listingsTable.teacherId, userId)))
    .returning();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.json(GetListingResponse.parse({ ...listing, teacher: undefined }));
});

router.delete("/listings/:id", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  const [listing] = await db
    .delete(listingsTable)
    .where(and(eq(listingsTable.id, id), eq(listingsTable.teacherId, userId)))
    .returning();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
