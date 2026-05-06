import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import multer, { MulterError } from "multer";
import { randomUUID } from "crypto";
import { createReadStream, unlink, mkdirSync } from "fs";
import { eq, desc, and } from "drizzle-orm";
import { db, videoReelsTable, usersTable, teacherProfilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getAuth } from "@clerk/express";
import { objectStorageClient, ObjectStorageService, signObjectURL } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

// Ensure the tmp landing zone for multer disk storage always exists
mkdirSync("/tmp/reel-uploads", { recursive: true });

const REEL_MAX_FILE_SIZE_MB = Number(process.env["REEL_MAX_FILE_SIZE_MB"] ?? 500);
const N8N_REEL_WEBHOOK_URL = process.env["N8N_REEL_WEBHOOK_URL"] ?? "";

const ALLOWED_VIDEO_TYPES = new Set([
  "video/mp4",
  "video/quicktime", // .mov
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: "/tmp/reel-uploads",
    filename(_req, file, cb) {
      const ext = file.originalname.split(".").pop() ?? "mp4";
      cb(null, `${randomUUID()}.${ext}`);
    },
  }),
  limits: { fileSize: REEL_MAX_FILE_SIZE_MB * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (ALLOWED_VIDEO_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported video format. Please upload an MP4 or MOV file."));
    }
  },
});

function parsePath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

/**
 * POST /reels/upload
 *
 * Accepts a multipart video, stores in object storage, creates DB row,
 * fires webhook to n8n. Teacher role required.
 */
