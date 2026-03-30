import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, sanitize, securityHeaders, pool } from "../_helpers.js";
import { v4 as uuidv4 } from "uuid";

export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
    maxDuration: 60, // Give Vercel 60s to call Render
  }
};

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

    const renderUrl = (process.env.RENDER_URL || "").trim().replace(/\/$/, "");
    const workerUrl = (process.env.WORKER_URL || "").trim().replace(/\/$/, "");
    const workerSecret = process.env.WORKER_SECRET;

    if (!renderUrl || !workerSecret) {
      return res.status(500).json({ error: "Processor not configured." });
    }

    const siteUrl = `${workerUrl}/sites/${siteId}/`;

    // Save to DB immediately so user gets their link
    await pool.query(
      "INSERT INTO sites (id, user_id, name, url) VALUES ($1, $2, $3, $4)",
      [siteId, user.userId, siteName, siteUrl]
    );

    // Step 1: Wake up Render first (free tier sleeps after inactivity)
    // This ping takes 30-60s on cold start — we wait for it
    console.log("Waking up Render...");
    try {
      await fetch(`${renderUrl}/health`, { method: "GET" });
      console.log("Render is awake!");
    } catch (e) {
      console.log("Render wake ping failed, trying anyway:", e);
    }

    // Step 2: Now call Render to process — it should respond quickly since it's awake
    console.log("Calling Render /process...");
    fetch(`${renderUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": workerSecret,
      },
      body: JSON.stringify({ r2Key, fileName, userId: user.userId, siteId }),
    }).then(r => {
      console.log("Render /process responded:", r.status);
    }).catch(err => {
      console.error("Render /process error:", err);
    });

    // Return immediately — Render processes in background
    return res.json({ id: siteId, name: siteName, url: siteUrl, completed: true });

  } catch (e: any) {
    console.error("Process error:", e);
    return res.status(500).json({ error: "Failed to process site." });
  }
}