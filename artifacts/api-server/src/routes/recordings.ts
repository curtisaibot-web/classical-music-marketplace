import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, asc } from "drizzle-orm";
import { db, teacherRecordingsTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { ObjectStorageService } from "../lib/objectStorage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

// Marker prefix used for enhanced recording file keys stored in the url column.
const ENHANCED_KEY_PREFIX = "/objects/recordings-enhanced/";

router.get("/teachers/:teacherId/recordings", async (req, res): Promise<void> => {
  const { teacherId } = req.params;
  const rows = await db
    .select()
    .from(teacherRecordingsTable)
    .where(eq(teacherRecordingsTable.teacherId, teacherId))
    .orderBy(asc(teacherRecordingsTable.sortOrder), asc(teacherRecordingsTable.createdAt));

  // For enhanced recordings the `url` column holds the internal GCS key.
  // Generate a fresh signed URL (1 hour) so the profile audio player always works.
  const recordings = await Promise.all(
    rows.map(async (rec) => {
      if (rec.isEnhanced && rec.url.startsWith(ENHANCED_KEY_PREFIX)) {
        try {
          const signedUrl = await storage.getSignedDownloadURL(rec.url, 3600);
          return { ...rec, url: signedUrl };
        } catch {
          // Return without a signed URL; profile will show the recording but audio may not play.
          return rec;
        }
      }
      return rec;
    }),
  );

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
