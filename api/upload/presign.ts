import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, securityHeaders } from "../_helpers.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

const R2_BUCKET = process.env.R2_BUCKET_NAME || "sitesnap-files";

export const config = { api: { bodyParser: { sizeLimit: "1mb" } } };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  // Clerk auth — requireAuth is now async
  const user = await requireAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Not authenticated." });

  try {
    const { fileName, fileSize } = req.body;
    if (!fileName || !fileSize) return res.status(400).json({ error: "Missing fileName or fileSize" });

    const uploadId = uuidv4();
    const r2Key = `temp/${uploadId}/${fileName}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: r2Key,
      ContentType: "application/zip",
      ContentLength: fileSize,
    });

    const presignedUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

    return res.json({ presignedUrl, uploadId, r2Key });
  } catch (e) {
    console.error("Presign error:", e);
    return res.status(500).json({ error: "Failed to generate upload URL." });
  }
}