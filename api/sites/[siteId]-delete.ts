import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pool, requireAuth, isValidUUID, deleteFromR2, securityHeaders } from "../_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== "DELETE") return res.status(405).json({ error: "Method not allowed" });

  const user = requireAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Not authenticated." });

  // ✅ File is named [id].ts → Vercel sets req.query.id
  const { id } = req.query;
  if (!id || !isValidUUID(id as string)) {
    return res.status(400).json({ error: "Invalid site ID." });
  }

  try {
    const r = await pool.query(
      "DELETE FROM sites WHERE id = $1 AND user_id = $2 RETURNING id",
      [id, user.userId]
    );
    if (!r.rows.length) return res.status(404).json({ error: "Site not found." });

    // Delete all files from R2
    await deleteFromR2(`sites/${id}/`);

    return res.json({ success: true });
  } catch (e) {
    console.error("Delete error:", e);
    return res.status(500).json({ error: "Failed to delete site." });
  }
}