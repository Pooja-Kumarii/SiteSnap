import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, sanitize, securityHeaders, pool } from "../_helpers.js";
import { v4 as uuidv4 } from "uuid";

export const config = {
  api: {
    bodyParser: { sizeLimit: "1mb" },
    maxDuration: 30,
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

    console.log("RENDER_URL:", renderUrl || "MISSING");
    console.log("WORKER_URL:", workerUrl || "MISSING");

    if (!renderUrl || !workerSecret) {
      return res.status(500).json({ error: "Processor not configured." });
    }

    const siteUrl = `${workerUrl}/sites/${siteId}/`;

    // Save to DB immediately
    await pool.query(
      "INSERT INTO sites (id, user_id, name, url) VALUES ($1, $2, $3, $4)",
      [siteId, user.userId, siteName, siteUrl]
    );

    // Call Render and WAIT for it to acknowledge (not finish processing)
    // Render will respond quickly with 200 and then process in background
    try {
      console.log("Calling Render:", `${renderUrl}/process`);
      const renderRes = await fetch(`${renderUrl}/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Worker-Secret": workerSecret,
        },
        body: JSON.stringify({ r2Key, fileName, userId: user.userId, siteId }),
        // Give Render 25 seconds to respond
        signal: AbortSignal.timeout(25000),
      });
      console.log("Render responded:", renderRes.status);
    } catch (renderErr: any) {
      // Render timed out or failed — but files are in R2, it may still process
      console.error("Render call error:", renderErr.message);
    }

    return res.json({ id: siteId, name: siteName, url: siteUrl, completed: true });

  } catch (e: any) {
    console.error("Process error:", e);
    return res.status(500).json({ error: "Failed to process site." });
  }
}