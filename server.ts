import 'dotenv/config';
import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import AdmZip from "adm-zip";
import pkg from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

const { Pool } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Environment Variables ─────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "9f86c069dcf685a55eae79a7d87560d3";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "d1ab17730deef3cd65a1b3446b08653f";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "f308d41bef8e7f90831d6f28e3e43e471e753bee69091ddbc4a5cb992e7b72c4";
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || "sitesnap-files";

if (!DATABASE_URL) throw new Error("❌ DATABASE_URL environment variable is required!");
if (!JWT_SECRET) throw new Error("❌ JWT_SECRET environment variable is required!");

// ── Database ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// ── Cloudflare R2 Client ──────────────────────────────────────────────────────
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// ── R2 Helpers ────────────────────────────────────────────────────────────────
async function uploadToR2(key: string, buffer: Buffer, contentType = "application/octet-stream") {
  await r2.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
}

async function deleteFromR2(prefix: string) {
  try {
    const list = await r2.send(new ListObjectsV2Command({ Bucket: R2_BUCKET_NAME, Prefix: prefix }));
    if (!list.Contents?.length) return;
    for (const obj of list.Contents) {
      if (obj.Key) await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET_NAME, Key: obj.Key }));
    }
  } catch (e) { console.error("R2 delete error:", e); }
}

async function getFromR2(key: string): Promise<Buffer | null> {
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key }));
    if (!res.Body) return null;
    const chunks: Uint8Array[] = [];
    for await (const chunk of res.Body as any) chunks.push(chunk);
    return Buffer.concat(chunks);
  } catch { return null; }
}

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_FILE_SIZE_MB = 500;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// ── Security helpers ──────────────────────────────────────────────────────────
function isSafePath(basePath: string, targetPath: string): boolean {
  return path.resolve(targetPath).startsWith(path.resolve(basePath));
}
function isValidUUID(str: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}
function sanitize(str: string): string {
  return String(str).trim().slice(0, 500).replace(/[<>]/g, "");
}
function isValidEmail(e: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;
}
function isValidPassword(p: string): boolean {
  return p.length >= 8 && p.length <= 128;
}

