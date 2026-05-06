import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, teacherProfilesTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

const CRAWLER_UA_RE = /Googlebot|Twitterbot|facebookexternalhit|LinkedInBot|WhatsApp|Slackbot|TelegramBot|Discordbot|bingbot|Applebot|Baiduspider|DuckDuckBot|ia_archiver/i;

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

router.get("/og/musicians/:slug", async (req, res): Promise<void> => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;

  const [result] = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(eq(teacherProfilesTable.profileSlug, slug));

  if (!result) {
    res.status(404).json({ error: "Musician not found" });
    return;
  }

  const { teacher_profiles: profile, users: user } = result;

  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";
  const fullName = `${firstName} ${lastName}`.trim() || "Musician";
  const instruments = (profile.instruments ?? []).join(", ");
  const title = esc(instruments ? `${fullName} — ${instruments} Musician | Harmonia` : `${fullName} | Harmonia`);
  const description = esc(
    profile.bio
      ? profile.bio.slice(0, 160)
      : `Classical musician specializing in ${instruments || "music"}. Based in ${profile.city ?? "Online"}.`
  );
  const imageUrl = esc(profile.profileImageUrl ?? "");
  const spaBase = process.env.VITE_APP_ORIGIN ?? "";
  const basePath = process.env.VITE_BASE_PATH ?? "/marketplace/";
  const canonicalUrl = esc(`${spaBase}${basePath}musicians/${slug}`);
  const spaUrl = canonicalUrl;

  const ua = req.headers["user-agent"] ?? "";
  const isCrawler = CRAWLER_UA_RE.test(ua);

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
  ${!isCrawler ? `<meta http-equiv="refresh" content="0;url=${spaUrl}" />` : ""}
</head>
<body>
  <p>
    <a href="${spaUrl}">${esc(fullName)}'s musician profile</a>
  </p>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  res.status(200).send(html);
});

export default router;
