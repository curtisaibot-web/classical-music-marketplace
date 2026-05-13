import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and } from "drizzle-orm";
import { randomBytes, randomUUID } from "crypto";
import {
  db,
  audioEnhancementJobsTable,
  teacherRecordingsTable,
  type AudioEnhancementJob,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";

const router: IRouter = Router();
const storage = new ObjectStorageService();

const PRICES: Record<string, number> = {
  standard: 999,
  professional: 2499,
};

const LEVEL_LABELS: Record<string, string> = {
  standard: "Standard Audio Enhancement ($9.99)",
  professional: "Professional Audio Enhancement ($24.99)",
};

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/wave", "audio/x-wav",
  "audio/m4a", "audio/mp4", "audio/aac", "audio/x-m4a",
]);
const MAX_AUDIO_BYTES = 50 * 1024 * 1024; // 50 MB

// ─── Request upload URL ───────────────────────────────────────────────────────

router.post(
  "/recordings/enhancement/request-upload-url",
  requireAuth,
  requireRole("teacher"),
  async (req, res): Promise<void> => {
    const { userId } = getAuth(req);
    const { contentType, fileSize } = req.body as { contentType?: string; fileSize?: number };

    if (!contentType || !ALLOWED_AUDIO_MIME_TYPES.has(contentType.toLowerCase().split(";")[0].trim())) {
      res.status(400).json({ error: "Unsupported audio type. Upload MP3, WAV, or M4A." });
      return;
    }
    if (typeof fileSize !== "number" || fileSize <= 0 || fileSize > MAX_AUDIO_BYTES) {
      res.status(400).json({ error: "File too large or invalid. Maximum size is 50 MB." });
      return;
    }

    try {
      const { uploadUrl, fileKey } = await storage.getRecordingUploadURL(userId!);
      res.json({ uploadUrl, fileKey });
    } catch (err) {
      logger.error({ err }, "Failed to generate recording upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

// ─── Create Stripe checkout for enhancement ───────────────────────────────────

router.post(
  "/recordings/enhancement/checkout",
  requireAuth,
  requireRole("teacher"),
  async (req, res): Promise<void> => {
    const { userId } = getAuth(req);
    const { inputFileKey, level, successUrl, cancelUrl } = req.body as {
      inputFileKey: string;
      level: string;
      successUrl: string;
      cancelUrl: string;
    };

    if (!inputFileKey || !level || !successUrl || !cancelUrl) {
      res.status(400).json({ error: "inputFileKey, level, successUrl, and cancelUrl are required" });
      return;
    }

    if (level !== "standard" && level !== "professional") {
      res.status(400).json({ error: "level must be 'standard' or 'professional'" });
      return;
    }

    // Enforce ownership: the file must live under this user's upload prefix (IDOR prevention)
    const expectedPrefix = `/objects/recordings/${userId}/`;
    if (!inputFileKey.startsWith(expectedPrefix)) {
      res.status(403).json({ error: "Invalid inputFileKey — file does not belong to the authenticated user" });
      return;
    }

    const pricePaidCents = PRICES[level];
    const webhookSecret = randomBytes(32).toString("hex");

    const [job] = await db
      .insert(audioEnhancementJobsTable)
      .values({
        userId: userId!,
        inputFileKey,
        level: level as "standard" | "professional",
        status: "pending",
        pricePaidCents,
        webhookSecret,
      })
      .returning();

    try {
      const { getUncachableStripeClient } = await import("../stripeClient");
      const stripe = await getUncachableStripeClient();

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        mode: "payment",
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: LEVEL_LABELS[level],
                description: "AI-enhanced audio processing — delivered within 3 minutes. Stored for 30 days.",
              },
              unit_amount: pricePaidCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "audio_enhancement",
          job_id: String(job.id),
        },
        payment_intent_data: {
          metadata: {
            type: "audio_enhancement",
            job_id: String(job.id),
          },
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      await db
        .update(audioEnhancementJobsTable)
        .set({ stripeCheckoutSessionId: session.id })
        .where(eq(audioEnhancementJobsTable.id, job.id));

      res.json({ checkoutUrl: session.url, jobId: job.id });
    } catch (err) {
      logger.error({ err, jobId: job.id }, "Failed to create enhancement checkout session");
      await db
        .delete(audioEnhancementJobsTable)
        .where(eq(audioEnhancementJobsTable.id, job.id));
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  },
);

// ─── List my enhancement jobs ─────────────────────────────────────────────────

router.get(
  "/recordings/enhancement/jobs",
  requireAuth,
  requireRole("teacher"),
  async (req, res): Promise<void> => {
    const { userId } = getAuth(req);

    const jobs = await db
      .select()
      .from(audioEnhancementJobsTable)
      .where(eq(audioEnhancementJobsTable.userId, userId!))
      .orderBy(audioEnhancementJobsTable.createdAt);

    res.json({ jobs: jobs.map(formatJob) });
  },
);

// ─── Get signed download URL for completed job ────────────────────────────────

router.get(
  "/recordings/enhancement/jobs/:id/download-url",
  requireAuth,
  requireRole("teacher"),
  async (req, res): Promise<void> => {
    const { userId } = getAuth(req);
    const id = parseInt(req.params["id"] as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid job id" }); return; }

    const [job] = await db
      .select()
      .from(audioEnhancementJobsTable)
      .where(and(eq(audioEnhancementJobsTable.id, id), eq(audioEnhancementJobsTable.userId, userId!)));

    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.status !== "done" || !job.outputFileKey) {
      res.status(409).json({ error: "Enhancement not yet complete" });
      return;
    }

    if (job.expiresAt && job.expiresAt < new Date()) {
      res.status(410).json({ error: "Enhanced file has expired (30-day limit)" });
      return;
    }

    try {
      const downloadUrl = await storage.getSignedDownloadURL(job.outputFileKey, 3600);
      res.json({ downloadUrl, expiresAt: job.expiresAt });
    } catch (err) {
      logger.error({ err, jobId: id }, "Failed to generate download URL");
      res.status(500).json({ error: "Failed to generate download URL" });
    }
  },
);

// ─── Pin enhanced recording to public profile ─────────────────────────────────

router.post(
  "/recordings/enhancement/jobs/:id/pin",
  requireAuth,
  requireRole("teacher"),
  async (req, res): Promise<void> => {
    const { userId } = getAuth(req);
    const id = parseInt(req.params["id"] as string, 10);
    if (isNaN(id)) { res.status(400).json({ error: "Invalid job id" }); return; }

    const [job] = await db
      .select()
      .from(audioEnhancementJobsTable)
      .where(and(eq(audioEnhancementJobsTable.id, id), eq(audioEnhancementJobsTable.userId, userId!)));

    if (!job) { res.status(404).json({ error: "Job not found" }); return; }
    if (job.status !== "done" || !job.outputFileKey) {
      res.status(409).json({ error: "Enhancement not yet complete" });
      return;
    }

    const { title, instrument } = req.body as { title: string; instrument?: string };
    if (!title || typeof title !== "string" || title.trim().length === 0) {
      res.status(400).json({ error: "title is required" });
      return;
    }

    // Count existing recordings for this teacher (max 5 limit)
    const existing = await db
      .select({ id: teacherRecordingsTable.id })
      .from(teacherRecordingsTable)
      .where(eq(teacherRecordingsTable.teacherId, userId!));

    if (existing.length >= 5) {
      res.status(409).json({ error: "You already have 5 recordings pinned. Remove one to add another." });
      return;
    }

    // Generate a signed download URL to use as the public recording URL
    // The URL is signed for 30 days (matching expiry of the enhanced file)
    const signedUrl = await storage.getSignedDownloadURL(job.outputFileKey, 30 * 24 * 3600);

    const [recording] = await db
      .insert(teacherRecordingsTable)
      .values({
        teacherId: userId!,
        url: signedUrl,
        title: title.trim(),
        instrument: instrument?.trim() || null,
        isEnhanced: true,
        sortOrder: existing.length,
      })
      .returning();

    res.status(201).json(recording);
  },
);

// ─── Callback from Dolby.io (or any processing service) ──────────────────────
// job_id and secret are always query params (embedded in the callback URL we register).
// status comes from the JSON request body (Dolby.io sends {"status":"Success","error":...}).
// output_url is an optional query param used for local testing only; it is strictly
// validated to a Dolby.io host to prevent SSRF.

const TRUSTED_OUTPUT_HOSTS = new Set(["api.dolby.io", "media.dolby.io", "storage.dolby.io"]);

function isTrustedOutputUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && (
      TRUSTED_OUTPUT_HOSTS.has(u.hostname) || u.hostname.endsWith(".dolby.io")
    );
  } catch {
    return false;
  }
}

router.post("/recordings/enhancement/callback", async (req, res): Promise<void> => {
  const { job_id, secret, output_url } = req.query as {
    job_id?: string;
    secret?: string;
    output_url?: string;
  };

  if (!job_id || !secret) {
    res.status(400).json({ error: "job_id and secret are required" });
    return;
  }

  const id = parseInt(job_id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid job_id" }); return; }

  const [job] = await db
    .select()
    .from(audioEnhancementJobsTable)
    .where(eq(audioEnhancementJobsTable.id, id));

  if (!job) { res.status(404).json({ error: "Job not found" }); return; }

  // Validate webhook secret (timing-safe would be ideal; this is sufficient for a low-value callback)
  if (job.webhookSecret !== secret) {
    res.status(403).json({ error: "Invalid webhook secret" });
    return;
  }

  if (job.status === "done") {
    res.json({ ok: true, message: "Already completed" });
    return;
  }

  // Status comes from the request body (Dolby sends JSON), with a fallback to query params
  // for integration testing.  Normalise: Dolby sends "Success"/"Failed", we also accept "done"/"failed".
  const body = req.body as { status?: string; error?: string } | null ?? {};
  const rawStatus = (body.status ?? "").toLowerCase();
  const normalised =
    rawStatus === "success" || rawStatus === "done"
      ? "done"
      : rawStatus === "failed" || rawStatus === "error"
      ? "failed"
      : rawStatus;

  if (normalised === "failed") {
    await db
      .update(audioEnhancementJobsTable)
      .set({ status: "failed", errorMessage: body.error ?? "Processing failed" })
      .where(eq(audioEnhancementJobsTable.id, id));
    res.json({ ok: true });
    return;
  }

  if (normalised === "done") {
    try {
      let audioBuffer: Buffer;
      let contentType = "audio/wav";

      if (output_url) {
        // Local / test path: output_url provided as query param.  SSRF guard enforced.
        if (!isTrustedOutputUrl(output_url)) {
          res.status(400).json({ error: "Untrusted output_url host — must be *.dolby.io over HTTPS" });
          return;
        }
        const response = await fetch(output_url, { signal: AbortSignal.timeout(60_000) });
        if (!response.ok) throw new Error(`Failed to fetch output: ${response.status}`);
        audioBuffer = Buffer.from(await response.arrayBuffer());
        contentType = response.headers.get("content-type") || "audio/wav";
      } else {
        // Production path: externalJobId holds the exact dlb:// output key set at job kickoff.
        const apiKey = process.env.DOLBY_API_KEY;
        if (!apiKey || !job.externalJobId) {
          throw new Error("No DOLBY_API_KEY or externalJobId — cannot retrieve output");
        }
        const outputResp = await fetch("https://api.dolby.io/media/output", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": apiKey },
          body: JSON.stringify({ url: job.externalJobId }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!outputResp.ok) throw new Error(`Dolby output API: ${outputResp.status}`);
        const { url: signedUrl } = await outputResp.json() as { url: string };

        if (!isTrustedOutputUrl(signedUrl)) throw new Error("Unexpected non-Dolby signed URL");

        const dlResp = await fetch(signedUrl, { signal: AbortSignal.timeout(120_000) });
        if (!dlResp.ok) throw new Error(`Dolby signed download: ${dlResp.status}`);
        audioBuffer = Buffer.from(await dlResp.arrayBuffer());
        contentType = dlResp.headers.get("content-type") || "audio/wav";
      }

      const outputFileKey = `/objects/recordings-enhanced/${job.userId}/${randomUUID()}.wav`;
      await storage.uploadBuffer(outputFileKey, audioBuffer, contentType);

      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await db
        .update(audioEnhancementJobsTable)
        .set({ status: "done", outputFileKey, expiresAt })
        .where(eq(audioEnhancementJobsTable.id, id));

      logger.info({ jobId: id }, "Audio enhancement job completed via callback");
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, jobId: id }, "Failed to store enhanced audio output");
      await db
        .update(audioEnhancementJobsTable)
        .set({ status: "failed", errorMessage: String(err) })
        .where(eq(audioEnhancementJobsTable.id, id));
      res.status(500).json({ error: "Failed to store output" });
    }
    return;
  }

  res.status(400).json({ error: "Unrecognised status in callback body" });
});

// ─── Trigger Dolby.io enhancement (called after payment webhook) ──────────────

export async function triggerAudioEnhancement(job: AudioEnhancementJob): Promise<void> {
  const apiKey = process.env.DOLBY_API_KEY;
  if (!apiKey) {
    logger.warn({ jobId: job.id }, "DOLBY_API_KEY not set — job stays in processing state until callback");
    return;
  }

  try {
    // Get a signed URL for the input file (valid 2 hours for Dolby to fetch)
    const signedInputUrl = await storage.getSignedDownloadURL(job.inputFileKey, 7200);

    const appBase = process.env.APP_URL ?? `https://${process.env.REPLIT_DEV_DOMAIN}`;
    const callbackUrl = `${appBase}/api/recordings/enhancement/callback?job_id=${job.id}&secret=${job.webhookSecret}`;

    // Deterministic dlb:// output key stored on the job BEFORE submitting to Dolby.
    // The callback uses this exact value for /media/output retrieval — no reconstruction needed.
    const dlbOutputKey = `dlb://out/enhanced-${job.id}-${randomUUID()}.wav`;

    await db
      .update(audioEnhancementJobsTable)
      .set({ externalJobId: dlbOutputKey })
      .where(eq(audioEnhancementJobsTable.id, job.id));

    const enhanceBody = {
      input: { url: signedInputUrl },
      output: { url: dlbOutputKey },
      content: { type: "music" },
      ...(job.level === "professional"
        ? {
            audio: {
              noise: { reduction: { enable: true, amount: "high" } },
              filter: { high_pass: { enable: true } },
              dynamics: { range_control: { enable: true } },
            },
          }
        : {
            audio: {
              noise: { reduction: { enable: true, amount: "auto" } },
              filter: { high_pass: { enable: true } },
            },
          }),
      webhook: { callback: { url: callbackUrl } },
    };

    const resp = await fetch("https://api.dolby.io/media/enhance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(enhanceBody),
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Dolby.io enhance request failed: ${resp.status} ${text}`);
    }

    // externalJobId already holds dlbOutputKey; no further update needed for output retrieval.
    await resp.json(); // consume response body

    logger.info({ jobId: job.id, dlbOutputKey }, "Dolby.io enhancement job started");
  } catch (err) {
    logger.error({ err, jobId: job.id }, "Failed to start Dolby.io enhancement — job stays in processing");
  }
}

function formatJob(job: AudioEnhancementJob) {
  return {
    id: job.id,
    level: job.level,
    status: job.status,
    pricePaidCents: job.pricePaidCents,
    inputFileKey: job.inputFileKey,
    outputFileKey: job.outputFileKey ?? null,
    errorMessage: job.errorMessage ?? null,
    createdAt: job.createdAt,
    expiresAt: job.expiresAt ?? null,
  };
}

export default router;
