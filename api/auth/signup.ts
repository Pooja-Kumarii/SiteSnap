import type { VercelRequest, VercelResponse } from "@vercel/node";
import { pool, sanitize, isValidEmail, isValidPassword, hashPassword, signToken, securityHeaders } from "../_helpers.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const email = sanitize(req.body?.email || "").toLowerCase();
    const password = sanitize(req.body?.password || "");

    if (!isValidEmail(email)) return res.status(400).json({ error: "Please enter a valid email address." });
    if (!isValidPassword(password)) return res.status(400).json({ error: "Password must be at least 8 characters." });

    const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0) return res.status(409).json({ error: "An account with this email already exists." });

    const hashed = await hashPassword(password);
    const result = await pool.query(
      "INSERT INTO users (email, password) VALUES ($1, $2) RETURNING id, email",
      [email, hashed]
    );
    const user = result.rows[0];
    const token = signToken(user.id, user.email);

    res.status(201).json({ token, user: { id: user.id, email: user.email } });
  } catch (e) {
    console.error("Signup error:", e);
    res.status(500).json({ error: "Something went wrong." });
  }
}