import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, desc, eq, or } from "drizzle-orm";
import { db, inquiriesTable, teacherProfilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.post("/inquiries", async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId ?? null;
  const body = req.body as {
    recipientTeacherId?: string;
    listingId?: number;
    senderName?: string;
    senderEmail?: string;
    subject?: string;
    message?: string;
  };

  if (!body.recipientTeacherId || !body.subject || !body.message) {
    res.status(400).json({ error: "recipientTeacherId, subject, and message are required" });
    return;
  }

  if (!userId && !body.senderEmail) {
    res.status(400).json({ error: "Guest inquiries require senderEmail" });
    return;
  }

  const [teacher] = await db
    .select({ userId: teacherProfilesTable.userId })
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, body.recipientTeacherId));

  if (!teacher) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }

  const [inquiry] = await db
    .insert(inquiriesTable)
    .values({
      senderId: userId,
      senderName: body.senderName,
      senderEmail: body.senderEmail,
      recipientTeacherId: body.recipientTeacherId,
      listingId: body.listingId,
      subject: body.subject,
      message: body.message,
    })
    .returning();

  res.status(201).json(inquiry);
});

router.get("/inquiries/mine", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const inquiries = await db
    .select()
    .from(inquiriesTable)
    .where(or(eq(inquiriesTable.senderId, userId), eq(inquiriesTable.recipientTeacherId, userId)))
    .orderBy(desc(inquiriesTable.createdAt));

  res.json({ inquiries, total: inquiries.length });
});

export default router;