// ── Auth Middleware ───────────────────────────────────────────────────────────
function requireAuth(req: any, res: any, next: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Not authenticated. Please log in." });
  const token = authHeader.split(" ")[1];
  if (token.length > 2048) return res.status(401).json({ error: "Invalid token." });
  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as { userId: string; email: string };
    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired session. Please log in again." });
  }
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || "3000");

  const tempDir = path.join(__dirname, "uploads", "temp");
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

  // ── Security headers ──────────────────────────────────────────────────────
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });

  // ── Rate limiters ─────────────────────────────────────────────────────────
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: "Too many attempts. Please wait 15 minutes." }, standardHeaders: true, legacyHeaders: false });
  const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, message: { error: "Too many requests." } });
  const uploadLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: "Upload limit reached. Max 10 uploads per hour." } });

  // ── Multer ────────────────────────────────────────────────────────────────
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/zip" || file.originalname.toLowerCase().endsWith(".zip")) cb(null, true);
      else cb(new Error("Only ZIP files are allowed"));
    }
  });

  // ── ZIP helpers ───────────────────────────────────────────────────────────
  const rewriteHtml = (html: string, base: string): string => {
    html = html.replace(/(<a\s[^>]*href=["'])\/(?!\/)([^"']*)(["'])/gi, (m,b,u,a) => u.startsWith("//") || u.startsWith("#") ? m : `${b}${base}${u}${a}`);
    html = html.replace(/(<form\s[^>]*action=["'])\/(?!\/)([^"']*)(["'])/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
    html = html.replace(/(<link\s[^>]*href=["'])\/(?!\/)([^"']+)(["'][^>]*>)/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
    html = html.replace(/(<script\s[^>]*src=["'])\/(?!\/)([^"']+)(["'][^>]*>)/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
    html = html.replace(/(<img\s[^>]*src=["'])\/(?!\/)([^"']+)(["'])/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
    html = html.replace(/url\(['"]?\/(?!\/)([^'")]+)['"]?\)/gi, (_,u) => `url('${base}${u}')`);
    html = html.replace(/<script[^>]+src=["'][^"']*@vite[^"']*["'][^>]*><\/script>/gi, "");
    return html;
  };

  const rewriteCss = (css: string, base: string): string => {
    return css.replace(/url\(['"]?\/(?!\/)([^'")]+)['"]?\)/gi, (_,u) => `url('${base}${u}')`);
  };

  const validateZip = (buf: Buffer): { valid: boolean; reason: string } => {
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
  };

  // ── Upload ZIP to R2 (extract + rewrite + upload each file) ──────────────
  async function extractAndUploadToR2(siteId: string, zipBuffer: Buffer): Promise<string> {
    const base = `/sites/${siteId}/`;
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();

    // Find the root folder containing index.html
    let rootPrefix = "";
    const indexEntry = entries.find(e => {
      const n = e.entryName.toLowerCase();
      return !e.isDirectory && !n.includes("__macosx") && (n === "index.html" || n.endsWith("/index.html"));
    });
    if (indexEntry) {
      const parts = indexEntry.entryName.split("/");
      if (parts.length > 1) rootPrefix = parts.slice(0, -1).join("/") + "/";
    }

    let uploadCount = 0;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      if (entry.entryName.toLowerCase().includes("__macosx")) continue;

      let key = entry.entryName;
      if (rootPrefix && key.startsWith(rootPrefix)) key = key.slice(rootPrefix.length);
      if (!key) continue;

      const r2Key = `sites/${siteId}/${key}`;
      let data = entry.getData();
      const ext = path.extname(key).toLowerCase();

      // Rewrite HTML and CSS files
      if (ext === ".html" || ext === ".htm") {
        let html = data.toString("utf-8");
        html = rewriteHtml(html, base);
        data = Buffer.from(html, "utf-8");
      } else if (ext === ".css") {
        let css = data.toString("utf-8");
        css = rewriteCss(css, base);
        data = Buffer.from(css, "utf-8");
      }

      const contentType = getContentType(ext);
      await uploadToR2(r2Key, data, contentType);
      uploadCount++;
    }

    console.log(`✅ Uploaded ${uploadCount} files to R2 for site ${siteId}`);
    return base;
  }

  function getContentType(ext: string): string {
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

  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  app.use("/api", apiLimiter);
  app.use((req, _res, next) => { console.log(`[${req.method}] ${req.url}`); next(); });

  // ── AUTH ──────────────────────────────────────────────────────────────────
  app.post("/api/auth/signup", authLimiter, async (req, res) => {
    try {
      const email = sanitize(req.body.email || "").toLowerCase();
      const password = sanitize(req.body.password || "");
      if (!isValidEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });
      if (!isValidPassword(password)) return res.status(400).json({ error: "Password must be at least 8 characters." });
      const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
      if (existing.rows.length > 0) return res.status(409).json({ error: "An account with this email already exists." });
      const hashed = await bcrypt.hash(password, 12);
      const result = await pool.query("INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email", [email, hashed]);
      const user = result.rows[0];
      const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET!, { expiresIn: "7d" });
      res.status(201).json({ token, user: { id: user.id, email: user.email } });
    } catch (e) { console.error("Signup error:", e); res.status(500).json({ error: "Something went wrong." }); }
  });

  app.post("/api/auth/login", authLimiter, async (req, res) => {
    try {
      const email = sanitize(req.body.email || "").toLowerCase();
      const password = sanitize(req.body.password || "");
      if (!isValidEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });
      if (!password) return res.status(400).json({ error: "Please enter your password." });
      const result = await pool.query("SELECT id, email, password FROM users WHERE email = $1", [email]);
      if (result.rows.length === 0) return res.status(401).json({ error: "Invalid email or password." });
      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password);
      if (!match) return res.status(401).json({ error: "Invalid email or password." });
      const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET!, { expiresIn: "7d" });
      res.json({ token, user: { id: user.id, email: user.email } });
    } catch (e) { console.error("Login error:", e); res.status(500).json({ error: "Something went wrong." }); }
  });

  app.get("/api/auth/me", requireAuth, async (req: any, res) => {
    try {
      const r = await pool.query("SELECT id, email, created_at FROM users WHERE id = $1", [req.user.userId]);
      if (!r.rows.length) return res.status(404).json({ error: "User not found." });
      res.json({ user: r.rows[0] });
    } catch { res.status(500).json({ error: "Something went wrong." }); }
  });

  // ── SITES ─────────────────────────────────────────────────────────────────
  app.get("/api/sites", requireAuth, async (req: any, res) => {
    try {
      const rows = await pool.query("SELECT * FROM sites WHERE user_id = $1 ORDER BY created_at DESC", [req.user.userId]);
      res.json(rows.rows);
    } catch (e) { console.error(e); res.status(500).json({ error: "Failed to fetch sites" }); }
  });

  app.post("/api/upload/chunk", requireAuth, uploadLimiter, (req, res, next) => {
    upload.single("chunk")(req, res, (err) => { if (err) return res.status(400).json({ error: err.message }); next(); });
  }, async (req: any, res) => {
    try {
      const { uploadId, chunkIndex, totalChunks, fileName } = req.body;
      if (!req.file) return res.status(400).json({ error: "No chunk uploaded" });
      if (!uploadId || !/^[a-z0-9]+$/i.test(uploadId) || uploadId.length > 50) return res.status(400).json({ error: "Invalid upload ID." });
      const chunkIdx = parseInt(chunkIndex);
      const totalChunksNum = parseInt(totalChunks);
      if (isNaN(chunkIdx) || isNaN(totalChunksNum) || chunkIdx < 0 || totalChunksNum > 1000) return res.status(400).json({ error: "Invalid chunk parameters." });

      const chunkDir = path.join(tempDir, uploadId);
      if (!isSafePath(tempDir, chunkDir)) return res.status(400).json({ error: "Invalid path." });
      if (!fs.existsSync(chunkDir)) fs.mkdirSync(chunkDir, { recursive: true });
      fs.writeFileSync(path.join(chunkDir, chunkIdx.toString()), req.file.buffer);
      const uploaded = fs.readdirSync(chunkDir).length;

      if (uploaded === totalChunksNum) {
        const siteId = uuidv4();
        const siteName = sanitize(fileName.replace(/\.zip$/i, "") || "Untitled Site");
        const finalZip = path.join(tempDir, `${uploadId}.zip`);

        try {
          const ws = fs.createWriteStream(finalZip);
          for (let i = 0; i < totalChunksNum; i++) {
            const pp = path.join(chunkDir, i.toString());
            if (!fs.existsSync(pp)) throw new Error(`Missing chunk ${i}`);
            ws.write(fs.readFileSync(pp));
          }
          ws.end();
          await new Promise<void>((resolve, reject) => { ws.on("finish", resolve); ws.on("error", reject); });

          const buf = fs.readFileSync(finalZip);
          const v = validateZip(buf);
          if (!v.valid) {
            fs.rmSync(chunkDir, { recursive: true, force: true });
            fs.unlinkSync(finalZip);
            return res.status(422).json({ error: "invalid_zip", message: v.reason });
          }

          // ✅ Upload to Cloudflare R2
          await extractAndUploadToR2(siteId, buf);

          fs.rmSync(chunkDir, { recursive: true, force: true });
          fs.unlinkSync(finalZip);

          const siteUrl = `/sites/${siteId}/`;
          await pool.query("INSERT INTO sites (id, user_id, name, url) VALUES ($1, $2, $3, $4)", [siteId, req.user.userId, siteName, siteUrl]);
          return res.json({ id: siteId, name: siteName, url: siteUrl, completed: true });
        } catch (e: any) {
          if (fs.existsSync(finalZip)) fs.unlinkSync(finalZip);
          console.error("Upload error:", e);
          return res.status(500).json({ error: "Failed to process site." });
        }
      }
      res.json({ chunkReceived: true, progress: Math.round((uploaded / totalChunksNum) * 100) });
    } catch (e: any) { res.status(500).json({ error: "Upload failed." }); }
  });

  app.delete("/api/sites/:id", requireAuth, async (req: any, res) => {
    const { id } = req.params;
    if (!isValidUUID(id)) return res.status(400).json({ error: "Invalid site ID." });
    try {
      const r = await pool.query("DELETE FROM sites WHERE id = $1 AND user_id = $2 RETURNING id", [id, req.user.userId]);
      if (!r.rows.length) return res.status(404).json({ error: "Site not found." });
      // ✅ Delete from R2
      await deleteFromR2(`sites/${id}/`);
      res.json({ success: true });
    } catch { res.status(500).json({ error: "Failed to delete site" }); }
  });

  app.delete("/api/sites", requireAuth, async (req: any, res) => {
    try {
      const rows = await pool.query("SELECT id FROM sites WHERE user_id = $1", [req.user.userId]);
      await pool.query("DELETE FROM sites WHERE user_id = $1", [req.user.userId]);
      // ✅ Delete all from R2
      for (const row of rows.rows) {
        if (isValidUUID(row.id)) await deleteFromR2(`sites/${row.id}/`);
      }
      res.json({ success: true, deleted: rows.rows.length });
    } catch (e: any) { res.status(500).json({ success: false, error: "Failed to delete sites." }); }
  });

  app.all("/api/*", (req, res) => { res.status(404).json({ error: `Not found: ${req.method} ${req.url}` }); });

  // ── Serve sites from R2 ───────────────────────────────────────────────────
  app.use("/sites/:siteId/*", async (req: any, res, next) => {
    try {
      const { siteId } = req.params;
      if (!isValidUUID(siteId)) return next();

      let filePath = req.params[0] || "";
      if (!filePath || filePath.endsWith("/")) filePath = filePath + "index.html";

      const r2Key = `sites/${siteId}/${filePath}`;
      const data = await getFromR2(r2Key);

      if (!data) {
        // Try index.html in that directory
        const indexKey = `sites/${siteId}/${filePath.replace(/\/?$/, "/index.html")}`;
        const indexData = await getFromR2(indexKey);
        if (indexData) {
          const ext = ".html";
          res.setHeader("Content-Type", getContentType(ext));
          return res.send(indexData);
        }
        return next();
      }

      const ext = path.extname(filePath).toLowerCase();
      res.setHeader("Content-Type", getContentType(ext));
      res.send(data);
    } catch (e) { next(); }
  });

  // Root of site /sites/:siteId/
  app.use("/sites/:siteId", async (req: any, res, next) => {
    try {
      const { siteId } = req.params;
      if (!isValidUUID(siteId)) return next();
      const data = await getFromR2(`sites/${siteId}/index.html`);
      if (!data) return next();
      res.setHeader("Content-Type", "text/html");
      res.send(data);
    } catch { next(); }
  });

  app.use("/sites", (_req, res) => { res.status(404).send("Not Found"); });

  // ── Vite / Prod ───────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (_req, res) => { res.sendFile(path.join(__dirname, "dist", "index.html")); });
  }

  app.listen(PORT, "0.0.0.0", () => { console.log(`✅ Server running on http://localhost:${PORT}`); });
}

startServer();