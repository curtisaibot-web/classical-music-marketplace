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

function ogInjectionPlugin(): Plugin {
  return {
    name: "og-injection",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const ua = req.headers["user-agent"] ?? "";
        const url = req.url ?? "";

        const slugMatch = url.match(MUSICIAN_SLUG_RE);
        if (!CRAWLER_UA_RE.test(ua) || !slugMatch) {
          return next();
        }

        const slug = slugMatch[1];

        try {
          const apiRes = await fetch(`${API_BASE}/api/teachers/by-slug/${slug}`);
          if (!apiRes.ok) return next();

          const teacher = await apiRes.json() as {
            user?: { firstName?: string; lastName?: string };
            bio?: string;
            instruments?: string[];
            city?: string;
            profileImageUrl?: string;
            profileSlug?: string;
          };

          const firstName = teacher.user?.firstName ?? "";
          const lastName = teacher.user?.lastName ?? "";
          const fullName = `${firstName} ${lastName}`.trim() || "Musician";
          const instruments = (teacher.instruments ?? []).join(", ");
          const title = `${fullName} — ${instruments} Musician | Harmonia`;
          const description = teacher.bio
            ? teacher.bio.slice(0, 160)
            : `Classical musician specializing in ${instruments}. Based in ${teacher.city ?? "Online"}.`;
          const imageUrl = teacher.profileImageUrl ?? "";
          const canonicalUrl = `${process.env.VITE_CANONICAL_ORIGIN ?? ""}${basePath}musicians/${slug}`;

          const ogHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description.replace(/"/g, "&quot;")}" />
  <meta property="og:type" content="profile" />
  <meta property="og:title" content="${title.replace(/"/g, "&quot;")}" />
  <meta property="og:description" content="${description.replace(/"/g, "&quot;")}" />
  <meta property="og:url" content="${canonicalUrl}" />
  ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />` : ""}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title.replace(/"/g, "&quot;")}" />
  <meta name="twitter:description" content="${description.replace(/"/g, "&quot;")}" />
  ${imageUrl ? `<meta name="twitter:image" content="${imageUrl}" />` : ""}
  <script>window.location.href="${canonicalUrl}";</script>
</head>
<body><p>Loading musician profile…</p></body>
</html>`;

          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "public, max-age=60");
          res.end(ogHtml);
        } catch {
          next();
        }
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
    ogInjectionPlugin(),
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