router.post(
  "/reels/upload",
  requireAuth,
  requireRole("teacher"),
  upload.single("file"),
  async (req: Request, res: Response) => {
    const { userId } = getAuth(req);

    if (!req.file) {
      res.status(400).json({ error: "No video file provided." });
      return;
    }

    const tmpPath = req.file.path;

    const cleanup = () => unlink(tmpPath, (err) => {
      if (err) logger.warn({ err, tmpPath }, "Failed to clean up tmp reel file");
    });

    try {
      const timestamp = Date.now();
      const ext = req.file.originalname.split(".").pop() ?? "mp4";

      const privateObjectDir = objectStorageService.getPrivateObjectDir();
      const fullPath = `${privateObjectDir}/reels/raw/${userId}/${timestamp}.${ext}`;
      const { bucketName, objectName } = parsePath(fullPath);

      const bucket = objectStorageClient.bucket(bucketName);
      const blob = bucket.file(objectName);

      // Stream from disk → GCS to avoid buffering 500 MB in RAM
      await new Promise<void>((resolve, reject) => {
        createReadStream(tmpPath)
          .pipe(
            blob.createWriteStream({
              contentType: req.file!.mimetype,
              metadata: {
                metadata: {
                  "custom:aclPolicy": JSON.stringify({ owner: userId, visibility: "private" }),
                },
              },
            })
          )
          .on("finish", resolve)
          .on("error", reject);
      });

      cleanup();

      const rawFileUrl = `https://storage.googleapis.com${fullPath}`;

      const genre = typeof req.body.genre === "string" ? req.body.genre : undefined;
      const instrumentsRaw = typeof req.body.instruments === "string" ? req.body.instruments : "";
      const instruments = instrumentsRaw
        ? instrumentsRaw.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];

      const clipStartRaw = req.body.clipStart !== undefined ? Number(req.body.clipStart) : undefined;
      const clipEndRaw = req.body.clipEnd !== undefined ? Number(req.body.clipEnd) : undefined;
      const clipStart = clipStartRaw !== undefined && isFinite(clipStartRaw) && clipStartRaw >= 0 ? clipStartRaw : undefined;
      const clipEnd = clipEndRaw !== undefined && isFinite(clipEndRaw) && clipEndRaw > 0 ? clipEndRaw : undefined;
      // clipEnd without clipStart is ambiguous — require both or neither
      if (clipEnd !== undefined && clipStart === undefined) {
        res.status(400).json({ error: "clipStart is required when clipEnd is provided" });
        return;
      }
      if (clipStart !== undefined && clipEnd !== undefined && clipEnd <= clipStart) {
        res.status(400).json({ error: "clipEnd must be greater than clipStart" });
        return;
      }

      const webhookSecret = randomUUID();

      const [teacher] = await db
        .select({
          firstName: usersTable.firstName,
          lastName: usersTable.lastName,
          city: teacherProfilesTable.city,
          genres: teacherProfilesTable.genres,
          instruments: teacherProfilesTable.instruments,
        })
        .from(usersTable)
        .leftJoin(teacherProfilesTable, eq(teacherProfilesTable.userId, usersTable.id))
        .where(eq(usersTable.id, userId!));

      // Fall back to profile genres/instruments if the upload form didn't provide them
      const effectiveGenre = (genre || teacher?.genres?.[0]) ?? undefined;
      const effectiveInstruments = instruments.length ? instruments : (teacher?.instruments ?? []);

      const [existingReel] = await db
        .select()
        .from(videoReelsTable)
        .where(eq(videoReelsTable.teacherId, userId!))
        .orderBy(desc(videoReelsTable.createdAt))
        .limit(1);

      // Archive old processed URL without touching the status so the previous
      // reel remains publicly visible until the replacement reaches "ready".
      if (existingReel && existingReel.processedFileUrl) {
        await db
          .update(videoReelsTable)
          .set({ archivedFileUrl: existingReel.processedFileUrl })
          .where(eq(videoReelsTable.id, existingReel.id));
      }

      const [reel] = await db
        .insert(videoReelsTable)
        .values({
          teacherId: userId!,
          rawFileUrl,
          status: "queued",
          genre: effectiveGenre,
          instruments: effectiveInstruments,
          webhookSecret,
        })
        .returning();

      // Build an absolute callback URL that n8n (an external service) can reach.
      // CALLBACK_BASE_URL env var overrides; otherwise derived from the request itself.
      const proto = (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
      const host = (req.headers["x-forwarded-host"] as string | undefined) ?? req.get("host") ?? "";
      const baseUrl = process.env["CALLBACK_BASE_URL"] || `${proto}://${host}`;
      const callbackUrl = `${baseUrl}/api/reels/callback`;

      if (N8N_REEL_WEBHOOK_URL) {
        // Generate a short-lived signed download URL so n8n (an external service)
        // can retrieve the raw file without needing our storage credentials.
        const signedRawUrl = await signObjectURL({
          bucketName,
          objectName,
          method: "GET",
          ttlSec: 24 * 60 * 60, // 24 hours — enough time for n8n to process
        }).catch((err: unknown) => {
          logger.warn({ err }, "Could not sign raw file URL — falling back to unsigned path");
          return rawFileUrl;
        });

        fetch(N8N_REEL_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reelId: reel.id,
            rawFileUrl: signedRawUrl,
            callbackUrl,
            webhookSecret,
            ...(clipStart !== undefined ? { clipStart } : {}),
            ...(clipEnd !== undefined ? { clipEnd } : {}),
            musician: {
              name: `${teacher?.firstName ?? ""} ${teacher?.lastName ?? ""}`.trim(),
              genre: effectiveGenre,
              instruments: effectiveInstruments,
              city: teacher?.city ?? null,
            },
          }),
          signal: AbortSignal.timeout(15_000),
        }).then(async (webhookRes) => {
          if (!webhookRes.ok) {
            logger.error({ status: webhookRes.status }, "n8n reel webhook returned non-2xx — marking reel as failed");
            await db
              .update(videoReelsTable)
              .set({ status: "failed", errorMessage: "The processing pipeline rejected the request. Please try again." })
              .where(eq(videoReelsTable.id, reel.id))
              .catch((dbErr: unknown) => logger.error({ dbErr }, "Failed to mark reel as failed after webhook rejection"));
          }
        }).catch(async (err: unknown) => {
          logger.error({ err }, "Failed to fire n8n reel webhook — marking reel as failed");
          await db
            .update(videoReelsTable)
            .set({ status: "failed", errorMessage: "Could not reach the processing pipeline. Please try again." })
            .where(eq(videoReelsTable.id, reel.id))
            .catch((dbErr: unknown) => logger.error({ dbErr }, "Failed to mark reel as failed after webhook error"));
        });
      } else {
        logger.warn("N8N_REEL_WEBHOOK_URL not set — marking reel as failed so teacher sees clear error");
        await db
          .update(videoReelsTable)
          .set({ status: "failed", errorMessage: "Video processing is not configured. Please contact support." })
          .where(eq(videoReelsTable.id, reel.id));
      }

      // Return a safe subset — webhookSecret and rawFileUrl are server-internal only
      const { webhookSecret: _secret, rawFileUrl: _raw, ...safeReel } = reel;
      res.status(201).json(safeReel);
    } catch (err) {
      cleanup();
      logger.error({ err }, "Failed to upload reel");
      res.status(500).json({ error: "Failed to upload video. Please try again." });
    }
  },
);

// Multer error handler — maps file-size and filter errors to clean 400 responses
// eslint-disable-next-line @typescript-eslint/no-unused-vars
router.use("/reels/upload", (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({ error: `File too large. Maximum size is ${REEL_MAX_FILE_SIZE_MB} MB.` });
    } else {
      res.status(400).json({ error: `Upload error: ${err.message}` });
    }
    return;
  }
  if (err instanceof Error) {
    res.status(400).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: "Unexpected upload error." });
});

