import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pool, signToken, securityHeaders } from "../_helpers.js";

const APP_URL = process.env.APP_URL || "https://site-snap-tawny.vercel.app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  // GET request — user clicked the link in their email
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { token } = req.query;

  if (!token || typeof token !== "string" || token.length !== 64) {
    return res.redirect(`${APP_URL}/?verified=invalid`);
  }

  try {
    // Find user with this token
    const result = await pool.query(
      `SELECT id, email, email_verified, token_expires_at
       FROM users
       WHERE verification_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      // Token not found
      return res.redirect(`${APP_URL}/?verified=invalid`);
    }

    const user = result.rows[0];

    // Already verified — just log them in
    if (user.email_verified) {
      const jwt = signToken(user.id, user.email);
      return res.redirect(`${APP_URL}/?verified=already&token=${jwt}&email=${encodeURIComponent(user.email)}&uid=${user.id}`);
    }

    // Check expiry
    if (new Date() > new Date(user.token_expires_at)) {
      return res.redirect(`${APP_URL}/?verified=expired`);
    }

    // ── Mark as verified ──────────────────────────────────────────────────────
    await pool.query(
      `UPDATE users
       SET email_verified = TRUE, verification_token = NULL, token_expires_at = NULL
       WHERE id = $1`,
      [user.id]
    );

    // Auto-login: send JWT + user info back via redirect
    const jwt = signToken(user.id, user.email);
    return res.redirect(
      `${APP_URL}/?verified=success&token=${jwt}&email=${encodeURIComponent(user.email)}&uid=${user.id}`
    );

  } catch (e) {
    console.error("Verify error:", e);
    return res.redirect(`${APP_URL}/?verified=error`);
  }
}