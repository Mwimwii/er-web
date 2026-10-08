// Minimal static file server for the generated site.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = process.env.SITE_ROOT || path.join(process.cwd(), "site");
const PORT = Number(process.argv[2] || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".ogg": "audio/ogg", ".wav": "audio/wav", ".bin": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8", ".pdf": "application/pdf",
};

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURI(new URL(req.url, "http://x").pathname); } catch { res.writeHead(400); return res.end("bad request"); }
  let file = path.join(ROOT, urlPath);
  if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end("forbidden"); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found: " + urlPath); }
    res.writeHead(200, { "content-type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
}).listen(PORT, () => console.log(`eldensite on http://localhost:${PORT}`));
