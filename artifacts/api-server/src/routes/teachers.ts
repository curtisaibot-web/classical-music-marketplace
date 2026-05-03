import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, teacherProfilesTable, usersTable } from "@workspace/db";
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

  const profiles = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .limit(limit)
    .offset(offset);

  const teachers = profiles.map((p) => ({
    ...p.teacher_profiles,
    user: p.users,
  }));

  res.json(ListTeachersResponse.parse({ teachers, total: teachers.length }));
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
