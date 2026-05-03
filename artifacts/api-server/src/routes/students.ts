import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, studentProfilesTable } from "@workspace/db";
import {
  GetMyStudentProfileResponse,
  UpdateMyStudentProfileBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/students/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [profile] = await db
    .select()
    .from(studentProfilesTable)
    .where(eq(studentProfilesTable.userId, userId));

  if (!profile) {
    res.status(404).json({ error: "Student profile not found" });
    return;
  }

  res.json(GetMyStudentProfileResponse.parse(profile));
});

router.put("/students/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = UpdateMyStudentProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .update(studentProfilesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(studentProfilesTable.userId, userId))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "Student profile not found" });
    return;
  }

  res.json(GetMyStudentProfileResponse.parse(profile));
});

export default router;
