import { Storage, File } from "@google-cloud/storage";
import { Readable } from "stream";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
}

async function getObjectAclPolicy(objectFile: File): Promise<ObjectAclPolicy | null> {
  const [metadata] = await objectFile.getMetadata();
  const raw = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  if (!raw) return null;
  return JSON.parse(raw as string) as ObjectAclPolicy;
}

export class ObjectStorageService {
  constructor() {}

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Create a bucket in 'Object Storage' " +
          "tool and set PUBLIC_OBJECT_SEARCH_PATHS env var (comma-separated paths)."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Create a bucket in 'Object Storage' " +
          "tool and set PRIVATE_OBJECT_DIR env var."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<File | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;

      const { bucketName, objectName } = parseObjectPath(fullPath);
      const bucket = objectStorageClient.bucket(bucketName);
      const file = bucket.file(objectName);

      const [exists] = await file.exists();
      if (exists) {
        return file;
      }
    }

    return null;
  }

  async downloadObject(file: File, cacheTtlSec: number = 3600): Promise<Response> {
    const [metadata] = await file.getMetadata();
    const aclPolicy = await getObjectAclPolicy(file);
    const isPublic = aclPolicy?.visibility === "public";

    const nodeStream = file.createReadStream();
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    const headers: Record<string, string> = {
      "Content-Type": (metadata.contentType as string) || "application/octet-stream",
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (metadata.size) {
      headers["Content-Length"] = String(metadata.size);
    }

    return new Response(webStream, { headers });
  }

  async getObjectEntityUploadURL(teacherId: string): Promise<{ uploadUrl: string; fileKey: string }> {
    const privateObjectDir = this.getPrivateObjectDir();

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${teacherId}/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadUrl = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });

    const fileKey = `/objects/uploads/${teacherId}/${objectId}`;
    return { uploadUrl, fileKey };
  }

  /**
   * Generate a presigned PUT URL for uploading a public-facing image
   * (profile photos, listing images). Files land in the /images/ namespace,
   * which is separate from the /uploads/ namespace used for private digital
   * product files.
   */
  async getImageUploadURL(teacherId: string): Promise<{ uploadUrl: string; fileKey: string }> {
    const privateObjectDir = this.getPrivateObjectDir();

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/images/${teacherId}/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadUrl = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });

    const fileKey = `/objects/images/${teacherId}/${objectId}`;
    return { uploadUrl, fileKey };
  }

  /**
   * Retrieve an image file from the /images/ namespace. Only serves
   * paths that start with /objects/images/ — rejects anything else.
   */
  async getImageFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/images/")) {
      throw new ObjectNotFoundError();
    }

    const entityId = objectPath.slice("/objects/images/".length);
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const fullPath = `${entityDir}images/${entityId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  async getObjectEntityFile(objectPath: string): Promise<File> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const objectFile = bucket.file(objectName);
    const [exists] = await objectFile.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return objectFile;
  }

  /**
   * Generate a presigned PUT URL for uploading a raw audio recording.
   * Files land in the /recordings/ namespace, separate from uploads and images.
   */
  async getRecordingUploadURL(userId: string): Promise<{ uploadUrl: string; fileKey: string }> {
    const privateObjectDir = this.getPrivateObjectDir();

    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/recordings/${userId}/${objectId}`;

    const { bucketName, objectName } = parseObjectPath(fullPath);

    const uploadUrl = await signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });

    const fileKey = `/objects/recordings/${userId}/${objectId}`;
    return { uploadUrl, fileKey };
  }

  /**
   * Generate a presigned GET URL for downloading a file (used for enhanced audio delivery).
   */
  async getSignedDownloadURL(fileKey: string, ttlSec: number = 3600): Promise<string> {
    if (!fileKey.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const entityId = fileKey.slice("/objects/".length);
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const fullPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({ bucketName, objectName, method: "GET", ttlSec });
  }

  /**
   * Upload a buffer directly to object storage (used for storing Dolby.io output).
   */
  async uploadBuffer(fileKey: string, buffer: Buffer, contentType: string): Promise<void> {
    if (!fileKey.startsWith("/objects/")) {
      throw new Error("fileKey must start with /objects/");
    }

    const entityId = fileKey.slice("/objects/".length);
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const fullPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);
    const bucket = objectStorageClient.bucket(bucketName);
    const file = bucket.file(objectName);
    await file.save(buffer, { contentType, resumable: false });
  }

  normalizeObjectEntityPath(rawPath: string): string {
    if (!rawPath.startsWith("https://storage.googleapis.com/")) {
      return rawPath;
    }

    const url = new URL(rawPath);
    const rawObjectPath = url.pathname;

    let objectEntityDir = this.getPrivateObjectDir();
    if (!objectEntityDir.endsWith("/")) {
      objectEntityDir = `${objectEntityDir}/`;
    }

    if (!rawObjectPath.startsWith(objectEntityDir)) {
      return rawObjectPath;
    }

    const entityId = rawObjectPath.slice(objectEntityDir.length);
    return `/objects/${entityId}`;
  }
}

function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return {
    bucketName,
    objectName,
  };
}

export async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const request = {
    bucket_name: bucketName,
    object_name: objectName,
    method,
    expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
  };
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `Failed to sign object URL, errorcode: ${response.status}, ` +
        `make sure you're running on Replit`
    );
  }

  const { signed_url: signedURL } = (await response.json()) as { signed_url: string };
  return signedURL;
}
