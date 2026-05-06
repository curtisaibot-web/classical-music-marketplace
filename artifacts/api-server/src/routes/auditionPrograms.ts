import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc } from "drizzle-orm";
import { Readable } from "stream";
import {
  db,
  auditionProgramsTable,
  programEnrollmentsTable,
  programSessionNotesTable,
  teacherProfilesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { logger } from "../lib/logger";
import PDFDocument from "pdfkit";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage";

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseId(raw: string | string[]): number | null {
  const s = Array.isArray(raw) ? raw[0] : raw;
  const n = parseInt(s, 10);
  return isNaN(n) ? null : n;
}

async function buildEnrollmentDetail(enrollmentId: number, userId?: string) {
  const [enrollment] = await db
    .select()
    .from(programEnrollmentsTable)
    .where(eq(programEnrollmentsTable.id, enrollmentId));

  if (!enrollment) return null;

  if (userId && enrollment.studentId !== userId) {
    const [program] = await db
      .select()
      .from(auditionProgramsTable)
      .where(eq(auditionProgramsTable.id, enrollment.programId));
    if (!program || program.teacherId !== userId) return null;
  }

  const [program] = await db
    .select()
    .from(auditionProgramsTable)
    .where(eq(auditionProgramsTable.id, enrollment.programId));

  const [teacherUser] = program
    ? await db
        .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
        .from(usersTable)
        .where(eq(usersTable.id, program.teacherId))
    : [undefined];

  const [studentUser] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, enrollment.studentId));

  const notes = await db
    .select()
    .from(programSessionNotesTable)
    .where(eq(programSessionNotesTable.enrollmentId, enrollmentId))
    .orderBy(programSessionNotesTable.sessionNumber);

  return { ...enrollment, program, teacherUser, studentUser, sessionNotes: notes };
}

// ── Public: Browse programs ────────────────────────────────────────────────────
router.get("/audition-programs", async (req, res): Promise<void> => {
  const instrument = typeof req.query.instrument === "string" ? req.query.instrument : undefined;
  const targetLevel = typeof req.query.targetLevel === "string" ? req.query.targetLevel : undefined;
  const teacherId = typeof req.query.teacherId === "string" ? req.query.teacherId : undefined;
  const limit = parseInt(String(req.query.limit ?? "20"), 10) || 20;
  const offset = parseInt(String(req.query.offset ?? "0"), 10) || 0;

  const conditions = [eq(auditionProgramsTable.isActive, true)];
  if (instrument) {
    const { ilike } = await import("drizzle-orm");
    conditions.push(ilike(auditionProgramsTable.instrument, `%${instrument}%`));
  }
  if (targetLevel) {
    const { sql } = await import("drizzle-orm");
    conditions.push(sql`${auditionProgramsTable.targetLevel} = ${targetLevel}`);
  }
  if (teacherId) {
    conditions.push(eq(auditionProgramsTable.teacherId, teacherId));
  }

  const { and: andFn, count } = await import("drizzle-orm");
  const where = andFn(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ count: count() }).from(auditionProgramsTable).where(where),
    db
      .select()
      .from(auditionProgramsTable)
      .leftJoin(teacherProfilesTable, eq(auditionProgramsTable.teacherId, teacherProfilesTable.userId))
      .leftJoin(usersTable, eq(auditionProgramsTable.teacherId, usersTable.id))
      .where(where)
      .limit(limit)
      .offset(offset)
      .orderBy(desc(auditionProgramsTable.createdAt)),
  ]);

  const programs = rows.map((r) => ({
    ...r.audition_programs,
    teacher: r.teacher_profiles
      ? {
          profileImageUrl: r.teacher_profiles.profileImageUrl,
          firstName: r.users?.firstName ?? null,
          lastName: r.users?.lastName ?? null,
        }
      : null,
  }));

  res.json({ programs, total: totalRow[0]?.count ?? 0 });
});

