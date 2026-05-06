import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, ilike, count, desc, sum, inArray, sql } from "drizzle-orm";
import { PDFDocument, rgb, StandardFonts, degrees } from "pdf-lib";
import {
  db,
  scoresTable,
  scoreLicensesTable,
  purchasedLicensesTable,
  usersTable,
  teacherProfilesTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { ObjectStorageService, signObjectURL } from "../lib/objectStorage";

const router: IRouter = Router();

function paramInt(v: unknown): number | null {
  const n = parseInt(String(v), 10);
  return isNaN(n) ? null : n;
}

function validateFileKey(key: string | null | undefined, userId: string): boolean {
  if (!key) return true;
  return key.startsWith(`/objects/uploads/${userId}/`) || key.startsWith(`/objects/images/${userId}/`);
}

async function buildSignedUrl(fileKey: string): Promise<string> {
  const storageService = new ObjectStorageService();
  const objectFile = await storageService.getObjectEntityFile(fileKey);
  const gcsFile = objectFile as unknown as { name: string; bucket: { name: string } };
  return signObjectURL({
    bucketName: gcsFile.bucket.name,
    objectName: gcsFile.name,
    method: "GET",
    ttlSec: 3600,
  });
}

async function downloadFromGCS(fileKey: string): Promise<Buffer> {
  const storageService = new ObjectStorageService();
  const objectFile = await storageService.getObjectEntityFile(fileKey);
  const gcsFile = objectFile as unknown as { download(): Promise<[Buffer]> };
  const [buf] = await gcsFile.download();
  return buf;
}

async function buildWatermarkedPreview(pdfBuffer: Buffer, scoretitle: string): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const previewDoc = await PDFDocument.create();
  const [firstPage] = await previewDoc.copyPages(srcDoc, [0]);
  previewDoc.addPage(firstPage);

  const page = previewDoc.getPages()[0];
  const { width, height } = page.getSize();
  const font = await previewDoc.embedFont(StandardFonts.HelveticaBold);
  const smallFont = await previewDoc.embedFont(StandardFonts.Helvetica);

  // Diagonal centre watermark
  page.drawText("HARMONIA MARKETPLACE", {
    x: width / 2 - 130,
    y: height / 2,
    size: 28,
    font,
    color: rgb(0.7, 0.7, 0.7),
    opacity: 0.25,
    rotate: degrees(45),
  });

  // Header banner
  page.drawRectangle({ x: 0, y: height - 22, width, height: 22, color: rgb(0.93, 0.87, 0.75), opacity: 0.9 });
  page.drawText(`PREVIEW — "${scoretitle}" — Purchase on Harmonia Marketplace`, {
    x: 8, y: height - 15, size: 8, font: smallFont, color: rgb(0.3, 0.2, 0.1),
  });

  return previewDoc.save();
}

