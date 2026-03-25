import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pool, sanitize, isValidEmail, comparePassword, signToken, securityHeaders } from "../_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const email    = sanitize(req.body?.email    || "").toLowerCase();
    const password = sanitize(req.body?.password || "");

    if (!isValidEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    if (!password)            return res.status(400).json({ error: "Please enter your password." });

    const result = await pool.query(
      "SELECT id, email, password, email_verified FROM users WHERE email = $1",
      [email]
    );

    // Same error for wrong email or wrong password — prevents user enumeration
    if (result.rows.length === 0) return res.status(401).json({ error: "Invalid email or password." });

    const user  = result.rows[0];
    const match = await comparePassword(password, user.password);
    if (!match) return res.status(401).json({ error: "Invalid email or password." });

    // ✅ Block login if email not verified
    if (!user.email_verified) {
      return res.status(403).json({
        error: "email_not_verified",
        message: "Please verify your email first. Check your inbox for the verification link.",
      });
    }

    const token = signToken(user.id, user.email);
    res.json({ token, user: { id: user.id, email: user.email } });

  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ error: "Something went wrong." });
  }
}