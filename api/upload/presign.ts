import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireAuth, securityHeaders, isValidUUID } from "../_helpers.js";
import { S3Client, PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  Object.entries(securityHeaders).forEach(([k, v]) => res.setHeader(k, v));

  const user = requireAuth(req.headers.authorization);
  if (!user) return res.status(401).json({ error: "Not authenticated." });

  if (req.method === "POST" && req.url?.includes("presign")) {
    // Generate presigned URL for direct upload to R2
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

  res.status(405).json({ error: "Method not allowed" });
}