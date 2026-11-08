import { createHash, randomUUID } from "node:crypto";
import sharp, { type Metadata } from "sharp";
import type { MediaKind } from "@/generated/prisma/enums";
import { db } from "@/server/db";
import { storage } from "./index";

/**
 * Upload validation. Images are decoded and RE-ENCODED with sharp (strips EXIF,
 * embedded scripts/polyglots); SVG and animated formats are rejected. PDFs are
 * accepted only for private compliance documents.
 */
export const LIMITS = {
  LOGO: { maxBytes: 2 * 1024 * 1024, maxSide: 1024, minSide: 64 },
  SCREENSHOT: { maxBytes: 6 * 1024 * 1024, maxSide: 2560, minSide: 200 },
  PREVIEW: { maxBytes: 6 * 1024 * 1024, maxSide: 2560, minSide: 200 },
  DOCUMENT: { maxBytes: 10 * 1024 * 1024, maxSide: 0, minSide: 0 },
} as const;

export class UploadError extends Error {}

const ALLOWED_IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "avif"]);

export interface Uploader { userId?: string; adminId?: string }

export async function processImage(bytes: Uint8Array, kind: "LOGO" | "SCREENSHOT" | "PREVIEW") {
  const lim = LIMITS[kind];
  if (bytes.byteLength === 0) throw new UploadError("The file is empty.");
  if (bytes.byteLength > lim.maxBytes) throw new UploadError(`File too large (max ${Math.round(lim.maxBytes / 1048576)} MB).`);
  let meta: Metadata;
  try {
    meta = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new UploadError("Unsupported or corrupted image.");
  }
  if (!meta.format || !ALLOWED_IMAGE_FORMATS.has(meta.format)) throw new UploadError("Only JPEG, PNG, WebP or AVIF images are accepted.");
  if ((meta.pages ?? 1) > 1) throw new UploadError("Animated images are not accepted.");
  if (!meta.width || !meta.height || Math.min(meta.width, meta.height) < lim.minSide) throw new UploadError(`Image too small (min ${lim.minSide}px).`);
  const pipeline = sharp(bytes, { limitInputPixels: 40_000_000 }).rotate().resize({ width: lim.maxSide, height: lim.maxSide, fit: "inside", withoutEnlargement: true });
  const out = kind === "LOGO" ? pipeline.resize(512, 512, { fit: "cover" }) : pipeline;
  const { data, info } = await out.webp({ quality: 85 }).toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data), width: info.width, height: info.height, mimeType: "image/webp", ext: "webp" };
}

export function assertPdf(bytes: Uint8Array) {
  if (bytes.byteLength > LIMITS.DOCUMENT.maxBytes) throw new UploadError("Document too large (max 10 MB).");
  const head = Buffer.from(bytes.slice(0, 5)).toString("latin1");
  if (head !== "%PDF-") throw new UploadError("Only PDF documents are accepted.");
}

export async function storeUpload(file: File, kind: MediaKind, by: Uploader) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let body: Uint8Array, mimeType: string, ext: string, width: number | null = null, height: number | null = null;
  let visibility: "public" | "private" = "public";
  if (kind === "DOCUMENT") {
    assertPdf(bytes);
    body = bytes; mimeType = "application/pdf"; ext = "pdf"; visibility = "private";
  } else {
    const img = await processImage(bytes, kind);
    ({ data: body, mimeType, ext, width, height } = img);
  }
  const key = `${visibility}/${kind.toLowerCase()}/${new Date().toISOString().slice(0, 7)}/${randomUUID()}.${ext}`;
  await (await storage()).put(key, body, mimeType);
  return db.mediaAsset.create({
    data: {
      kind, storageKey: key, mimeType, byteSize: body.byteLength, sha256: createHash("sha256").update(body).digest("hex"),
      width, height, uploadedByUserId: by.userId ?? null, uploadedByAdminId: by.adminId ?? null,
      // Uploaded media is reviewed together with the listing revision it belongs to.
      moderationStatus: "PENDING",
    },
  });
}
