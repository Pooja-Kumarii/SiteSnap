import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, sanitize, securityHeaders, pool } from "../_helpers.js";
import { v4 as uuidv4 } from "uuid";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const user = requireAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Not authenticated." });

  try {
    const { r2Key, fileName } = req.body;
    if (!r2Key || !fileName) return res.status(400).json({ error: "Missing r2Key or fileName" });

    const siteId = uuidv4();
    const siteName = sanitize(fileName.replace(/\.zip$/i, "") || "Untitled Site");
    const workerUrl = process.env.WORKER_URL;
    const workerSecret = process.env.WORKER_SECRET;

    if (!workerUrl || !workerSecret) {
      return res.status(500).json({ error: "Worker not configured." });
    }

    // Save to database FIRST with "processing" status
    const siteUrl = `${workerUrl}/sites/${siteId}/`;
    await pool.query(
      "INSERT INTO sites (id, user_id, name, url) VALUES ($1, $2, $3, $4)",
      [siteId, user.userId, siteName, siteUrl]
    );

    // Fire and forget — call Worker WITHOUT awaiting it
    // This prevents Vercel from timing out
    fetch(`${workerUrl}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": workerSecret,
      },
      body: JSON.stringify({ r2Key, fileName, userId: user.userId, siteId }),
    }).catch((err) => console.error("Worker fire-and-forget error:", err));

    // Return success immediately — Worker processes in background
    return res.json({ id: siteId, name: siteName, url: siteUrl, completed: true });

  } catch (e: any) {
    console.error("Process error:", e);
    return res.status(500).json({ error: "Failed to process site." });
  }
}