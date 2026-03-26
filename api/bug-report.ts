import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Resend } from "resend";
import { securityHeaders } from "../_helpers.js";

const resend = new Resend(process.env.RESEND_API_KEY);

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, details } = req.body;

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "Invalid email address." });
  }
  if (!details || details.trim().length < 20) {
    return res.status(400).json({ error: "Bug description too short." });
  }

  try {
    await resend.emails.send({
      from: "SiteSnap Bug Reports <onboarding@resend.dev>",
      to: "devjanipooja9@gmail.com",
      subject: "Reporting Bug in the SiteSnap",
      html: `
        <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0a0a0a; color: #f1f5f9; border-radius: 12px;">
          <div style="border-bottom: 1px solid #222; padding-bottom: 16px; margin-bottom: 20px;">
            <h2 style="color: #ef4444; margin: 0 0 4px; font-size: 20px;">Bug Report — SiteSnap</h2>
            <p style="color: #475569; margin: 0; font-size: 13px;">Someone found an issue with your app</p>
          </div>
          <div style="margin-bottom: 20px;">
            <p style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 6px; font-weight: 600;">Reported by</p>
            <p style="font-size: 15px; color: #38bdf8; margin: 0;">${email}</p>
          </div>
          <div>
            <p style="font-size: 12px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.08em; margin: 0 0 10px; font-weight: 600;">Bug Details</p>
            <div style="background: #111; border: 1px solid #222; border-left: 3px solid #ef4444; border-radius: 8px; padding: 16px;">
              <p style="margin: 0; font-size: 14px; line-height: 1.7; color: #f1f5f9; white-space: pre-wrap;">${details.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
            </div>
          </div>
          <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #222;">
            <p style="font-size: 11px; color: #475569; margin: 0;">Sent from SiteSnap · ${new Date().toLocaleString("en-US", { timeZone: "Asia/Karachi" })} PKT</p>
          </div>
        </div>
      `,
    });

    return res.json({ success: true });
  } catch (e: any) {
    console.error("Bug report email error:", e);
    return res.status(500).json({ error: "Failed to send report." });
  }
}