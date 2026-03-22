import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pool, requireAuth, securityHeaders } from "../_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const user = requireAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Not authenticated." });

  try {
    const r = await pool.query("SELECT id, email, created_at FROM users WHERE id = $1", [user.userId]);
    if (!r.rows.length) return res.status(404).json({ error: "User not found." });
    res.json({ user: r.rows[0] });
  } catch {
    res.status(500).json({ error: "Something went wrong." });
  }
}