// ── Teacher: my programs (before /:id) ───────────────────────────────────────
router.get("/audition-programs/my-programs", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;

  const rows = await db
    .select()
    .from(auditionProgramsTable)
    .where(and(eq(auditionProgramsTable.teacherId, userId), eq(auditionProgramsTable.isActive, true)))
    .orderBy(desc(auditionProgramsTable.createdAt));

  res.json({ programs: rows });
});

// ── Student: my enrollments (before /:id) ─────────────────────────────────────
router.get("/audition-programs/my-enrollments", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;

  const rows = await db
    .select()
    .from(programEnrollmentsTable)
    .leftJoin(auditionProgramsTable, eq(programEnrollmentsTable.programId, auditionProgramsTable.id))
    .leftJoin(usersTable, eq(auditionProgramsTable.teacherId, usersTable.id))
    .where(eq(programEnrollmentsTable.studentId, userId))
    .orderBy(desc(programEnrollmentsTable.createdAt));

  const enrollments = await Promise.all(
    rows.map(async (r) => {
      const notes = await db
        .select()
        .from(programSessionNotesTable)
        .where(eq(programSessionNotesTable.enrollmentId, r.program_enrollments.id))
        .orderBy(programSessionNotesTable.sessionNumber);
      return {
        ...r.program_enrollments,
        program: r.audition_programs ?? null,
        teacherUser: r.users ? { firstName: r.users.firstName, lastName: r.users.lastName } : null,
        sessionNotes: notes,
      };
    }),
  );

  res.json({ enrollments });
});

// ── Teacher: all enrollments across programs ───────────────────────────────────
router.get("/audition-programs/teacher-enrollments", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;

  const myPrograms = await db
    .select({ id: auditionProgramsTable.id })
    .from(auditionProgramsTable)
    .where(eq(auditionProgramsTable.teacherId, userId));

  if (!myPrograms.length) {
    res.json({ enrollments: [] });
    return;
  }

  const { inArray } = await import("drizzle-orm");
  const programIds = myPrograms.map((p) => p.id);

  const rows = await db
    .select()
    .from(programEnrollmentsTable)
    .leftJoin(auditionProgramsTable, eq(programEnrollmentsTable.programId, auditionProgramsTable.id))
    .leftJoin(usersTable, eq(programEnrollmentsTable.studentId, usersTable.id))
    .where(inArray(programEnrollmentsTable.programId, programIds))
    .orderBy(desc(programEnrollmentsTable.createdAt));

  const enrollments = await Promise.all(
    rows.map(async (r) => {
      const notes = await db
        .select()
        .from(programSessionNotesTable)
        .where(eq(programSessionNotesTable.enrollmentId, r.program_enrollments.id))
        .orderBy(programSessionNotesTable.sessionNumber);
      return {
        ...r.program_enrollments,
        program: r.audition_programs ?? null,
        studentUser: r.users ? { firstName: r.users.firstName, lastName: r.users.lastName } : null,
        sessionNotes: notes,
      };
    }),
  );

  res.json({ enrollments });
});

// ── Enrollment detail (before /:id) ──────────────────────────────────────────
router.get("/audition-programs/enrollments/:enrollmentId", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const enrollmentId = parseId(req.params.enrollmentId);
  if (!enrollmentId) { res.status(400).json({ error: "Invalid enrollment id" }); return; }

  const detail = await buildEnrollmentDetail(enrollmentId, userId);
  if (!detail) { res.status(404).json({ error: "Enrollment not found" }); return; }

  res.json(detail);
});

