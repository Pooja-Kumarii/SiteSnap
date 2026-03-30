import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, sanitize, securityHeaders, pool } from "../_helpers.js";
import { v4 as uuidv4 } from "uuid";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Not authenticated." });

  try {
    const { r2Key, fileName } = req.body;
    if (!r2Key || !fileName) return res.status(400).json({ error: "Missing r2Key or fileName" });

    const siteId = uuidv4();
    const siteName = sanitize(fileName.replace(/\.zip$/i, "") || "Untitled Site");

    // Render processes the ZIP — no timeout, handles any file size
    const renderUrl = (process.env.RENDER_URL || "").trim().replace(/\/$/, "");
    // Worker still SERVES the final deployed site files
    const workerUrl = (process.env.WORKER_URL || "").trim().replace(/\/$/, "");
    const workerSecret = process.env.WORKER_SECRET;

    if (!renderUrl || !workerSecret) {
      return res.status(500).json({ error: "Processor not configured." });
    }

    // Final site URL — served by Cloudflare Worker from R2
    const siteUrl = `${workerUrl}/sites/${siteId}/`;

    // Save to DB immediately so user gets their link right away
    await pool.query(
      "INSERT INTO sites (id, user_id, name, url) VALUES ($1, $2, $3, $4)",
      [siteId, user.userId, siteName, siteUrl]
    );

    // Call Render in background — it downloads ZIP from R2, extracts, uploads files back to R2
    // Fire and forget — no Vercel timeout issue
    fetch(`${renderUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": workerSecret,
      },
      body: JSON.stringify({ r2Key, fileName, userId: user.userId, siteId }),
    }).catch((err) => console.error("Render processor error:", err));

    return res.json({ id: siteId, name: siteName, url: siteUrl, completed: true });

  } catch (e: any) {
    console.error("Process error:", e);
    return res.status(500).json({ error: "Failed to process site." });
  }
}