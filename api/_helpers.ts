import pkg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const { Pool } = pkg;

// ── Database ──────────────────────────────────────────────────────────────────
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 1, // Keep low for serverless
});

// ── R2 Client ─────────────────────────────────────────────────────────────────
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export const R2_BUCKET = process.env.R2_BUCKET_NAME || "sitesnap-files";

// ── R2 Helpers ────────────────────────────────────────────────────────────────
export async function uploadToR2(key: string, buffer: Buffer, contentType = "application/octet-stream") {
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: buffer, ContentType: contentType }));
}

export async function deleteFromR2(prefix: string) {
  try {
    const list = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix }));
    if (!list.Contents?.length) return;
    for (const obj of list.Contents) {
      if (obj.Key) await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key }));
    }
  } catch (e) { console.error("R2 delete error:", e); }
}

export async function getFromR2(key: string): Promise<Buffer | null> {
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    if (!res.Body) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as any) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch { return null; }
}

// ── Security helpers ──────────────────────────────────────────────────────────
export function sanitize(str: string): string {
  return String(str).trim().slice(0, 500).replace(/[<>]/g, "");
}
export function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}
export function isValidPassword(p: string): boolean {
  return p.length >= 8 && p.length <= 128;
}
export function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
export function requireAuth(authHeader: string | undefined): { userId: string; email: string } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  if (token.length > 2048) return null;
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as { userId: string; email: string };
  } catch { return null; }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(userId: string, email: string): string {
  return jwt.sign({ userId, email }, process.env.JWT_SECRET!, { expiresIn: "7d" });
}

// ── Content type helper ───────────────────────────────────────────────────────
export function getContentType(ext: string): string {
  const types: Record<string, string> = {
    ".html": "text/html", ".htm": "text/html", ".css": "text/css",
    ".js": "application/javascript", ".mjs": "application/javascript",
    ".json": "application/json", ".xml": "application/xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
    ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
    ".ttf": "font/ttf", ".otf": "font/otf", ".txt": "text/plain",
    ".webmanifest": "application/manifest+json",
  };
  return types[ext] || "application/octet-stream";
}

// ── Security headers ──────────────────────────────────────────────────────────
export const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};