// ── Mark session complete (teacher only) ──────────────────────────────────────
router.post(
  "/audition-programs/enrollments/:enrollmentId/sessions/:sessionNumber/complete",
  requireAuth,
  requireRole("teacher"),
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId!;
    const enrollmentId = parseId(req.params.enrollmentId);
    const sessionNumber = parseId(req.params.sessionNumber);
    if (!enrollmentId || !sessionNumber) {
      res.status(400).json({ error: "Invalid ids" });
      return;
    }

    const [enrollment] = await db
      .select()
      .from(programEnrollmentsTable)
      .where(eq(programEnrollmentsTable.id, enrollmentId));
    if (!enrollment) { res.status(404).json({ error: "Enrollment not found" }); return; }

    const [program] = await db
      .select()
      .from(auditionProgramsTable)
      .where(eq(auditionProgramsTable.id, enrollment.programId));
    if (!program || program.teacherId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    if (enrollment.status !== "active") {
      res.status(400).json({ error: "Enrollment is not active" });
      return;
    }

    if (sessionNumber < 1 || sessionNumber > program.sessionCount) {
      res.status(400).json({ error: `Session number must be between 1 and ${program.sessionCount}` });
      return;
    }

    const { teacherNote, feedbackFileKey } = req.body as { teacherNote?: string; feedbackFileKey?: string };

    const existing = await db
      .select({ id: programSessionNotesTable.id })
      .from(programSessionNotesTable)
      .where(
        and(
          eq(programSessionNotesTable.enrollmentId, enrollmentId),
          eq(programSessionNotesTable.sessionNumber, sessionNumber),
        ),
      );

    if (existing.length > 0) {
      await db
        .update(programSessionNotesTable)
        .set({ teacherNote: teacherNote ?? null, feedbackFileKey: feedbackFileKey ?? null })
        .where(eq(programSessionNotesTable.id, existing[0].id));
    } else {
      await db.insert(programSessionNotesTable).values({
        enrollmentId,
        sessionNumber,
        teacherNote: teacherNote ?? null,
        feedbackFileKey: feedbackFileKey ?? null,
      });
    }

    const allNotes = await db
      .select({ sessionNumber: programSessionNotesTable.sessionNumber })
      .from(programSessionNotesTable)
      .where(eq(programSessionNotesTable.enrollmentId, enrollmentId));

    const completedCount = allNotes.length;
    const isComplete = completedCount >= program.sessionCount;

    await db
      .update(programEnrollmentsTable)
      .set({
        sessionsCompleted: completedCount,
        status: isComplete ? "completed" : "active",
        updatedAt: new Date(),
      })
      .where(eq(programEnrollmentsTable.id, enrollmentId));

    const detail = await buildEnrollmentDetail(enrollmentId, userId);
    res.json(detail);
  },
);

