import { Router, type IRouter, type Request, type Response } from "express";
import { Readable } from "stream";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";
import { ObjectStorageService } from "../lib/objectStorage";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";
import { getAuth } from "@clerk/express";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload. Teachers only.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * The returned presigned URL encodes the teacher's userId in the path so
 * files are namespaced per teacher: /objects/uploads/{teacherId}/{uuid}
 */
router.post(
  "/storage/uploads/request-url",
  requireAuth,
  requireRole("teacher"),
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;
      const { userId } = getAuth(req);

      const { uploadUrl, fileKey } = await objectStorageService.getObjectEntityUploadURL(userId!);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL: uploadUrl,
          objectPath: fileKey,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Error generating upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

/**
 * POST /storage/images/request-url
 *
 * Request a presigned URL to upload a public-facing image (profile photo,
 * listing image). Teachers only. Files land in the /images/ namespace,
 * which is entirely separate from the /uploads/ namespace used for private
 * digital product files.
 */
const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

router.post(
  "/storage/images/request-url",
  requireAuth,
  requireRole("teacher"),
  async (req: Request, res: Response) => {
    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required fields" });
      return;
    }

    const { name, size, contentType } = parsed.data;

    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      res.status(400).json({
        error: "Unsupported image type. Allowed types: JPEG, PNG, WebP, GIF.",
      });
      return;
    }

    try {
      const { userId } = getAuth(req);

      const { uploadUrl, fileKey } = await objectStorageService.getImageUploadURL(userId!);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL: uploadUrl,
          objectPath: fileKey,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, "Error generating image upload URL");
      res.status(500).json({ error: "Failed to generate upload URL" });
    }
  },
);

/**
 * GET /storage/objects/images/:teacherId/:fileId
 *
 * Serve public-facing images (profile photos, listing images).
 * Scoped strictly to the /images/ namespace — digital product files
 * in /uploads/ are unreachable from this route.
 *
 * Access control:
 * - No authentication required: these images appear on public teacher/listing pages.
 * - teacherId and fileId validated with /^[\w-]+$/ to block path traversal.
 */
router.get(
  "/storage/objects/images/:teacherId/:fileId",
  async (req: Request, res: Response) => {
    const { teacherId, fileId } = req.params;

    const SAFE_ID = /^[\w-]+$/;
    if (!SAFE_ID.test(teacherId) || !SAFE_ID.test(fileId)) {
      res.status(400).json({ error: "Invalid object path" });
      return;
    }

    const objectPath = `/objects/images/${teacherId}/${fileId}`;

    try {
      const file = await objectStorageService.getImageFile(objectPath);
      const response = await objectStorageService.downloadObject(file, 86400);

      res.status(response.status);
      response.headers.forEach((value, key) => res.setHeader(key, value));

      if (response.body) {
        const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
        nodeStream.pipe(res);
      } else {
        res.end();
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === "ObjectNotFoundError") {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      req.log.error({ err: error }, "Error serving image");
      res.status(500).json({ error: "Failed to serve image" });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 */
router.get("/storage/public-objects/*filePath", async (req: Request, res: Response) => {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join("/") : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: "File not found" });
      return;
    }

    const response = await objectStorageService.downloadObject(file);

    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));

    if (response.body) {
      const nodeStream = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (error) {
    req.log.error({ err: error }, "Error serving public object");
    res.status(500).json({ error: "Failed to serve public object" });
  }
});

export default router;
