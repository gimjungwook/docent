#!/usr/bin/env node
// Local preview server for Docent. Unlike "python3 -m http.server" it answers HTTP Range requests, which the
// browser needs to jump around in the narration audio (seek bar, "여기서부터 듣기", chapter marks).
//   node scripts/serve.mjs [port]      (default 8810, serves the repo root on 127.0.0.1)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.argv[2] || 8810);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".py": "text/x-python; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon", ".woff2": "font/woff2", ".wasm": "application/wasm",
  ".m4a": "audio/mp4", ".mp3": "audio/mpeg", ".wav": "audio/wav",
};

http.createServer((req, res) => {
  let rel;
  try { rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch { res.writeHead(400).end(); return; }
  if (rel.endsWith("/")) rel += "index.html";
  const file = path.join(ROOT, path.normalize(rel));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("not found"); return; }
    const headers = { "content-type": TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", "accept-ranges": "bytes", "cache-control": "no-cache" };
    const m = req.headers.range && /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (m && (m[1] || m[2])) {
      const start = m[1] ? Number(m[1]) : Math.max(0, st.size - Number(m[2]));
      const end = m[1] && m[2] ? Math.min(Number(m[2]), st.size - 1) : st.size - 1;
      if (start > end || start >= st.size) { res.writeHead(416, { "content-range": "bytes */" + st.size }).end(); return; }
      res.writeHead(206, { ...headers, "content-range": "bytes " + start + "-" + end + "/" + st.size, "content-length": end - start + 1 });
      if (req.method === "HEAD") { res.end(); return; }
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
    res.writeHead(200, { ...headers, "content-length": st.size });
    if (req.method === "HEAD") { res.end(); return; }
    fs.createReadStream(file).pipe(res);
  });
}).listen(port, "127.0.0.1", () => console.log("Docent preview: http://127.0.0.1:" + port + "/"));
