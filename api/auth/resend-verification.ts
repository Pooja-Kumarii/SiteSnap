import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { pool, sanitize, isValidEmail, securityHeaders } from "../_helpers.js";
import crypto from "crypto";

const resend  = new Resend(process.env.RESEND_API_KEY);
const APP_URL = process.env.APP_URL || "https://site-snap-tawny.vercel.app";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const email = sanitize(req.body?.email || "").toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: "Invalid email." });

    const result = await pool.query(
      "SELECT id, email_verified FROM users WHERE email = $1",
      [email]
    );
    // Always return 200 — don't reveal if email exists
    if (result.rows.length === 0 || result.rows[0].email_verified) {
      return res.json({ ok: true });
    }

    const token     = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await pool.query(
      "UPDATE users SET verification_token = $1, token_expires_at = $2 WHERE id = $3",
      [token, expiresAt, result.rows[0].id]
    );

    const verifyUrl = `${APP_URL}/api/auth/verify?token=${token}`;
    await resend.emails.send({
      from:    "SiteSnap <onboarding@resend.dev>",
      to:      email,
      subject: "Verify your SiteSnap account",
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:40px 20px;">
        <h2 style="color:#6366f1;">Verify your email</h2>
        <p style="color:#94a3b8;">Click the button below to verify your SiteSnap account.</p>
        <a href="${verifyUrl}" style="display:inline-block;background:#6366f1;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;margin:16px 0;">Verify Email →</a>
        <p style="color:#475569;font-size:12px;">Or copy this link: ${verifyUrl}</p>
        <p style="color:#475569;font-size:12px;">Link expires in 24 hours.</p>
      </div>`,
    });

    res.json({ ok: true });
  } catch (e) {
    console.error("Resend verification error:", e);
    res.status(500).json({ error: "Something went wrong." });
  }
}