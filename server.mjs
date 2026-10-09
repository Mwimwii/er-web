// Minimal static file server for the generated site.
//
// Mirrors what a real static host does: unknown paths answer with the
// hand-written 404.html at status 404 instead of a bare text line, so a
// miss looks the same locally as it will in front of the tunnel.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(process.env.SITE_ROOT || path.join(process.cwd(), "site"));
const PORT = Number(process.argv[2] || 8080);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".gif": "image/gif", ".svg": "image/svg+xml", ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".mp4": "video/mp4", ".webm": "video/webm",
  ".ogg": "audio/ogg", ".wav": "audio/wav", ".bin": "application/octet-stream",
  ".txt": "text/plain; charset=utf-8", ".pdf": "application/pdf",
};

// Resolves a request path inside ROOT, or null if it escapes ROOT.
// path.normalize collapses ".." before the containment check, and the
// separator in the check stops ROOT from matching a sibling directory
// such as `site-evil` next to `site`.
function resolveSafe(pathname) {
  const abs = path.normalize(path.join(ROOT, decodeURIComponent(pathname)));
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  return abs;
}

function send(res, status, filePath, fallbackType) {
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(500); return res.end("server error"); }
    res.writeHead(status, {
      "content-type": MIME[path.extname(filePath)] || fallbackType || "application/octet-stream",
      "cache-control": "no-cache",
    });
    res.end(data);
  });
}

http.createServer((req, res) => {
  let urlPath;
  try { urlPath = decodeURI(new URL(req.url, "http://x").pathname); }
  catch { res.writeHead(400); return res.end("bad request"); }

  const file = resolveSafe(urlPath);
  if (!file) { res.writeHead(403); return res.end("forbidden"); }

  fs.stat(file, (err, st) => {
    const target = !err && st.isDirectory() ? path.join(file, "index.html") : file;
    fs.stat(target, (err2, st2) => {
      if (err2 || !st2.isFile()) {
        const notFound = path.join(ROOT, "404.html");
        return fs.stat(notFound, (e3, s3) => {
          if (e3 || !s3.isFile()) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("not found: " + urlPath); }
          send(res, 404, notFound);
        });
      }
      send(res, 200, target);
    });
  });
}).listen(PORT, () => console.log(`eldensite on http://localhost:${PORT} (root ${ROOT})`));
