import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

const CRAWLER_UA_RE = /Googlebot|Twitterbot|facebookexternalhit|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|bingbot|Applebot|Baiduspider|DuckDuckBot|ia_archiver/i;
const MUSICIAN_SLUG_RE = /\/musicians\/([^/?#]+)/;
const API_BASE = process.env.VITE_API_URL ?? "http://localhost:8080";

function ogRedirectPlugin(): Plugin {
  return {
    name: "og-redirect",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const ua = req.headers["user-agent"] ?? "";
        const url = req.url ?? "";

        const slugMatch = url.match(MUSICIAN_SLUG_RE);
        if (!CRAWLER_UA_RE.test(ua) || !slugMatch) {
          return next();
        }

        const slug = encodeURIComponent(slugMatch[1]);
        const ogUrl = `${API_BASE}/api/og/musicians/${slug}`;

        res.setHeader("Location", ogUrl);
        res.writeHead(302);
        res.end();
      });
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ogRedirectPlugin(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
