import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, asc } from "drizzle-orm";
import { db, teacherRecordingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/teachers/:teacherId/recordings", async (req, res): Promise<void> => {
  const { teacherId } = req.params;
  const recordings = await db
    .select()
    .from(teacherRecordingsTable)
    .where(eq(teacherRecordingsTable.teacherId, teacherId))
    .orderBy(asc(teacherRecordingsTable.sortOrder), asc(teacherRecordingsTable.createdAt));
  res.json({ recordings });
});

router.post("/teachers/me/recordings", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const teacherId = auth.userId!;

  const { url, title, description, sortOrder } = req.body as {
    url?: string;
    title?: string;
    description?: string;
    sortOrder?: number;
  };

  if (!url || !title) {
    res.status(400).json({ error: "url and title are required" });
    return;
  }

  const existing = await db
    .select({ id: teacherRecordingsTable.id })
    .from(teacherRecordingsTable)
    .where(eq(teacherRecordingsTable.teacherId, teacherId));

  if (existing.length >= 5) {
    res.status(400).json({ error: "Maximum of 5 recordings allowed per profile" });
    return;
  }

  const [recording] = await db
    .insert(teacherRecordingsTable)
    .values({ teacherId, url, title, description: description ?? null, sortOrder: sortOrder ?? existing.length })
    .returning();

  res.status(201).json(recording);
});

router.delete("/teachers/me/recordings/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const teacherId = auth.userId!;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const recordingId = parseInt(rawId, 10);

  if (isNaN(recordingId)) {
    res.status(400).json({ error: "Invalid recording id" });
    return;
  }

  const [deleted] = await db
    .delete(teacherRecordingsTable)
    .where(and(eq(teacherRecordingsTable.id, recordingId), eq(teacherRecordingsTable.teacherId, teacherId)))
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Recording not found" });
    return;
  }

  res.status(204).send();
});

export default router;
