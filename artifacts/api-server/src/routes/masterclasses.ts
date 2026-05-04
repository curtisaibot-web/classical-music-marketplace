import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, gte, count, sql, ilike } from "drizzle-orm";
import { db, masterclassEventsTable, teacherProfilesTable, usersTable } from "@workspace/db";
import {
  GetMasterclassResponse,
  ListMasterclassesResponse,
  CreateMasterclassBody,
  UpdateMasterclassBody,
  ListMasterclassesQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

const router: IRouter = Router();

router.get("/masterclasses", async (req, res): Promise<void> => {
  const params = ListMasterclassesQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;
  const instrument = params.success ? params.data.instrument : undefined;

  const dayOfWeek = params.success ? params.data.dayOfWeek : undefined;

  const now = new Date();
  const conditions = [
    eq(masterclassEventsTable.isCancelled, false),
    gte(masterclassEventsTable.scheduledAt, now),
  ];
  if (instrument) {
    conditions.push(ilike(masterclassEventsTable.instrument, instrument));
  }
  if (dayOfWeek !== undefined) {
    conditions.push(sql`EXTRACT(DOW FROM ${masterclassEventsTable.scheduledAt}) = ${dayOfWeek}`);
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ count: count() }).from(masterclassEventsTable).where(where),
    db
      .select()
      .from(masterclassEventsTable)
      .leftJoin(teacherProfilesTable, eq(masterclassEventsTable.teacherId, teacherProfilesTable.userId))
      .leftJoin(usersTable, eq(masterclassEventsTable.teacherId, usersTable.id))
      .where(where)
      .limit(limit)
      .offset(offset),
  ]);

  const masterclasses = rows.map((r) => ({
    ...r.masterclass_events,
    teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
  }));

  res.json(ListMasterclassesResponse.parse({ masterclasses, total: totalRow[0]?.count ?? 0 }));
});

router.post("/masterclasses", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = CreateMasterclassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [event] = await db
    .insert(masterclassEventsTable)
    .values({ ...parsed.data, teacherId: userId })
    .returning();

  res.status(201).json(GetMasterclassResponse.parse({ ...event, teacher: undefined }));
});

router.get("/masterclasses/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid masterclass id" });
    return;
  }

  const [row] = await db
    .select()
    .from(masterclassEventsTable)
    .leftJoin(teacherProfilesTable, eq(masterclassEventsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(masterclassEventsTable.teacherId, usersTable.id))
    .where(eq(masterclassEventsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Masterclass not found" });
    return;
  }

  res.json(GetMasterclassResponse.parse({ ...row.masterclass_events, teacher: row.teacher_profiles ? { ...row.teacher_profiles, user: row.users } : undefined }));
});

router.patch("/masterclasses/:id", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid masterclass id" });
    return;
  }

  const parsed = UpdateMasterclassBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [event] = await db
    .update(masterclassEventsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(masterclassEventsTable.id, id), eq(masterclassEventsTable.teacherId, userId)))
    .returning();

  if (!event) {
    res.status(404).json({ error: "Masterclass not found" });
    return;
  }

  res.json(GetMasterclassResponse.parse({ ...event, teacher: undefined }));
});

export default router;
