import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, sanitize, isValidUUID, uploadToR2, getContentType, securityHeaders, R2_BUCKET } from "../_helpers.js";
import AdmZip from "adm-zip";
import { v4 as uuidv4 } from "uuid";
import { pool } from "../_helpers.js";
import path from "path";

// ── In-memory chunk store (works for single serverless instance) ──────────────
const chunkStore = new Map<string, { chunks: Map<number, Buffer>; total: number; fileName: string }>();

const MAX_FILE_SIZE_MB = 500;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

function validateZip(buf: Buffer): { valid: boolean; reason: string } {
  try {
    if (buf.length > MAX_FILE_SIZE_BYTES) return { valid: false, reason: `ZIP too large. Max ${MAX_FILE_SIZE_MB}MB.` };
    const zip = new AdmZip(buf);
    const entries = zip.getEntries();
    if (!entries?.length) return { valid: false, reason: "ZIP is empty." };
    if (entries.length > 10000) return { valid: false, reason: "ZIP contains too many files." };
    for (const entry of entries) {
      if (entry.entryName.includes("../") || entry.entryName.includes("..\\")) return { valid: false, reason: "Invalid ZIP: unsafe paths." };
    }
    const idx = entries.find(e => { const n = e.entryName.toLowerCase(); return !e.isDirectory && !n.includes("__macosx") && (n === "index.html" || n.endsWith("/index.html")); });
    if (!idx) return { valid: false, reason: "No index.html found." };
    const content = idx.getData().toString("utf-8").toLowerCase().trim();
    if (content.length < 50) return { valid: false, reason: "index.html too small." };
    if (!content.includes("<html") && !content.includes("<!doctype")) return { valid: false, reason: "Not valid HTML." };
    const names = entries.map(e => e.entryName.toLowerCase());
    if (names.some(f => f === "package.json" || f.endsWith("/package.json")) && names.some(f => f === "server.ts" || f.endsWith("/server.ts"))) return { valid: false, reason: "Looks like source code." };
    if (!names.some(f => f.endsWith(".css") || f.endsWith(".js"))) return { valid: false, reason: "No CSS or JS files found." };
    return { valid: true, reason: "ok" };
  } catch { return { valid: false, reason: "Could not read ZIP." }; }
}

function rewriteHtml(html: string, base: string): string {
  html = html.replace(/(<a\s[^>]*href=["'])\/(?!\/)([^"']*)(["'])/gi, (m,b,u,a) => u.startsWith("//") || u.startsWith("#") ? m : `${b}${base}${u}${a}`);
  html = html.replace(/(<form\s[^>]*action=["'])\/(?!\/)([^"']*)(["'])/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
  html = html.replace(/(<link\s[^>]*href=["'])\/(?!\/)([^"']+)(["'][^>]*>)/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
  html = html.replace(/(<script\s[^>]*src=["'])\/(?!\/)([^"']+)(["'][^>]*>)/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
  html = html.replace(/(<img\s[^>]*src=["'])\/(?!\/)([^"']+)(["'])/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
  html = html.replace(/url\(['"]?\/(?!\/)([^'")]+)['"]?\)/gi, (_,u) => `url('${base}${u}')`);
  html = html.replace(/<script[^>]+src=["'][^"']*@vite[^"']*["'][^>]*><\/script>/gi, "");
  return html;
}

function rewriteCss(css: string, base: string): string {
  return css.replace(/url\(['"]?\/(?!\/)([^'")]+)['"]?\)/gi, (_,u) => `url('${base}${u}')`);
}

async function extractAndUploadToR2(siteId: string, zipBuffer: Buffer): Promise<void> {
  const base = `/sites/${siteId}/`;
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  let rootPrefix = "";
  const indexEntry = entries.find(e => {
    const n = e.entryName.toLowerCase();
    return !e.isDirectory && !n.includes("__macosx") && (n === "index.html" || n.endsWith("/index.html"));
  });
  if (indexEntry) {
    const parts = indexEntry.entryName.split("/");
    if (parts.length > 1) rootPrefix = parts.slice(0, -1).join("/") + "/";
  }

  for (const entry of entries) {
    if (entry.isDirectory || entry.entryName.toLowerCase().includes("__macosx")) continue;
    let key = entry.entryName;
    if (rootPrefix && key.startsWith(rootPrefix)) key = key.slice(rootPrefix.length);
    if (!key) continue;

    const r2Key = `sites/${siteId}/${key}`;
    let data = entry.getData();
    const ext = path.extname(key).toLowerCase();

    if (ext === ".html" || ext === ".htm") {
      data = Buffer.from(rewriteHtml(data.toString("utf-8"), base), "utf-8");
    } else if (ext === ".css") {
      data = Buffer.from(rewriteCss(data.toString("utf-8"), base), "utf-8");
    }

    await uploadToR2(r2Key, data, getContentType(ext));
  }
}

export const config = { api: { bodyParser: { sizeLimit: "525mb" } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = requireAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Not authenticated." });

  try {
    const { uploadId, chunkIndex, totalChunks, fileName, chunkData } = req.body;

    if (!uploadId || !/^[a-z0-9]+$/i.test(uploadId) || uploadId.length > 50) return res.status(400).json({ error: "Invalid upload ID." });
    const chunkIdx = parseInt(chunkIndex);
    const totalChunksNum = parseInt(totalChunks);
    if (isNaN(chunkIdx) || isNaN(totalChunksNum) || chunkIdx < 0 || totalChunksNum > 1000) return res.status(400).json({ error: "Invalid chunk parameters." });

    // Store chunk in memory
    if (!chunkStore.has(uploadId)) {
      chunkStore.set(uploadId, { chunks: new Map(), total: totalChunksNum, fileName });
    }
    const upload = chunkStore.get(uploadId)!;
    const chunkBuffer = Buffer.from(chunkData, "base64");
    upload.chunks.set(chunkIdx, chunkBuffer);

    if (upload.chunks.size === totalChunksNum) {
      // All chunks received — assemble
      const parts: Buffer[] = [];
      for (let i = 0; i < totalChunksNum; i++) {
        const chunk = upload.chunks.get(i);
        if (!chunk) throw new Error(`Missing chunk ${i}`);
        parts.push(chunk);
      }
      const zipBuffer = Buffer.concat(parts);
      chunkStore.delete(uploadId);

      const v = validateZip(zipBuffer);
      if (!v.valid) return res.status(422).json({ error: "invalid_zip", message: v.reason });

      const siteId = uuidv4();
      const siteName = sanitize((fileName as string).replace(/\.zip$/i, "") || "Untitled Site");

      await extractAndUploadToR2(siteId, zipBuffer);

      const siteUrl = `/sites/${siteId}/`;
      await pool.query("INSERT INTO sites (id, user_id, name, url) VALUES ($1, $2, $3, $4)", [siteId, user.userId, siteName, siteUrl]);

      return res.json({ id: siteId, name: siteName, url: siteUrl, completed: true });
    }

    res.json({ chunkReceived: true, progress: Math.round((upload.chunks.size / totalChunksNum) * 100) });
  } catch (e: any) {
    console.error("Upload error:", e);
    res.status(500).json({ error: "Upload failed." });
  }
}