// ── Download certificate (student or teacher) ─────────────────────────────────
router.get("/audition-programs/enrollments/:enrollmentId/certificate", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const enrollmentId = parseId(req.params.enrollmentId);
  if (!enrollmentId) { res.status(400).json({ error: "Invalid enrollment id" }); return; }

  const [enrollment] = await db
    .select()
    .from(programEnrollmentsTable)
    .where(eq(programEnrollmentsTable.id, enrollmentId));
  if (!enrollment) { res.status(404).json({ error: "Enrollment not found" }); return; }

  const [program] = await db
    .select()
    .from(auditionProgramsTable)
    .where(eq(auditionProgramsTable.id, enrollment.programId));
  if (!program) { res.status(404).json({ error: "Program not found" }); return; }

  if (enrollment.studentId !== userId && program.teacherId !== userId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  if (enrollment.status !== "completed") {
    res.status(400).json({ error: "Program not yet completed" });
    return;
  }

  const [studentUser] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, enrollment.studentId));

  const [teacherUser] = await db
    .select({ firstName: usersTable.firstName, lastName: usersTable.lastName })
    .from(usersTable)
    .where(eq(usersTable.id, program.teacherId));

  const studentName = `${studentUser?.firstName ?? ""} ${studentUser?.lastName ?? ""}`.trim() || "Student";
  const teacherName = `${teacherUser?.firstName ?? ""} ${teacherUser?.lastName ?? ""}`.trim() || "Teacher";
  // Use the last completed session's timestamp as the canonical completion date
  const [lastSession] = await db
    .select({ completedAt: programSessionNotesTable.completedAt })
    .from(programSessionNotesTable)
    .where(eq(programSessionNotesTable.enrollmentId, enrollmentId))
    .orderBy(desc(programSessionNotesTable.completedAt))
    .limit(1);
  const completionDateRaw = lastSession?.completedAt ?? enrollment.paidAt ?? new Date();
  const completionDate = new Date(completionDateRaw).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  try {
    const doc = new PDFDocument({ size: "A4", margin: 60 });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="harmonia-certificate-${enrollmentId}.pdf"`,
    );
    doc.pipe(res);

    // Background decoration
    doc.rect(0, 0, doc.page.width, doc.page.height).fill("#FFFDF7");
    doc.rect(30, 30, doc.page.width - 60, doc.page.height - 60).stroke("#C8A951").lineWidth(2);
    doc.rect(36, 36, doc.page.width - 72, doc.page.height - 72).stroke("#C8A951").lineWidth(0.5);

    // Title
    doc
      .fillColor("#1A1A1A")
      .font("Helvetica-Bold")
      .fontSize(36)
      .text("CERTIFICATE OF COMPLETION", 0, 120, { align: "center" });

    doc
      .moveDown(0.4)
      .fontSize(14)
      .fillColor("#6B5A2A")
      .font("Helvetica")
      .text("Harmonia Classical Music Marketplace", { align: "center" });

    doc.moveDown(1.5);
    doc
      .fontSize(14)
      .fillColor("#333")
      .text("This certifies that", { align: "center" });

    doc.moveDown(0.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(28)
      .fillColor("#1A1A1A")
      .text(studentName, { align: "center" });

    doc.moveDown(0.5);
    doc
      .font("Helvetica")
      .fontSize(14)
      .fillColor("#333")
      .text("has successfully completed the", { align: "center" });

    doc.moveDown(0.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#1A1A1A")
      .text(program.title, { align: "center" });

    doc.moveDown(0.3);
    doc
      .font("Helvetica")
      .fontSize(12)
      .fillColor("#555")
      .text(
        `${program.sessionCount} sessions · ${program.instrument} · ${program.targetLevel.replace("_", " ")}`,
        { align: "center" },
      );

    doc.moveDown(1);
    doc
      .fontSize(14)
      .fillColor("#333")
      .text("under the instruction of", { align: "center" });

    doc.moveDown(0.5);
    doc
      .font("Helvetica-Bold")
      .fontSize(20)
      .fillColor("#1A1A1A")
      .text(teacherName, { align: "center" });

    // Date and signature line
    const sigY = doc.page.height - 160;
    doc
      .moveTo(100, sigY + 30)
      .lineTo(260, sigY + 30)
      .stroke("#999");
    doc
      .moveTo(doc.page.width - 260, sigY + 30)
      .lineTo(doc.page.width - 100, sigY + 30)
      .stroke("#999");

    doc
      .font("Helvetica")
      .fontSize(11)
      .fillColor("#555")
      .text(completionDate, 100, sigY + 36, { width: 160, align: "center" });

    doc
      .fontSize(11)
      .text("Date", 100, sigY + 50, { width: 160, align: "center" });

    doc
      .fontSize(11)
      .text(teacherName, doc.page.width - 260, sigY + 36, { width: 160, align: "center" });
    doc
      .text("Instructor", doc.page.width - 260, sigY + 50, { width: 160, align: "center" });

    doc.end();
  } catch (err) {
    logger.error({ err }, "Failed to generate certificate PDF");
    if (!res.headersSent) {
      res.status(500).json({ error: "Failed to generate certificate" });
    }
  }
});

// ── Session feedback upload URL (teacher) ─────────────────────────────────────
router.post(
  "/audition-programs/enrollments/:enrollmentId/sessions/:sessionNumber/feedback-upload-url",
  requireAuth,
  requireRole("teacher"),
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId!;
    const enrollmentId = parseId(req.params.enrollmentId);
    const sessionNumber = parseId(req.params.sessionNumber);
    if (!enrollmentId || !sessionNumber) {
      res.status(400).json({ error: "Invalid ids" });
      return;
    }

    const [enrollment] = await db
      .select()
      .from(programEnrollmentsTable)
      .where(eq(programEnrollmentsTable.id, enrollmentId));
    if (!enrollment) { res.status(404).json({ error: "Enrollment not found" }); return; }

    const [program] = await db
      .select()
      .from(auditionProgramsTable)
      .where(eq(auditionProgramsTable.id, enrollment.programId));
    if (!program || program.teacherId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    try {
      const storage = new ObjectStorageService();
      const { uploadUrl, fileKey } = await storage.getObjectEntityUploadURL(userId);
      res.json({ uploadUrl, fileKey });
    } catch (err) {
      logger.error({ err }, "Failed to generate feedback upload URL");
      res.status(500).json({ error: "Failed to generate upload URL. Object storage may not be configured." });
    }
  },
);

// ── Session feedback download (student or teacher) ─────────────────────────────
router.get(
  "/audition-programs/enrollments/:enrollmentId/sessions/:sessionNumber/feedback",
  requireAuth,
  async (req, res): Promise<void> => {
    const userId = getAuth(req).userId!;
    const enrollmentId = parseId(req.params.enrollmentId);
    const sessionNumber = parseId(req.params.sessionNumber);
    if (!enrollmentId || !sessionNumber) {
      res.status(400).json({ error: "Invalid ids" });
      return;
    }

    const [enrollment] = await db
      .select()
      .from(programEnrollmentsTable)
      .where(eq(programEnrollmentsTable.id, enrollmentId));
    if (!enrollment) { res.status(404).json({ error: "Enrollment not found" }); return; }

    const [program] = await db
      .select()
      .from(auditionProgramsTable)
      .where(eq(auditionProgramsTable.id, enrollment.programId));

    if (enrollment.studentId !== userId && program?.teacherId !== userId) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    const [note] = await db
      .select()
      .from(programSessionNotesTable)
      .where(
        and(
          eq(programSessionNotesTable.enrollmentId, enrollmentId),
          eq(programSessionNotesTable.sessionNumber, sessionNumber),
        ),
      );

    if (!note?.feedbackFileKey) {
      res.status(404).json({ error: "No feedback file for this session" });
      return;
    }

    try {
      const storage = new ObjectStorageService();
      const file = await storage.getObjectEntityFile(note.feedbackFileKey);
      const response = await storage.downloadObject(file);

      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== "content-disposition") res.setHeader(key, value);
      });
      res.setHeader("Content-Disposition", `attachment; filename="feedback-session-${sessionNumber}"`);

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (err) {
      if (err instanceof ObjectNotFoundError) {
        res.status(404).json({ error: "Feedback file not found" });
      } else {
        logger.error({ err }, "Failed to download feedback file");
        res.status(500).json({ error: "Failed to download feedback file" });
      }
    }
  },
);

// ── Get single program ────────────────────────────────────────────────────────
router.get("/audition-programs/:id", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid program id" }); return; }

  const [row] = await db
    .select()
    .from(auditionProgramsTable)
    .leftJoin(teacherProfilesTable, eq(auditionProgramsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(auditionProgramsTable.teacherId, usersTable.id))
    .where(eq(auditionProgramsTable.id, id));

  if (!row) { res.status(404).json({ error: "Program not found" }); return; }

  res.json({
    ...row.audition_programs,
    teacher: row.teacher_profiles
      ? {
          profileImageUrl: row.teacher_profiles.profileImageUrl,
          firstName: row.users?.firstName ?? null,
          lastName: row.users?.lastName ?? null,
        }
      : null,
  });
});

// ── Create program (teacher) ──────────────────────────────────────────────────
router.post("/audition-programs", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const { title, instrument, targetLevel, sessionCount, priceCents, syllabusText } = req.body as {
    title: string;
    instrument: string;
    targetLevel: string;
    sessionCount: number;
    priceCents: number;
    syllabusText?: string;
  };

  if (!title || !instrument || !targetLevel || !sessionCount || !priceCents) {
    res.status(400).json({ error: "title, instrument, targetLevel, sessionCount, and priceCents are required" });
    return;
  }

  const validLevels = ["undergraduate", "postgrad", "professional_orchestra"];
  if (!validLevels.includes(targetLevel)) {
    res.status(400).json({ error: `targetLevel must be one of: ${validLevels.join(", ")}` });
    return;
  }

  const [program] = await db
    .insert(auditionProgramsTable)
    .values({
      teacherId: userId,
      title,
      instrument,
      targetLevel: targetLevel as "undergraduate" | "postgrad" | "professional_orchestra",
      sessionCount,
      priceCents,
      syllabusText: syllabusText ?? null,
    })
    .returning();

  res.status(201).json(program);
});

// ── Update program (teacher) ──────────────────────────────────────────────────
router.patch("/audition-programs/:id", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid program id" }); return; }

  const { title, instrument, targetLevel, sessionCount, priceCents, syllabusText, isActive } = req.body as {
    title?: string;
    instrument?: string;
    targetLevel?: string;
    sessionCount?: number;
    priceCents?: number;
    syllabusText?: string;
    isActive?: boolean;
  };

  if (targetLevel) {
    const validLevels = ["undergraduate", "postgrad", "professional_orchestra"];
    if (!validLevels.includes(targetLevel)) {
      res.status(400).json({ error: `targetLevel must be one of: ${validLevels.join(", ")}` });
      return;
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) updates.title = title;
  if (instrument !== undefined) updates.instrument = instrument;
  if (targetLevel !== undefined) updates.targetLevel = targetLevel;
  if (sessionCount !== undefined) updates.sessionCount = sessionCount;
  if (priceCents !== undefined) updates.priceCents = priceCents;
  if (syllabusText !== undefined) updates.syllabusText = syllabusText;
  if (isActive !== undefined) updates.isActive = isActive;

  const [program] = await db
    .update(auditionProgramsTable)
    .set(updates)
    .where(and(eq(auditionProgramsTable.id, id), eq(auditionProgramsTable.teacherId, userId)))
    .returning();

  if (!program) { res.status(404).json({ error: "Program not found" }); return; }

  res.json(program);
});

// ── Deactivate program (teacher) ──────────────────────────────────────────────
router.delete("/audition-programs/:id", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid program id" }); return; }

  const [program] = await db
    .update(auditionProgramsTable)
    .set({ isActive: false, updatedAt: new Date() })
    .where(and(eq(auditionProgramsTable.id, id), eq(auditionProgramsTable.teacherId, userId)))
    .returning({ id: auditionProgramsTable.id });

  if (!program) { res.status(404).json({ error: "Program not found" }); return; }

  res.status(204).send();
});

// ── Create enrollment (student) ───────────────────────────────────────────────
router.post("/audition-programs/:id/enrollments", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const id = parseId(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid program id" }); return; }

  const [program] = await db
    .select()
    .from(auditionProgramsTable)
    .where(and(eq(auditionProgramsTable.id, id), eq(auditionProgramsTable.isActive, true)));

  if (!program) { res.status(404).json({ error: "Program not found" }); return; }

  if (program.teacherId === userId) {
    res.status(400).json({ error: "Teachers cannot enroll in their own programs" });
    return;
  }

  const { or } = await import("drizzle-orm");
  const [existingEnrollment] = await db
    .select()
    .from(programEnrollmentsTable)
    .where(
      and(
        eq(programEnrollmentsTable.programId, id),
        eq(programEnrollmentsTable.studentId, userId),
        or(
          eq(programEnrollmentsTable.status, "active"),
          eq(programEnrollmentsTable.status, "pending"),
        ),
      ),
    )
    .limit(1);

  if (existingEnrollment) {
    if (existingEnrollment.status === "active") {
      res.status(400).json({ error: "Already enrolled in this program" });
      return;
    }
    // Reuse existing pending enrollment (avoids duplicate checkout sessions)
    res.status(201).json(existingEnrollment);
    return;
  }

  const [enrollment] = await db
    .insert(programEnrollmentsTable)
    .values({ programId: id, studentId: userId })
    .returning();

  res.status(201).json(enrollment);
});

export default router;