/**
 * POST /reels/callback
 *
 * Called by n8n when processing completes or fails.
 * No auth — validated by webhookSecret.
 */
router.post("/reels/callback", async (req: Request, res: Response) => {
  const { reelId, webhookSecret, status, processedFileUrl, error: errMsg } = req.body as {
    reelId: number;
    webhookSecret: string;
    status: "processing" | "ready" | "failed";
    processedFileUrl?: string;
    error?: string;
  };

  // Always return 200 so n8n does not retry on our validation errors
  if (!reelId || !webhookSecret || !status) {
    res.status(200).json({ ok: true, message: "Missing required fields — ignored" });
    return;
  }

  const allowedStatuses = new Set(["processing", "ready", "failed"]);
  if (!allowedStatuses.has(status)) {
    res.status(200).json({ ok: true, message: "Unrecognised status — ignored" });
    return;
  }

  try {
    const [reel] = await db
      .select()
      .from(videoReelsTable)
      .where(eq(videoReelsTable.id, reelId))
      .limit(1);

    if (!reel) {
      res.status(200).json({ ok: true, message: "Reel not found — ignored" });
      return;
    }

    if (reel.webhookSecret !== webhookSecret) {
      res.status(200).json({ ok: true, message: "Invalid secret — ignored" });
      return;
    }

    // "ready" without a processedFileUrl would produce a broken reel — treat as failed
    if (status === "ready" && !processedFileUrl) {
      await db
        .update(videoReelsTable)
        .set({ status: "failed", errorMessage: "Processing succeeded but no output URL was provided." })
        .where(eq(videoReelsTable.id, reelId));
      res.status(200).json({ ok: true, message: "Ready status ignored — missing processedFileUrl" });
      return;
    }

    const updateFields: Record<string, unknown> = { status };

    if (status === "ready") {
      updateFields["processedFileUrl"] = processedFileUrl;
      updateFields["errorMessage"] = null;
    } else if (status === "failed") {
      updateFields["errorMessage"] = errMsg ?? "Processing failed";
    }

    await db
      .update(videoReelsTable)
      .set(updateFields as { status: "processing" | "ready" | "failed"; processedFileUrl?: string | null; errorMessage?: string | null })
      .where(eq(videoReelsTable.id, reelId));

    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Failed to process reel callback");
    res.status(200).json({ ok: true, message: "Callback received with error" });
  }
});

/**
 * GET /reels/mine
 *
 * Returns the authenticated teacher's most recent reel.
 */
router.get("/reels/mine", requireAuth, requireRole("teacher"), async (req: Request, res: Response) => {
  const { userId } = getAuth(req);

  try {
    const [reel] = await db
      .select({
        id: videoReelsTable.id,
        teacherId: videoReelsTable.teacherId,
        processedFileUrl: videoReelsTable.processedFileUrl,
        status: videoReelsTable.status,
        genre: videoReelsTable.genre,
        instruments: videoReelsTable.instruments,
        errorMessage: videoReelsTable.errorMessage,
        archivedFileUrl: videoReelsTable.archivedFileUrl,
        createdAt: videoReelsTable.createdAt,
        updatedAt: videoReelsTable.updatedAt,
      })
      .from(videoReelsTable)
      .where(eq(videoReelsTable.teacherId, userId!))
      .orderBy(desc(videoReelsTable.createdAt))
      .limit(1);

    res.json(reel ?? null);
  } catch (err) {
    logger.error({ err }, "Failed to fetch reel");
    res.status(500).json({ error: "Failed to fetch reel" });
  }
});

/**
 * GET /reels/:userId
 *
 * Public — returns the most recent *ready* reel for a musician profile page.
 * Using the newest-by-date row would expose a queued/processing reel with no
 * playable URL and would also hide the previously-live reel during replacement.
 */
router.get("/reels/:userId", async (req: Request, res: Response) => {
  const userId = req.params["userId"] as string;

  try {
    const [reel] = await db
      .select({
        id: videoReelsTable.id,
        teacherId: videoReelsTable.teacherId,
        processedFileUrl: videoReelsTable.processedFileUrl,
        status: videoReelsTable.status,
        genre: videoReelsTable.genre,
        instruments: videoReelsTable.instruments,
        createdAt: videoReelsTable.createdAt,
        updatedAt: videoReelsTable.updatedAt,
      })
      .from(videoReelsTable)
      .where(
        and(
          eq(videoReelsTable.teacherId, userId),
          eq(videoReelsTable.status, "ready")
        )
      )
      .orderBy(desc(videoReelsTable.createdAt))
      .limit(1);

    res.json(reel ?? null);
  } catch (err) {
    logger.error({ err }, "Failed to fetch reel");
    res.status(500).json({ error: "Failed to fetch reel" });
  }
});

export default router;
