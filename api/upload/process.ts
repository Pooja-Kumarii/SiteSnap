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

    const renderUrl = (process.env.RENDER_URL || "").trim().replace(/\/$/, "");
    const workerUrl = (process.env.WORKER_URL || "").trim().replace(/\/$/, "");
    const workerSecret = process.env.WORKER_SECRET;

    // Log env vars to Vercel logs for debugging
    console.log("RENDER_URL:", renderUrl || "MISSING!");
    console.log("WORKER_URL:", workerUrl || "MISSING!");
    console.log("WORKER_SECRET set:", !!workerSecret);

    if (!renderUrl || !workerSecret) {
      return res.status(500).json({
        error: "Processor not configured.",
        debug: { renderUrl: !!renderUrl, workerSecret: !!workerSecret }
      });
    }

    const siteUrl = `${workerUrl}/sites/${siteId}/`;

    // Save to DB immediately
    await pool.query(
      "INSERT INTO sites (id, user_id, name, url) VALUES ($1, $2, $3, $4)",
      [siteId, user.userId, siteName, siteUrl]
    );

    // Call Render — wait up to 10 seconds to confirm it received the request
    // then return to user (Render processes in background)
    const renderCallPromise = fetch(`${renderUrl}/process`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Worker-Secret": workerSecret,
      },
      body: JSON.stringify({ r2Key, fileName, userId: user.userId, siteId }),
    });

    // Wait max 10s for Render to acknowledge — then return regardless
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 10000));

    const renderRes = await Promise.race([renderCallPromise, timeoutPromise]);

    if (renderRes === null) {
      console.log("Render call timed out after 10s — processing in background");
    } else {
      const renderResTyped = renderRes as Response;
      console.log("Render responded with status:", renderResTyped.status);
      if (!renderResTyped.ok) {
        const errText = await renderResTyped.text().catch(() => "unknown");
        console.error("Render error response:", errText);
      }
    }

    return res.json({ id: siteId, name: siteName, url: siteUrl, completed: true });

  } catch (e: any) {
    console.error("Process error:", e);
    return res.status(500).json({ error: "Failed to process site." });
  }
}