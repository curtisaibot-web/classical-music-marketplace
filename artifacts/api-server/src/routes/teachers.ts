import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, gte, lte, sql, count, ilike, inArray } from "drizzle-orm";
import { db, teacherProfilesTable, usersTable, listingsTable, masterclassEventsTable } from "@workspace/db";
import {
  GetTeacherResponse,
  GetMyTeacherProfileResponse,
  UpdateMyTeacherProfileBody,
  ListTeachersResponse,
  ListTeachersQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/teachers", async (req, res): Promise<void> => {
  const params = ListTeachersQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;
  const instrument = params.success ? params.data.instrument : undefined;
  const city = params.success ? params.data.city : undefined;
  const minRate = params.success ? params.data.minRate : undefined;
  const maxRate = params.success ? params.data.maxRate : undefined;
  const listingType = params.success ? params.data.listingType : undefined;
  const dayOfWeek = params.success ? params.data.dayOfWeek : undefined;

  const conditions = [];
  if (instrument) {
    conditions.push(sql`EXISTS (SELECT 1 FROM UNNEST(${teacherProfilesTable.instruments}) AS instr WHERE LOWER(instr) = LOWER(${instrument}))`);
  }
  if (city) {
    conditions.push(ilike(teacherProfilesTable.city, `%${city}%`));
  }
  if (minRate !== undefined) {
    conditions.push(gte(teacherProfilesTable.hourlyRate, minRate));
  }
  if (maxRate !== undefined) {
    conditions.push(lte(teacherProfilesTable.hourlyRate, maxRate));
  }

  if (listingType) {
    const teacherIdsWithType = await db
      .selectDistinct({ teacherId: listingsTable.teacherId })
      .from(listingsTable)
      .where(and(eq(listingsTable.type, listingType as "lesson" | "event" | "masterclass" | "digital_product"), eq(listingsTable.status, "active")));
    const ids = teacherIdsWithType.map((r) => r.teacherId);
    if (ids.length === 0) {
      res.json(ListTeachersResponse.parse({ teachers: [], total: 0 }));
      return;
    }
    conditions.push(inArray(teacherProfilesTable.userId, ids));
  }

  if (dayOfWeek !== undefined) {
    // Only masterclass listings have rows in masterclass_events.
    // lesson, event, and digital_product are non-schedulable — skip DOW filter for them.
    const skipDow = listingType === "lesson" || listingType === "event" || listingType === "digital_product";
    if (!skipDow) {
      const teacherIdsWithDay = await db
        .selectDistinct({ teacherId: masterclassEventsTable.teacherId })
        .from(masterclassEventsTable)
        .where(and(
          eq(masterclassEventsTable.isCancelled, false),
          gte(masterclassEventsTable.scheduledAt, new Date()),
          sql`EXTRACT(DOW FROM ${masterclassEventsTable.scheduledAt}) = ${dayOfWeek}`,
        ));
      const ids = teacherIdsWithDay.map((r) => r.teacherId);
      if (ids.length === 0) {
        if (listingType === "masterclass") {
          res.json(ListTeachersResponse.parse({ teachers: [], total: 0 }));
          return;
        }
        // No teachers with masterclasses on this day — still show all teachers when no type filter
        // (they may offer lessons on any day)
      } else {
        conditions.push(inArray(teacherProfilesTable.userId, ids));
      }
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow, profiles] = await Promise.all([
    db.select({ count: count() }).from(teacherProfilesTable).where(where),
    db
      .select()
      .from(teacherProfilesTable)
      .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
      .where(where)
      .limit(limit)
      .offset(offset),
  ]);

  const teachers = profiles.map((p) => ({
    ...p.teacher_profiles,
    user: p.users,
  }));

  res.json(ListTeachersResponse.parse({ teachers, total: totalRow[0]?.count ?? 0 }));
});

router.get("/teachers/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [result] = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(eq(teacherProfilesTable.userId, userId));

  if (!result) {
    res.status(404).json({ error: "Teacher profile not found" });
    return;
  }

  res.json(GetMyTeacherProfileResponse.parse({ ...result.teacher_profiles, user: result.users }));
});

router.put("/teachers/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = UpdateMyTeacherProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .update(teacherProfilesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(teacherProfilesTable.userId, userId))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "Teacher profile not found" });
    return;
  }

  const [result] = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(eq(teacherProfilesTable.userId, userId));

  res.json(GetMyTeacherProfileResponse.parse({ ...result!.teacher_profiles, user: result!.users }));
});

router.get("/teachers/:userId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const [result] = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(eq(teacherProfilesTable.userId, rawId));

  if (!result) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }

  res.json(GetTeacherResponse.parse({ ...result.teacher_profiles, user: result.users }));
});

export default router;
