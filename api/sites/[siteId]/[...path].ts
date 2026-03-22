import type { VercelRequest, VercelResponse } from "@vercel/node";
import { getFromR2, isValidUUID, getContentType } from "../../_helpers.js";
import path from "path";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { siteId, path: pathParts } = req.query;

  if (!siteId || !isValidUUID(siteId as string)) {
    return res.status(404).send("Not Found");
  }

  const filePath = Array.isArray(pathParts) ? pathParts.join("/") : (pathParts || "index.html");
  const cleanPath = filePath || "index.html";

  // Try exact file first
  let r2Key = `sites/${siteId}/${cleanPath}`;
  let data = await getFromR2(r2Key);

  // If not found and no extension, try index.html in that directory
  if (!data && !path.extname(cleanPath)) {
    const indexKey = `sites/${siteId}/${cleanPath}/index.html`.replace(/\/+/g, "/");
    data = await getFromR2(indexKey);
    if (data) {
      res.setHeader("Content-Type", "text/html");
      return res.send(data);
    }
  }

  // Fallback to root index.html (for SPA-like routing)
  if (!data) {
    data = await getFromR2(`sites/${siteId}/index.html`);
    if (data) {
      res.setHeader("Content-Type", "text/html");
      return res.send(data);
    }
  }

  if (!data) return res.status(404).send("Not Found");

  const ext = path.extname(cleanPath).toLowerCase();
  res.setHeader("Content-Type", getContentType(ext));
  res.setHeader("Cache-Control", "public, max-age=31536000");
  res.send(data);
}