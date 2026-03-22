import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pool, requireAuth, isValidUUID, deleteFromR2, securityHeaders } from "../_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  const user = requireAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Not authenticated. Please log in." });

  // GET — list sites
  if (req.method === "GET") {
    try {
      const rows = await pool.query(
        "SELECT * FROM sites WHERE user_id = $1 ORDER BY created_at DESC",
        [user.userId]
      );
      return res.json(rows.rows);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Failed to fetch sites" });
    }
  }

  // DELETE — delete all sites
  if (req.method === "DELETE") {
    try {
      const rows = await pool.query("SELECT id FROM sites WHERE user_id = $1", [user.userId]);
      await pool.query("DELETE FROM sites WHERE user_id = $1", [user.userId]);
      for (const row of rows.rows) {
        if (isValidUUID(row.id)) await deleteFromR2(`sites/${row.id}/`);
      }
      return res.json({ success: true, deleted: rows.rows.length });
    } catch {
      return res.status(500).json({ error: "Failed to delete sites." });
    }
  }

  res.status(405).json({ error: "Method not allowed" });
}