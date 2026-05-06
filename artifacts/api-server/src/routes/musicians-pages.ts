import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, teacherProfilesTable, usersTable } from "@workspace/db";
import fs from "node:fs/promises";
import path from "node:path";

const router: IRouter = Router();

const CRAWLER_UA_RE =
  /Googlebot|Twitterbot|facebookexternalhit|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|bingbot|Applebot|Baiduspider|DuckDuckBot|ia_archiver/i;

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function getSpaHtml(): Promise<string> {
  if (process.env.NODE_ENV === "production") {
    const distPath = path.resolve(
      process.cwd(),
      "artifacts/marketplace/dist/public/index.html",
    );
    try {
      return await fs.readFile(distPath, "utf-8");
    } catch {
      return "<!DOCTYPE html><html><body><p>Loading...</p></body></html>";
    }
  }

  const vitePort = process.env.MARKETPLACE_VITE_PORT ?? "5173";
  try {
    const res = await fetch(`http://localhost:${vitePort}/`);
    return await res.text();
  } catch {
    return "<!DOCTYPE html><html><body><p>Loading...</p></body></html>";
  }
}

router.get("/:slug", async (req, res): Promise<void> => {
  const slug = Array.isArray(req.params.slug)
    ? req.params.slug[0]
    : req.params.slug;

  const ua = req.headers["user-agent"] ?? "";
  const isCrawler = CRAWLER_UA_RE.test(ua);

  if (!isCrawler) {
    const spaHtml = await getSpaHtml();
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(spaHtml);
    return;
  }

  const [result] = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(eq(teacherProfilesTable.profileSlug, slug));

  if (!result) {
    res.status(404).send("<!DOCTYPE html><html><body><p>Musician not found</p></body></html>");
    return;
  }

  const { teacher_profiles: profile, users: user } = result;

  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const fullName = `${firstName} ${lastName}`.trim() || "Musician";
  const instruments = (profile.instruments ?? []).join(", ");
  const title = esc(
    instruments
      ? `${fullName} — ${instruments} Musician | Harmonia`
      : `${fullName} | Harmonia`,
  );
  const description = esc(
    profile.bio
      ? profile.bio.slice(0, 160)
      : `Classical musician specializing in ${instruments || "music"}. Based in ${profile.city ?? "Online"}.`,
  );
  const imageUrl = esc(profile.profileImageUrl ?? "");
  const origin = process.env.VITE_APP_ORIGIN ?? "";
  const canonicalUrl = esc(`${origin}/musicians/${slug}`);

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <meta property="og:type" content="profile" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:url" content="${canonicalUrl}" />
  <meta property="og:site_name" content="Harmonia" />
  ${imageUrl ? `<meta property="og:image" content="${imageUrl}" />\n  <meta name="twitter:image" content="${imageUrl}" />` : ""}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${title}" />
  <meta name="twitter:description" content="${description}" />
</head>
<body>
  <p><a href="${canonicalUrl}">${esc(fullName)}'s musician profile on Harmonia</a></p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, max-age=60, stale-while-revalidate=300",
  );
  res.status(200).send(html);
});

export default router;
