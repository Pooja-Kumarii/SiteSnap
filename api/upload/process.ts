import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, sanitize, securityHeaders, uploadToR2, getContentType, getFromR2, deleteFromR2, pool } from "../_helpers.js";
import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import AdmZip from "adm-zip";
import { v4 as uuidv4 } from "uuid";
import path from "path";

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME || "sitesnap-files";

const MAX_FILE_SIZE_BYTES = 500 * 1024 * 1024;

function validateZip(buf: Buffer): { valid: boolean; reason: string } {
  try {
    if (buf.length > MAX_FILE_SIZE_BYTES) return { valid: false, reason: "ZIP too large. Max 500MB." };
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

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = requireAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Not authenticated." });

  try {
    const { r2Key, fileName } = req.body;
    if (!r2Key || !fileName) return res.status(400).json({ error: "Missing r2Key or fileName" });

    // Download the ZIP from R2 temp location
    const zipBuffer = await getFromR2(r2Key);
    if (!zipBuffer) return res.status(400).json({ error: "Upload not found. Please try again." });

    // Validate the ZIP
    const v = validateZip(zipBuffer);
    if (!v.valid) {
      // Clean up temp file
      await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }));
      return res.status(422).json({ error: "invalid_zip", message: v.reason });
    }

    // Process and upload to permanent location
    const siteId = uuidv4();
    const siteName = sanitize(fileName.replace(/\.zip$/i, "") || "Untitled Site");

    await extractAndUploadToR2(siteId, zipBuffer);

    // Delete temp file
    await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: r2Key }));

    // Save to database
    const siteUrl = `/sites/${siteId}/`;
    await pool.query(
      "INSERT INTO sites (id, user_id, name, url) VALUES ($1, $2, $3, $4)",
      [siteId, user.userId, siteName, siteUrl]
    );

    return res.json({ id: siteId, name: siteName, url: siteUrl, completed: true });
  } catch (e: any) {
    console.error("Process error:", e);
    return res.status(500).json({ error: "Failed to process site." });
  }
}