import { unzipSync, strFromU8 } from "fflate";

interface Env {
  R2: R2Bucket;
  R2_BUCKET_NAME: string;
  WORKER_SECRET: string;
  DATABASE_URL: string;
}

function getContentType(ext: string): string {
  const types: Record<string, string> = {
    ".html": "text/html", ".htm": "text/html", ".css": "text/css",
    ".js": "application/javascript", ".mjs": "application/javascript",
    ".json": "application/json", ".xml": "application/xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
    ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
    ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
    ".ttf": "font/ttf", ".otf": "font/otf", ".txt": "text/plain",
    ".webmanifest": "application/manifest+json",
  };
  return types[ext] || "application/octet-stream";
}

function rewriteHtml(html: string, base: string): string {
  html = html.replace(/(<a\s[^>]*href=["'])\/(?!\/)([^"']*)(["'])/gi, (m,b,u,a) => u.startsWith("//") || u.startsWith("#") ? m : `${b}${base}${u}${a}`);
  html = html.replace(/(<form\s[^>]*action=["'])\/(?!\/)([^"']*)(["'])/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
  html = html.replace(/(<link\s[^>]*href=["'])\/(?!\/)([^"']+)(["'][^>]*>)/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
  html = html.replace(/(<script\s[^>]*src=["'])\/(?!\/)([^"']+)(["'][^>]*>)/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
  html = html.replace(/(<img\s[^>]*src=["'])\/(?!\/)([^"']+)(["'])/gi, (_,b,u,a) => `${b}${base}${u}${a}`);
  html = html.replace(/url\(['"]?\/(?!\/)([^'")]+)['"]?\)/gi, (_,u) => `url('${base}${u}')`);
  html = html.replace(/<script[^>]+src=["'][^"']*@vite[^"']*["'][^>]*><\/script>/gi, "");
  return html;
}

function rewriteCss(css: string, base: string): string {
  return css.replace(/url\(['"]?\/(?!\/)([^'")]+)['"]?\)/gi, (_,u) => `url('${base}${u}')`);
}

function validateZip(data: Uint8Array): { valid: boolean; reason: string } {
  try {
    const files = unzipSync(data);
    const keys = Object.keys(files);
    if (!keys.length) return { valid: false, reason: "ZIP is empty." };
    if (keys.length > 10000) return { valid: false, reason: "ZIP contains too many files." };
    for (const key of keys) {
      if (key.includes("../") || key.includes("..\\")) return { valid: false, reason: "Invalid ZIP: unsafe paths." };
    }
    const indexKey = keys.find(k => {
      const n = k.toLowerCase();
      return !n.includes("__macosx") && (n === "index.html" || n.endsWith("/index.html"));
    });
    if (!indexKey) return { valid: false, reason: "No index.html found." };
    const content = strFromU8(files[indexKey]).toLowerCase().trim();
    if (content.length < 50) return { valid: false, reason: "index.html too small." };
    if (!content.includes("<html") && !content.includes("<!doctype")) return { valid: false, reason: "Not valid HTML." };
    const names = keys.map(k => k.toLowerCase());
    if (names.some(f => f === "package.json" || f.endsWith("/package.json")) &&
        names.some(f => f === "server.ts" || f.endsWith("/server.ts"))) {
      return { valid: false, reason: "Looks like source code." };
    }
    if (!names.some(f => f.endsWith(".css") || f.endsWith(".js"))) {
      return { valid: false, reason: "No CSS or JS files found." };
    }
    return { valid: true, reason: "ok" };
  } catch {
    return { valid: false, reason: "Could not read ZIP." };
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Worker-Secret",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ── GET: Serve files from R2 ──────────────────────────────────────────────
    if (request.method === "GET") {
      const match = url.pathname.match(/^\/sites\/([^/]+)(\/.*)?$/);
      if (!match) {
        return new Response("Not found", { status: 404 });
      }

      const siteId = match[1];
      let filePath = match[2] || "/";
      if (filePath.endsWith("/")) filePath += "index.html";

      const r2Key = `sites/${siteId}${filePath}`;
      const object = await env.R2.get(r2Key);

      if (!object) {
        const fallback = await env.R2.get(`sites/${siteId}/index.html`);
        if (!fallback) {
          return new Response("File not found", { status: 404 });
        }
        return new Response(fallback.body, {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, max-age=3600",
          },
        });
      }

      const ext = filePath.substring(filePath.lastIndexOf(".")).toLowerCase();
      return new Response(object.body, {
        headers: {
          "Content-Type": getContentType(ext),
          "Cache-Control": "public, max-age=3600",
        },
      });
    }

    // ── POST: Process ZIP ─────────────────────────────────────────────────────
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const secret = request.headers.get("X-Worker-Secret");
    if (secret !== env.WORKER_SECRET) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    try {
      const { r2Key, fileName, userId, siteId: providedSiteId } = await request.json() as any;

      if (!r2Key || !fileName || !userId) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const tempObject = await env.R2.get(r2Key);
      if (!tempObject) {
        return new Response(JSON.stringify({ error: "Upload not found. Please try again." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const zipData = new Uint8Array(await tempObject.arrayBuffer());

      const v = validateZip(zipData);
      if (!v.valid) {
        await env.R2.delete(r2Key);
        return new Response(JSON.stringify({ error: "invalid_zip", message: v.reason }), {
          status: 422,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const siteId = providedSiteId || crypto.randomUUID();
      const workerBase = new URL(request.url).origin;
      const base = `${workerBase}/sites/${siteId}/`;
      const siteName = fileName.replace(/\.zip$/i, "") || "Untitled Site";

      const files = unzipSync(zipData);
      const keys = Object.keys(files);

      let rootPrefix = "";
      const indexKey = keys.find(k => {
        const n = k.toLowerCase();
        return !n.includes("__macosx") && (n === "index.html" || n.endsWith("/index.html"));
      });
      if (indexKey) {
        const parts = indexKey.split("/");
        if (parts.length > 1) rootPrefix = parts.slice(0, -1).join("/") + "/";
      }

      const filesToUpload = keys.filter(k => {
        const n = k.toLowerCase();
        return !n.includes("__macosx") && !k.endsWith("/") && files[k].length > 0;
      });

      for (let i = 0; i < filesToUpload.length; i += 20) {
        const batch = filesToUpload.slice(i, i + 20);
        await Promise.all(batch.map(async (key) => {
          let relKey = key;
          if (rootPrefix && relKey.startsWith(rootPrefix)) relKey = relKey.slice(rootPrefix.length);
          if (!relKey) return;

          const r2FileKey = `sites/${siteId}/${relKey}`;
          const ext = relKey.substring(relKey.lastIndexOf(".")).toLowerCase();
          let fileData: Uint8Array = files[key];

          if (ext === ".html" || ext === ".htm") {
            const rewritten = rewriteHtml(strFromU8(fileData), base);
            fileData = new TextEncoder().encode(rewritten);
          } else if (ext === ".css") {
            const rewritten = rewriteCss(strFromU8(fileData), base);
            fileData = new TextEncoder().encode(rewritten);
          }

          await env.R2.put(r2FileKey, fileData, {
            httpMetadata: { contentType: getContentType(ext) }
          });
        }));
      }

      await env.R2.delete(r2Key);

      const siteUrl = `${workerBase}/sites/${siteId}/`;

      return new Response(JSON.stringify({
        id: siteId,
        name: siteName,
        url: siteUrl,
        completed: true
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (e: any) {
      console.error("Worker error:", e);
      return new Response(JSON.stringify({ error: "Processing failed: " + e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }
};