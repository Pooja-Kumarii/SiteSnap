import { unzipSync, strFromU8 } from "fflate";

interface Env {
  R2: R2Bucket;
  R2_BUCKET_NAME: string;
  WORKER_SECRET: string;
  DATABASE_URL: string;
}

// ── Content type helper ───────────────────────────────────────────────────────
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
    ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".pdf": "application/pdf",
  };
  return types[ext.toLowerCase()] || "application/octet-stream";
}

// ── Rewrite helpers ───────────────────────────────────────────────────────────
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

// ── Main Worker ───────────────────────────────────────────────────────────────
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

    // ── GET: Serve deployed site files from R2 ────────────────────────────────
    if (request.method === "GET") {
      // Match /sites/:siteId or /sites/:siteId/path/to/file
      const match = url.pathname.match(/^\/sites\/([^/]+)(\/.*)?$/);

      if (!match) {
        return new Response("Not found", { status: 404 });
      }

      const siteId = match[1];
      let filePath = match[2] || "/";

      // Strip query strings — R2 files don't have ?ver=xxx
      if (filePath.includes("?")) filePath = filePath.split("?")[0];

      // Strip hash fragments
      if (filePath.includes("#")) filePath = filePath.split("#")[0];

      // Default to index.html for directory requests
      if (filePath.endsWith("/")) filePath += "index.html";

      const r2Key = `sites/${siteId}${filePath}`;

      // Try to get the exact file from R2
      const object = await env.R2.get(r2Key);

      if (!object) {
        // Fallback: try index.html (for SPA routing)
        const fallback = await env.R2.get(`sites/${siteId}/index.html`);
        if (!fallback) {
          return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Preparing your site — SiteSnap</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;background:#0a0a0a;color:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem}
  .card{background:#111;border:1px solid #1e293b;border-radius:20px;padding:3rem 2.5rem;max-width:500px;width:100%;text-align:center;position:relative;overflow:hidden}
  .glow{position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0ea5e9,#38bdf8,#0ea5e9);background-size:200% 100%;animation:slide 2s linear infinite}
  @keyframes slide{0%{background-position:200% 0}100%{background-position:-200% 0}}
  .icon{width:72px;height:72px;background:rgba(14,165,233,0.1);border:1px solid rgba(14,165,233,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;animation:pulse 2s ease-in-out infinite}
  @keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
  .spinner{width:28px;height:28px;border:3px solid rgba(14,165,233,0.2);border-top:3px solid #0ea5e9;border-radius:50%;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{font-size:1.4rem;font-weight:700;color:#fff;letter-spacing:-0.03em;margin-bottom:0.5rem}
  .message{font-size:0.9rem;color:#0ea5e9;font-weight:500;margin-bottom:0.4rem;min-height:1.4rem;transition:all 0.5s ease}
  .subtitle{font-size:0.82rem;color:#64748b;line-height:1.6;margin-bottom:1.5rem}
  .progress-wrap{background:#1e293b;border-radius:100px;height:6px;margin-bottom:0.6rem;overflow:hidden}
  .progress-fill{height:100%;background:linear-gradient(90deg,#0ea5e9,#38bdf8);border-radius:100px;width:0%;transition:width 1s linear}
  .timer-row{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.5rem;font-size:0.75rem;color:#475569}
  .timer-row span{color:#94a3b8}
  .steps{background:#0d0d0d;border:1px solid #1e293b;border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:1.8rem;text-align:left}
  .step{display:flex;align-items:flex-start;gap:10px;margin-bottom:0.75rem;font-size:0.8rem;color:#64748b;line-height:1.5;transition:all 0.5s}
  .step:last-child{margin-bottom:0}
  .step.active{color:#94a3b8}
  .step.done{color:#22c55e}
  .step-dot{width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;flex-shrink:0;margin-top:1px;transition:all 0.5s}
  .step-dot.waiting{background:#1e293b;color:#475569}
  .step-dot.active{background:rgba(14,165,233,0.2);color:#0ea5e9;animation:pulse 1.5s infinite}
  .step-dot.done{background:rgba(34,197,94,0.15);color:#22c55e}
  .refresh-btn{background:#1e293b;color:#475569;border:1px solid #1e293b;padding:0.8rem 2rem;border-radius:8px;font-size:0.88rem;font-weight:600;cursor:not-allowed;transition:all 0.3s;font-family:inherit;width:100%}
  .refresh-btn.ready{background:#0ea5e9;color:#fff;border-color:#0ea5e9;cursor:pointer;animation:btnpulse 1.5s ease-in-out infinite}
  .refresh-btn.ready:hover{background:#0284c7;transform:translateY(-1px);animation:none}
  @keyframes btnpulse{0%,100%{box-shadow:0 0 0 0 rgba(14,165,233,0.4)}50%{box-shadow:0 0 0 8px rgba(14,165,233,0)}}
  .note{font-size:0.7rem;color:#334155;margin-top:1rem;line-height:1.6}
</style>
</head>
<body>
<div class="card">
  <div class="glow"></div>
  <div class="icon"><div class="spinner"></div></div>
  <h1>Hang tight, we're on it!</h1>
  <div class="message" id="msg">Setting things up for you...</div>
  <p class="subtitle">Your WordPress site is being deployed. Grab a coffee — this takes about 6 minutes.</p>
  <div class="progress-wrap"><div class="progress-fill" id="bar"></div></div>
  <div class="timer-row">
    <span id="pct">0% complete</span>
    <span id="countdown">6:00 remaining</span>
  </div>
  <div class="steps" id="steps">
    <div class="step active" id="s1"><div class="step-dot active" id="d1">1</div><span id="t1">Receiving your ZIP file...</span></div>
    <div class="step" id="s2"><div class="step-dot waiting" id="d2">2</div><span id="t2">Extracting your site files</span></div>
    <div class="step" id="s3"><div class="step-dot waiting" id="d3">3</div><span id="t3">Optimising and deploying</span></div>
    <div class="step" id="s4"><div class="step-dot waiting" id="d4">4</div><span id="t4">Almost ready — finalising</span></div>
  </div>
  <button class="refresh-btn" id="btn" onclick="if(this.classList.contains('ready')) location.reload()" disabled>
    Please wait while your site loads...
  </button>
  <p class="note">This page will automatically refresh when your site is ready. If it still doesn't load after 10 minutes, try re-uploading your ZIP.</p>
</div>
<script>
  const TOTAL = 360; // 6 minutes in seconds
  let elapsed = 0;
  const messages = [
    [0,   "Setting things up for you..."],
    [20,  "ZIP received! Starting to unpack..."],
    [50,  "Unpacking your site files... almost there!"],
    [90,  "Processing HTML, CSS and images..."],
    [140, "Uploading files to global servers..."],
    [200, "Still going — large sites take a little longer!"],
    [250, "More than halfway there, keep waiting!"],
    [300, "Just finishing up the last few files..."],
    [340, "Almost done! Getting ready to go live..."],
    [355, "Any second now... refreshing soon!"],
  ];
  const steps = [
    { at: 0,   done: 30,  id: 1, active: "Receiving your ZIP file..." },
    { at: 30,  done: 100, id: 2, active: "Extracting your site files..." },
    { at: 100, done: 280, id: 3, active: "Uploading to global servers..." },
    { at: 280, done: 350, id: 4, active: "Finalising your site..." },
  ];

  function pad(n){ return String(n).padStart(2,'0'); }

  const interval = setInterval(() => {
    elapsed++;
    const pct = Math.min(Math.round((elapsed / TOTAL) * 100), 99);
    document.getElementById('bar').style.width = pct + '%';
    document.getElementById('pct').textContent = pct + '% complete';

    const rem = Math.max(TOTAL - elapsed, 0);
    const m = Math.floor(rem / 60), s = rem % 60;
    document.getElementById('countdown').textContent = m + ':' + pad(s) + ' remaining';

    // Update message
    let msg = messages[0][1];
    for(const [t, m2] of messages){ if(elapsed >= t) msg = m2; }
    document.getElementById('msg').textContent = msg;

    // Update steps
    for(const step of steps){
      const s1 = document.getElementById('s'+step.id);
      const d1 = document.getElementById('d'+step.id);
      const t1 = document.getElementById('t'+step.id);
      if(elapsed >= step.done){
        s1.className = 'step done'; d1.className = 'step-dot done'; d1.textContent = '✓';
      } else if(elapsed >= step.at){
        s1.className = 'step active'; d1.className = 'step-dot active';
        t1.textContent = step.active;
      }
    }

    // Enable button after 6 minutes
    if(elapsed >= TOTAL){
      clearInterval(interval);
      document.getElementById('countdown').textContent = 'Ready!';
      document.getElementById('msg').textContent = 'Your site should be ready now!';
      const btn = document.getElementById('btn');
      btn.classList.add('ready');
      btn.disabled = false;
      btn.textContent = 'Open Your Site Now →';
      // Auto reload
      setTimeout(() => location.reload(), 2000);
    }
  }, 1000);
</script>
</body>
</html>`, { status: 200, headers: { "Content-Type": "text/html" } }); {
  R2: R2Bucket;
  R2_BUCKET_NAME: string;
  WORKER_SECRET: string;
  DATABASE_URL: string;
}

// ── Content type helper ───────────────────────────────────────────────────────
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
    ".mp4": "video/mp4", ".mp3": "audio/mpeg", ".pdf": "application/pdf",
  };
  return types[ext.toLowerCase()] || "application/octet-stream";
}

// ── Rewrite helpers ───────────────────────────────────────────────────────────
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

// ── Main Worker ───────────────────────────────────────────────────────────────
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

    // ── GET: Serve deployed site files from R2 ────────────────────────────────
    if (request.method === "GET") {
      // Match /sites/:siteId or /sites/:siteId/path/to/file
      const match = url.pathname.match(/^\/sites\/([^/]+)(\/.*)?$/);

      if (!match) {
        return new Response("Not found", { status: 404 });
      }

      const siteId = match[1];
      let filePath = match[2] || "/";

      // Strip query strings — R2 files don't have ?ver=xxx
      if (filePath.includes("?")) filePath = filePath.split("?")[0];

      // Strip hash fragments
      if (filePath.includes("#")) filePath = filePath.split("#")[0];

      // Default to index.html for directory requests
      if (filePath.endsWith("/")) filePath += "index.html";

      const r2Key = `sites/${siteId}${filePath}`;

      // Try to get the exact file from R2
      const object = await env.R2.get(r2Key);

      if (!object) {
        // Fallback: try index.html (for SPA routing)
        const fallback = await env.R2.get(`sites/${siteId}/index.html`);
        if (!fallback) {
          return new Response(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Preparing your site — SiteSnap</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Inter',system-ui,sans-serif;background:#0a0a0a;color:#f1f5f9;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:1.5rem}
  .card{background:#111;border:1px solid #1e293b;border-radius:20px;padding:3rem 2.5rem;max-width:480px;width:100%;text-align:center;position:relative;overflow:hidden}
  .glow{position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#0ea5e9,#38bdf8,#0ea5e9);background-size:200% 100%;animation:slide 2s linear infinite}
  @keyframes slide{0%{background-position:200% 0}100%{background-position:-200% 0}}
  .icon{width:72px;height:72px;background:rgba(14,165,233,0.1);border:1px solid rgba(14,165,233,0.3);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 1.5rem;animation:pulse 2s ease-in-out infinite}
  @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.05);opacity:0.8}}
  .spinner{width:28px;height:28px;border:3px solid rgba(14,165,233,0.2);border-top:3px solid #0ea5e9;border-radius:50%;animation:spin 1s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{font-size:1.4rem;font-weight:700;color:#fff;letter-spacing:-0.03em;margin-bottom:0.6rem}
  .subtitle{font-size:0.88rem;color:#94a3b8;line-height:1.7;margin-bottom:2rem}
  .steps{background:#0d0d0d;border:1px solid #1e293b;border-radius:12px;padding:1.2rem 1.4rem;margin-bottom:2rem;text-align:left}
  .step{display:flex;align-items:flex-start;gap:10px;margin-bottom:0.8rem;font-size:0.82rem;color:#94a3b8;line-height:1.5}
  .step:last-child{margin-bottom:0}
  .step-num{background:rgba(14,165,233,0.15);color:#0ea5e9;border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;font-size:0.68rem;font-weight:700;flex-shrink:0;margin-top:1px}
  .timer{font-size:0.75rem;color:#475569;margin-bottom:1.5rem}
  .timer span{color:#0ea5e9;font-weight:600}
  .refresh-btn{background:#0ea5e9;color:#fff;border:none;padding:0.75rem 1.8rem;border-radius:8px;font-size:0.88rem;font-weight:600;cursor:pointer;transition:all 0.2s;font-family:inherit}
  .refresh-btn:hover{background:#0284c7;transform:translateY(-1px)}
  .note{font-size:0.72rem;color:#334155;margin-top:1.2rem}
  .progress-bar{background:#1e293b;border-radius:100px;height:4px;margin-bottom:1.5rem;overflow:hidden}
  .progress-fill{height:100%;background:linear-gradient(90deg,#0ea5e9,#38bdf8);border-radius:100px;animation:progress 7m linear forwards}
  @keyframes progress{from{width:5%}to{width:95%}}
</style>
</head>
<body>
<div class="card">
  <div class="glow"></div>
  <div class="icon"><div class="spinner"></div></div>
  <h1>Your site is being prepared</h1>
  <p class="subtitle">We're processing and deploying your WordPress site to our servers. This usually takes <strong style="color:#e2e8f0">5–8 minutes</strong> depending on your site size.</p>
  <div class="progress-bar"><div class="progress-fill"></div></div>
  <div class="steps">
    <div class="step"><div class="step-num">1</div><span><strong style="color:#e2e8f0">Uploading complete</strong> — your ZIP file has been received</span></div>
    <div class="step"><div class="step-num">2</div><span><strong style="color:#e2e8f0">Processing in progress</strong> — extracting and optimizing your files</span></div>
    <div class="step"><div class="step-num">3</div><span><strong style="color:#cbd5e1">Almost there</strong> — deploying to global servers</span></div>
  </div>
  <div class="timer">Auto-refreshing in <span id="countdown">60</span> seconds</div>
  <button class="refresh-btn" onclick="location.reload()">Refresh Now</button>
  <p class="note">If the site doesn't load after 10 minutes, please try re-uploading your ZIP file.</p>
</div>
<script>
  let seconds = 60;
  const el = document.getElementById('countdown');
  const interval = setInterval(() => {
    seconds--;
    if (el) el.textContent = seconds;
    if (seconds <= 0) { clearInterval(interval); location.reload(); }
  }, 1000);
</script>
</body>
</html>`, { status: 200, headers: { "Content-Type": "text/html" } });
        }
        return new Response(fallback.body, {
          headers: {
            "Content-Type": "text/html",
            "Cache-Control": "public, max-age=3600",
            ...corsHeaders,
          },
        });
      }

      // Get file extension for content type
      const ext = filePath.includes(".")
        ? filePath.substring(filePath.lastIndexOf("."))
        : "";

      return new Response(object.body, {
        headers: {
          "Content-Type": getContentType(ext),
          "Cache-Control": "public, max-age=3600",
          ...corsHeaders,
        },
      });
    }

    // ── POST: Process ZIP (kept for backward compatibility) ───────────────────
    if (request.method === "POST") {
      // Verify secret
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

        // Download ZIP from R2
        const tempObject = await env.R2.get(r2Key);
        if (!tempObject) {
          return new Response(JSON.stringify({ error: "Upload not found. Please try again." }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const zipData = new Uint8Array(await tempObject.arrayBuffer());

        // Basic validation
        const keys_check = Object.keys(unzipSync(zipData));
        const hasIndex = keys_check.some(k => {
          const n = k.toLowerCase();
          return !n.includes("__macosx") && (n === "index.html" || n.endsWith("/index.html"));
        });
        if (!hasIndex) {
          await env.R2.delete(r2Key);
          return new Response(JSON.stringify({ error: "invalid_zip", message: "No index.html found." }), {
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
            const ext = relKey.includes(".") ? relKey.substring(relKey.lastIndexOf(".")).toLowerCase() : "";
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
          id: siteId, name: siteName, url: siteUrl, completed: true
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });

      } catch (e: any) {
        return new Response(JSON.stringify({ error: "Processing failed: " + e.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // Method not allowed for anything else
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
};