// ── GET /scores — public browse ───────────────────────────────────────────────
router.get("/scores", async (req, res): Promise<void> => {
  const limit = paramInt(req.query.limit) ?? 20;
  const offset = paramInt(req.query.offset) ?? 0;
  const genre = typeof req.query.genre === "string" ? req.query.genre : undefined;
  const difficulty = typeof req.query.difficulty === "string" ? req.query.difficulty : undefined;
  const instrumentation = typeof req.query.instrumentation === "string" ? req.query.instrumentation : undefined;
  const licenseType = typeof req.query.licenseType === "string" ? req.query.licenseType : undefined;
  const q = typeof req.query.q === "string" ? req.query.q.trim() : undefined;

  const conditions = [eq(scoresTable.isActive, true)];
  if (genre) conditions.push(ilike(scoresTable.genre, `%${genre}%`));
  if (difficulty) conditions.push(eq(scoresTable.difficulty, difficulty));
  if (instrumentation) conditions.push(ilike(scoresTable.instrumentation, `%${instrumentation}%`));
  if (q) conditions.push(ilike(scoresTable.title, `%${q}%`));

  // licenseType filter at DB level using subquery so total count is accurate
  if (licenseType) {
    const licSubq = db
      .selectDistinct({ scoreId: scoreLicensesTable.scoreId })
      .from(scoreLicensesTable)
      .where(and(
        eq(scoreLicensesTable.licenseType, licenseType),
        eq(scoreLicensesTable.isActive, true),
      ));
    conditions.push(inArray(scoresTable.id, licSubq));
  }

  const where = and(...conditions);

  const [totalRow, scoreRows] = await Promise.all([
    db.select({ count: count() }).from(scoresTable).where(where),
    db
      .select()
      .from(scoresTable)
      .leftJoin(usersTable, eq(scoresTable.composerId, usersTable.id))
      .leftJoin(teacherProfilesTable, eq(scoresTable.composerId, teacherProfilesTable.userId))
      .where(where)
      .orderBy(desc(scoresTable.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const scoreIds = scoreRows.map((r) => r.scores.id);
  let licenses: Array<typeof scoreLicensesTable.$inferSelect> = [];
  if (scoreIds.length > 0) {
    licenses = await db
      .select()
      .from(scoreLicensesTable)
      .where(and(
        inArray(scoreLicensesTable.scoreId, scoreIds),
        eq(scoreLicensesTable.isActive, true),
      ));
  }

  const licensesByScore = new Map<number, Array<typeof scoreLicensesTable.$inferSelect>>();
  for (const lic of licenses) {
    if (!licensesByScore.has(lic.scoreId)) licensesByScore.set(lic.scoreId, []);
    licensesByScore.get(lic.scoreId)!.push(lic);
  }

  const scores = scoreRows.map((r) => {
    const scoreLicenses = licensesByScore.get(r.scores.id) ?? [];
    return {
      ...r.scores,
      fullPdfKey: null,
      composer: r.users ? { ...r.teacher_profiles, user: r.users } : undefined,
      licenses: scoreLicenses,
      minPriceCents: scoreLicenses.length > 0 ? Math.min(...scoreLicenses.map((l) => l.priceCents)) : null,
    };
  });

  res.json({ scores, total: totalRow[0]?.count ?? 0 });
});

// ── GET /scores/mine — must be before /:id to avoid shadowing ────────────────
router.get("/scores/mine", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;

  const scoreRows = await db
    .select()
    .from(scoresTable)
    .where(eq(scoresTable.composerId, userId))
    .orderBy(desc(scoresTable.createdAt));

  const scoreIds = scoreRows.map((s) => s.id);
  let licenses: Array<typeof scoreLicensesTable.$inferSelect> = [];
  let purchases: Array<{ scoreId: number; totalCents: number | null; count: number | null }> = [];

  if (scoreIds.length > 0) {
    type PurchaseSummary = { scoreId: number; totalCents: string | null; count: number | null };
    const [allLics, rawPurchases] = await Promise.all([
      db.select().from(scoreLicensesTable).where(inArray(scoreLicensesTable.scoreId, scoreIds)),
      db
        .select({
          scoreId: purchasedLicensesTable.scoreId,
          totalCents: sum(purchasedLicensesTable.priceCents),
          count: count(),
        })
        .from(purchasedLicensesTable)
        .where(and(
          eq(purchasedLicensesTable.composerId, userId),
          eq(purchasedLicensesTable.status, "active"),
        ))
        .groupBy(purchasedLicensesTable.scoreId),
    ]);
    licenses = allLics;
    purchases = (rawPurchases as PurchaseSummary[]).map((p) => ({
      scoreId: p.scoreId,
      totalCents: p.totalCents !== null ? Number(p.totalCents) : null,
      count: p.count !== null ? Number(p.count) : null,
    }));
  }

  const licensesByScore = new Map<number, Array<typeof scoreLicensesTable.$inferSelect>>();
  for (const lic of licenses) {
    if (!licensesByScore.has(lic.scoreId)) licensesByScore.set(lic.scoreId, []);
    licensesByScore.get(lic.scoreId)!.push(lic);
  }
  const purchasesByScore = new Map<number, { totalCents: number; count: number }>();
  for (const p of purchases) {
    purchasesByScore.set(p.scoreId, { totalCents: Number(p.totalCents ?? 0), count: Number(p.count ?? 0) });
  }

  const scores = scoreRows.map((s) => ({
    ...s,
    // Return fullPdfKey to composer for their own scores (needed for management UI to show upload state)
    hasFullPdf: !!s.fullPdfKey,
    fullPdfKey: null as null,
    licenses: licensesByScore.get(s.id) ?? [],
    salesCount: purchasesByScore.get(s.id)?.count ?? 0,
    revenueCents: purchasesByScore.get(s.id)?.totalCents ?? 0,
  }));

  res.json({ scores });
});

// ── GET /scores/:id — public detail ──────────────────────────────────────────
router.get("/scores/:id", async (req, res): Promise<void> => {
  const id = paramInt(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid score id" }); return; }

  const [row] = await db
    .select()
    .from(scoresTable)
    .leftJoin(usersTable, eq(scoresTable.composerId, usersTable.id))
    .leftJoin(teacherProfilesTable, eq(scoresTable.composerId, teacherProfilesTable.userId))
    .where(eq(scoresTable.id, id));

  if (!row) { res.status(404).json({ error: "Score not found" }); return; }

  // Only the composer can view their own inactive scores
  const requestingUserId = getAuth(req).userId ?? null;
  if (!row.scores.isActive && row.scores.composerId !== requestingUserId) {
    res.status(404).json({ error: "Score not found" }); return;
  }

  const licenses = await db
    .select()
    .from(scoreLicensesTable)
    .where(and(eq(scoreLicensesTable.scoreId, id), eq(scoreLicensesTable.isActive, true)));

  res.json({
    ...row.scores,
    fullPdfKey: null,
    hasPreviewPdf: !!row.scores.previewPdfKey,
    hasAudioDemo: !!row.scores.audioDemoKey,
    hasFullPdf: !!row.scores.fullPdfKey,
    composer: row.users ? { ...row.teacher_profiles, user: row.users } : undefined,
    licenses,
  });
});

// ── GET /scores/:id/preview — public watermarked first-page PDF ───────────────
// Serves the first page of the preview PDF with a "HARMONIA MARKETPLACE" watermark
// so buyers can inspect the score without receiving the full unlicensed content.
router.get("/scores/:id/preview", async (req, res): Promise<void> => {
  const id = paramInt(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid score id" }); return; }

  const [score] = await db
    .select({ previewPdfKey: scoresTable.previewPdfKey, isActive: scoresTable.isActive, title: scoresTable.title })
    .from(scoresTable)
    .where(eq(scoresTable.id, id));

  // Enforce visibility: only active scores have public previews
  if (!score || !score.isActive) { res.status(404).json({ error: "Score not found" }); return; }
  if (!score.previewPdfKey) { res.status(404).json({ error: "No preview available for this score" }); return; }

  try {
    const pdfBuffer = await downloadFromGCS(score.previewPdfKey);
    const watermarked = await buildWatermarkedPreview(pdfBuffer, score.title);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="preview-${id}.pdf"`);
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.send(Buffer.from(watermarked));
  } catch (err) {
    res.status(500).json({ error: "Failed to generate preview" });
  }
});

// ── GET /scores/:id/audio-url — public signed audio demo URL ──────────────────
router.get("/scores/:id/audio-url", async (req, res): Promise<void> => {
  const id = paramInt(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid score id" }); return; }

  const [score] = await db
    .select({ audioDemoKey: scoresTable.audioDemoKey, isActive: scoresTable.isActive })
    .from(scoresTable)
    .where(eq(scoresTable.id, id));

  if (!score || !score.isActive) { res.status(404).json({ error: "Score not found" }); return; }
  if (!score.audioDemoKey) { res.status(404).json({ error: "No audio demo available for this score" }); return; }

  try {
    const url = await buildSignedUrl(score.audioDemoKey);
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Failed to generate audio URL" });
  }
});

// ── POST /scores — composer creates a score ───────────────────────────────────
router.post("/scores", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const {
    title, instrumentation, durationSeconds, difficulty, genre,
    description, previewPdfKey, fullPdfKey, audioDemoKey, licenses,
  } = req.body as {
    title?: string;
    instrumentation?: string;
    durationSeconds?: number;
    difficulty?: string;
    genre?: string;
    description?: string;
    previewPdfKey?: string;
    fullPdfKey?: string;
    audioDemoKey?: string;
    licenses?: Array<{ licenseType: string; priceCents: number }>;
  };

  if (!title?.trim()) { res.status(400).json({ error: "title is required" }); return; }
  if (!instrumentation?.trim()) { res.status(400).json({ error: "instrumentation is required" }); return; }
  if (!genre?.trim()) { res.status(400).json({ error: "genre is required" }); return; }
  if (!fullPdfKey) { res.status(400).json({ error: "fullPdfKey (full score PDF) is required" }); return; }
  if (!licenses || !Array.isArray(licenses) || licenses.length === 0) {
    res.status(400).json({ error: "At least one license tier is required" }); return;
  }

  const VALID_LICENSE_TYPES = ["personal", "performance", "sync"];
  for (const lic of licenses) {
    if (!VALID_LICENSE_TYPES.includes(lic.licenseType)) {
      res.status(400).json({ error: `Invalid licenseType: ${lic.licenseType}` }); return;
    }
    if (!lic.priceCents || lic.priceCents < 100) {
      res.status(400).json({ error: "priceCents must be at least 100" }); return;
    }
  }

  if (
    !validateFileKey(previewPdfKey, userId) ||
    !validateFileKey(fullPdfKey, userId) ||
    !validateFileKey(audioDemoKey, userId)
  ) {
    res.status(403).json({ error: "File key does not belong to this composer" }); return;
  }

  const VALID_DIFFICULTIES = ["beginner", "intermediate", "advanced", "professional"];
  const normalizedDifficulty = difficulty && VALID_DIFFICULTIES.includes(difficulty) ? difficulty : "intermediate";

  const [score] = await db
    .insert(scoresTable)
    .values({
      composerId: userId,
      title: title.trim(),
      instrumentation: instrumentation.trim(),
      durationSeconds: durationSeconds ?? null,
      difficulty: normalizedDifficulty,
      genre: genre.trim(),
      description: description?.trim() ?? null,
      previewPdfKey: previewPdfKey ?? null,
      fullPdfKey: fullPdfKey,
      audioDemoKey: audioDemoKey ?? null,
    })
    .returning();

  const insertedLicenses = await db
    .insert(scoreLicensesTable)
    .values(licenses.map((l) => ({
      scoreId: score.id,
      licenseType: l.licenseType,
      priceCents: l.priceCents,
    })))
    .returning();

  res.status(201).json({ ...score, fullPdfKey: null, hasFullPdf: true, licenses: insertedLicenses });
});

// ── PUT /scores/:id — composer updates a score ────────────────────────────────
router.put("/scores/:id", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const id = paramInt(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid score id" }); return; }

  const [existing] = await db
    .select({ composerId: scoresTable.composerId })
    .from(scoresTable)
    .where(eq(scoresTable.id, id));

  if (!existing) { res.status(404).json({ error: "Score not found" }); return; }
  if (existing.composerId !== userId) { res.status(403).json({ error: "Not your score" }); return; }

  const {
    title, instrumentation, durationSeconds, difficulty, genre,
    description, previewPdfKey, fullPdfKey, audioDemoKey, isActive, licenses,
  } = req.body as Record<string, unknown>;

  if (
    !validateFileKey(previewPdfKey as string | null | undefined, userId) ||
    !validateFileKey(fullPdfKey as string | null | undefined, userId) ||
    !validateFileKey(audioDemoKey as string | null | undefined, userId)
  ) {
    res.status(403).json({ error: "File key does not belong to this composer" }); return;
  }

  const VALID_DIFFICULTIES = ["beginner", "intermediate", "advanced", "professional"];
  const updateData: Partial<typeof scoresTable.$inferInsert> = {};
  if (typeof title === "string") updateData.title = title.trim();
  if (typeof instrumentation === "string") updateData.instrumentation = instrumentation.trim();
  if (typeof durationSeconds === "number") updateData.durationSeconds = durationSeconds;
  if (typeof difficulty === "string" && VALID_DIFFICULTIES.includes(difficulty)) updateData.difficulty = difficulty;
  if (typeof genre === "string") updateData.genre = genre.trim();
  if (typeof description === "string") updateData.description = description.trim();
  if (typeof previewPdfKey === "string") updateData.previewPdfKey = previewPdfKey;
  if (typeof fullPdfKey === "string") updateData.fullPdfKey = fullPdfKey;
  if (typeof audioDemoKey === "string") updateData.audioDemoKey = audioDemoKey;
  if (typeof isActive === "boolean") updateData.isActive = isActive;

  const [updated] = await db
    .update(scoresTable)
    .set({ ...updateData, updatedAt: new Date() })
    .where(eq(scoresTable.id, id))
    .returning();

  let updatedLicenses: Array<typeof scoreLicensesTable.$inferSelect> = [];
  if (Array.isArray(licenses) && licenses.length > 0) {
    const VALID_LICENSE_TYPES = ["personal", "performance", "sync"];
    const validLicenses = (licenses as Array<{ licenseType: string; priceCents: number }>).filter(
      (l) => VALID_LICENSE_TYPES.includes(l.licenseType) && l.priceCents >= 100,
    );
    if (validLicenses.length > 0) {
      await db.delete(scoreLicensesTable).where(eq(scoreLicensesTable.scoreId, id));
      updatedLicenses = await db
        .insert(scoreLicensesTable)
        .values(validLicenses.map((l) => ({ scoreId: id, licenseType: l.licenseType, priceCents: l.priceCents })))
        .returning();
    }
  } else {
    updatedLicenses = await db.select().from(scoreLicensesTable).where(eq(scoreLicensesTable.scoreId, id));
  }

  res.json({ ...updated, fullPdfKey: null, hasFullPdf: !!updated.fullPdfKey, licenses: updatedLicenses });
});

// ── GET /score-licenses/purchased — buyer's purchased licenses ────────────────
router.get("/score-licenses/purchased", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;

  const rows = await db
    .select()
    .from(purchasedLicensesTable)
    .leftJoin(scoresTable, eq(purchasedLicensesTable.scoreId, scoresTable.id))
    .leftJoin(usersTable, eq(purchasedLicensesTable.composerId, usersTable.id))
    .leftJoin(teacherProfilesTable, eq(purchasedLicensesTable.composerId, teacherProfilesTable.userId))
    .where(eq(purchasedLicensesTable.buyerId, userId))
    .orderBy(desc(purchasedLicensesTable.createdAt));

  const licenses = rows.map((r) => ({
    ...r.purchased_licenses,
    score: r.scores ? { ...r.scores, fullPdfKey: null, hasFullPdf: !!r.scores.fullPdfKey } : null,
    composerName: r.users
      ? [r.users.firstName, r.users.lastName].filter(Boolean).join(" ") || r.users.email
      : null,
  }));

  res.json({ licenses });
});

// ── GET /score-licenses/:id/download — gated full PDF download ────────────────
router.get("/score-licenses/:id/download", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const id = paramInt(req.params.id);
  if (!id) { res.status(400).json({ error: "Invalid license id" }); return; }

  const [license] = await db
    .select()
    .from(purchasedLicensesTable)
    .leftJoin(scoresTable, eq(purchasedLicensesTable.scoreId, scoresTable.id))
    .where(and(eq(purchasedLicensesTable.id, id), eq(purchasedLicensesTable.buyerId, userId)));

  if (!license) { res.status(404).json({ error: "License not found" }); return; }
  if (license.purchased_licenses.status !== "active") {
    res.status(403).json({ error: "License is not active — payment required" }); return;
  }
  if (!license.scores?.fullPdfKey) {
    res.status(404).json({ error: "Full score PDF not yet available" }); return;
  }

  if (license.purchased_licenses.expiresAt && new Date(license.purchased_licenses.expiresAt) < new Date()) {
    await db.update(purchasedLicensesTable).set({ status: "expired" }).where(eq(purchasedLicensesTable.id, id));
    res.status(410).json({ error: "This sync license has expired. Please renew to continue downloading." }); return;
  }

  try {
    const url = await buildSignedUrl(license.scores.fullPdfKey);

    await db
      .update(purchasedLicensesTable)
      .set({ downloadCount: (license.purchased_licenses.downloadCount ?? 0) + 1 })
      .where(eq(purchasedLicensesTable.id, id));

    res.json({ downloadUrl: url, licenseType: license.purchased_licenses.licenseType });
  } catch {
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

// ── GET /composers/royalties — royalty summary with monthly trend ─────────────
router.get("/composers/royalties", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;

  const activeFilter = and(eq(purchasedLicensesTable.composerId, userId), eq(purchasedLicensesTable.status, "active"));

  const [totalRow, byLicenseType, recentSales, rawMonthly] = await Promise.all([
    db
      .select({ totalCents: sum(purchasedLicensesTable.priceCents), totalSales: count() })
      .from(purchasedLicensesTable)
      .where(activeFilter),
    db
      .select({
        licenseType: purchasedLicensesTable.licenseType,
        totalCents: sum(purchasedLicensesTable.priceCents),
        count: count(),
      })
      .from(purchasedLicensesTable)
      .where(activeFilter)
      .groupBy(purchasedLicensesTable.licenseType),
    db
      .select()
      .from(purchasedLicensesTable)
      .leftJoin(scoresTable, eq(purchasedLicensesTable.scoreId, scoresTable.id))
      .where(activeFilter)
      .orderBy(desc(purchasedLicensesTable.paidAt))
      .limit(10),
    // Monthly trend for the last 6 calendar months
    db
      .select({
        month: sql<string>`TO_CHAR(DATE_TRUNC('month', ${purchasedLicensesTable.paidAt}), 'YYYY-MM')`,
        totalCents: sum(purchasedLicensesTable.priceCents),
        count: count(),
      })
      .from(purchasedLicensesTable)
      .where(and(
        activeFilter,
        sql`${purchasedLicensesTable.paidAt} >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'`,
      ))
      .groupBy(sql`DATE_TRUNC('month', ${purchasedLicensesTable.paidAt})`)
      .orderBy(sql`DATE_TRUNC('month', ${purchasedLicensesTable.paidAt})`),
  ]);

  res.json({
    totalRevenueCents: Number(totalRow[0]?.totalCents ?? 0),
    totalSales: Number(totalRow[0]?.totalSales ?? 0),
    byLicenseType: byLicenseType.map((r) => ({
      licenseType: r.licenseType,
      totalCents: Number(r.totalCents ?? 0),
      count: Number(r.count ?? 0),
    })),
    monthlyTrend: rawMonthly.map((r) => ({
      month: r.month,
      totalCents: Number(r.totalCents ?? 0),
      count: Number(r.count ?? 0),
    })),
    recentSales: recentSales.map((r) => ({
      ...r.purchased_licenses,
      scoreTitle: r.scores?.title ?? null,
    })),
  });
});

export default router;
