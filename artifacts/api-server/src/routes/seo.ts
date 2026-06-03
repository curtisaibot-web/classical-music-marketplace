import { Router, type IRouter } from "express";
import { and, eq, ilike, sql } from "drizzle-orm";
import { db, seoLandingPagesTable, teacherProfilesTable, usersTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/seo/landing-pages", async (_req, res): Promise<void> => {
  const pages = await db
    .select()
    .from(seoLandingPagesTable)
    .where(eq(seoLandingPagesTable.isEnabled, true));

  res.json({ pages, total: pages.length });
});

router.get("/seo/landing-pages/:slug", async (req, res): Promise<void> => {
  const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;

  const [page] = await db
    .select()
    .from(seoLandingPagesTable)
    .where(and(eq(seoLandingPagesTable.slug, slug), eq(seoLandingPagesTable.isEnabled, true)));

  if (!page) {
    res.status(404).json({ error: "SEO landing page not found" });
    return;
  }

  const conditions = [];
  if (page.instrument) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM UNNEST(${teacherProfilesTable.instruments}) AS instr WHERE LOWER(instr) = LOWER(${page.instrument}))`,
    );
  }
  if (page.city) {
    conditions.push(ilike(teacherProfilesTable.city, `%${page.city}%`));
  }
  if (page.country) {
    conditions.push(ilike(teacherProfilesTable.country, `%${page.country}%`));
  }

  const rows = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .limit(24);

  res.json({
    page,
    teachers: rows.map((r) => ({ ...r.teacher_profiles, user: r.users })),
  });
});

export default router;
