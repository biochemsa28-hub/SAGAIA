// ─── Unified storage layer ────────────────────────────────────────────────────
// One place to upload files and get a public URL. Prefers Cloudflare R2 (durable,
// cheap, zero-egress, decoupled from fal balance) when configured; otherwise falls
// back to fal.storage so nothing breaks before R2 is set up.
//
// Configure R2 with these env vars (Cloudflare → R2 → bucket + API token):
//   R2_ACCOUNT_ID=...            (your Cloudflare account id)
//   R2_ACCESS_KEY_ID=...         (R2 API token access key)
//   R2_SECRET_ACCESS_KEY=...     (R2 API token secret)
//   R2_BUCKET=vynavo             (bucket name)
//   R2_PUBLIC_URL=https://cdn.tudominio.com   (public bucket URL / custom domain)
//
// nano-banana / Seedance can read these public URLs directly as references.

import { randomUUID } from "crypto";

export interface UploadResult {
  url: string;      // public URL
  key: string;      // storage key (r2_key) — persist alongside the asset
  provider: "r2" | "fal";
}

function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET &&
    process.env.R2_PUBLIC_URL
  );
}

// Upload to Cloudflare R2 via the S3-compatible API using aws4fetch (tiny, ~4KB,
// signs the PUT request — no heavy AWS SDK, works on any runtime).
async function uploadToR2(buffer: Buffer, key: string, contentType: string): Promise<UploadResult> {
  const { AwsClient } = await import("aws4fetch");
  const aws = new AwsClient({
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    region: "auto",
    service: "s3",
  });
  const endpoint = `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${process.env.R2_BUCKET}/${key}`;
  const bytes = new Uint8Array(buffer);

  // aws4fetch hashes the byte body to sign (correct signature). But Next patches
  // global fetch and drops Content-Length for typed-array bodies → R2 returns 411.
  // Fix: SIGN with the bytes, then SEND with a Blob body — fetch derives a reliable
  // Content-Length from the Blob's known size, and the payload hash still matches.
  const signed = await aws.sign(endpoint, {
    method: "PUT",
    headers: { "content-type": contentType },
    body: bytes,
  });
  const res = await fetch(endpoint, {
    method: "PUT",
    headers: signed.headers,
    body: new Blob([bytes], { type: contentType }),
  });
  if (!res.ok) throw new Error(`R2 upload failed ${res.status}: ${(await res.text()).slice(0, 160)}`);
  const base = process.env.R2_PUBLIC_URL!.replace(/\/+$/, "");
  return { url: `${base}/${key}`, key, provider: "r2" };
}

// Fallback: fal.storage (temporary, couples to fal balance — pre-R2 default).
async function uploadToFal(buffer: Buffer, ext: string, contentType: string): Promise<UploadResult> {
  const { fal } = await import("@fal-ai/client");
  fal.config({ credentials: process.env.FAL_API_KEY });
  const file = new File([new Uint8Array(buffer)], `upload.${ext}`, { type: contentType });
  const url = await fal.storage.upload(file) as string;
  return { url, key: url, provider: "fal" };
}

// Public entry point — uploads a buffer and returns a public URL.
// `folder` groups objects (e.g. "uploads", "images", "videos").
export async function uploadBuffer(params: {
  buffer: Buffer;
  ext: string;              // "jpg" | "png" | "webp" | "mp4" | "mp3" …
  contentType: string;
  folder?: string;
}): Promise<UploadResult> {
  const { buffer, ext, contentType } = params;
  const folder = (params.folder ?? "uploads").replace(/^\/+|\/+$/g, "");
  const key = `${folder}/${randomUUID()}.${ext}`;
  if (r2Configured()) return uploadToR2(buffer, key, contentType);
  return uploadToFal(buffer, ext, contentType);
}

export function storageProvider(): "r2" | "fal" {
  return r2Configured() ? "r2" : "fal";
}

// Re-host an EXTERNAL, ephemeral URL (fal.media clip, Shotstack S3 output) into
// durable R2 storage so it never expires and you own your paid output. Returns the
// permanent R2 URL. If R2 isn't configured OR the download fails, returns the
// original URL unchanged (graceful — never blocks the pipeline).
export async function rehostToR2(sourceUrl: string, folder: string, ext: string, contentType: string): Promise<string> {
  if (!r2Configured() || !sourceUrl || sourceUrl.startsWith(process.env.R2_PUBLIC_URL ?? "\0")) {
    return sourceUrl; // already on R2, or R2 off → leave as-is
  }
  try {
    const res = await fetch(sourceUrl);
    if (!res.ok) return sourceUrl;
    const buffer = Buffer.from(await res.arrayBuffer());
    const { url } = await uploadBuffer({ buffer, ext, contentType, folder });
    return url;
  } catch {
    return sourceUrl; // never break the pipeline over a re-host failure
  }
}
