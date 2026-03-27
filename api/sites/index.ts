import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pool, requireAuth, securityHeaders } from "../_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = await requireAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Not authenticated." });

  try {
    const result = await pool.query(
      "SELECT id, name, url, created_at FROM sites WHERE user_id = $1 ORDER BY created_at DESC",
      [user.userId]
    );
    return res.json(result.rows);
  } catch (e) {
    console.error("Sites fetch error:", e);
    return res.status(500).json({ error: "Failed to fetch sites." });
  }
}