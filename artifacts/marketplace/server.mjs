/**
 * Production server for Classical Music Marketplace.
 * Serves static assets and performs UA-based OG routing for crawler requests
 * to /musicians/:slug, proxying them to the API's OG endpoint.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, "dist/public");
const PORT = Number(process.env.PORT ?? 5173);
const API_PORT = Number(process.env.API_PORT ?? 8080);

const CRAWLER_UA_RE =
  /Googlebot|Twitterbot|facebookexternalhit|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|bingbot|Applebot|Baiduspider|DuckDuckBot|ia_archiver/i;

const MUSICIAN_SLUG_RE = /^\/musicians\/([^/?#]+)(?:[/?#].*)?$/;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".txt": "text/plain",
};

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      serveIndex(res);
    } else {
      res.writeHead(200, { "Content-Type": getMime(filePath) });
      res.end(data);
    }
  });
}

function serveIndex(res) {
  fs.readFile(path.join(DIST, "index.html"), (err, data) => {
    if (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Internal Server Error");
    } else {
      res.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(data);
    }
  });
}

function proxyOg(req, res, slug) {
  const options = {
    hostname: "localhost",
    port: API_PORT,
    path: `/api/og/musicians/${encodeURIComponent(slug)}`,
    method: "GET",
    headers: {
      "user-agent": req.headers["user-agent"] ?? "",
      accept: req.headers.accept ?? "text/html",
    },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    const status = proxyRes.statusCode ?? 200;
    res.writeHead(status, {
      "Content-Type": proxyRes.headers["content-type"] ?? "text/html",
      "Cache-Control":
        proxyRes.headers["cache-control"] ?? "public, max-age=60",
    });
    proxyRes.pipe(res);
  });

  proxyReq.on("error", () => {
    serveIndex(res);
  });

  proxyReq.end();
}

const server = http.createServer((req, res) => {
  const urlPath = req.url?.split("?")[0] ?? "/";

  const ua = req.headers["user-agent"] ?? "";
  const slugMatch = urlPath.match(MUSICIAN_SLUG_RE);

  if (slugMatch && CRAWLER_UA_RE.test(ua)) {
    proxyOg(req, res, slugMatch[1]);
    return;
  }

  const filePath = path.join(DIST, urlPath === "/" ? "index.html" : urlPath);
  const ext = path.extname(filePath);

  if (!ext || ext === ".html") {
    serveIndex(res);
    return;
  }

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) {
      serveIndex(res);
    } else {
      serveFile(res, filePath);
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Marketplace server listening on port ${PORT}`);
});
