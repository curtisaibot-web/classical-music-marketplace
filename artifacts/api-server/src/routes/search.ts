import { Router, type IRouter } from "express";
import { and, eq, ilike, or, sql } from "drizzle-orm";
import { db, teacherProfilesTable, usersTable, listingsTable, masterclassEventsTable, digitalProductsTable } from "@workspace/db";

const router: IRouter = Router();

router.get("/search", async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const instrument = typeof req.query.instrument === "string" ? req.query.instrument.trim() : "";
  const city = typeof req.query.city === "string" ? req.query.city.trim() : "";
  const limit = Math.min(Number(req.query.limit ?? 8) || 8, 25);

  const teacherConditions = [];
  if (q) {
    teacherConditions.push(sql`(
      ${teacherProfilesTable.bio} ILIKE ${`%${q}%`} OR
      ${teacherProfilesTable.city} ILIKE ${`%${q}%`} OR
      EXISTS (SELECT 1 FROM UNNEST(${teacherProfilesTable.instruments}) AS instr WHERE instr ILIKE ${`%${q}%`}) OR
      EXISTS (SELECT 1 FROM UNNEST(${teacherProfilesTable.genres}) AS genre WHERE genre ILIKE ${`%${q}%`})
    )`);
  }
  if (instrument) {
    teacherConditions.push(sql`EXISTS (SELECT 1 FROM UNNEST(${teacherProfilesTable.instruments}) AS instr WHERE LOWER(instr) = LOWER(${instrument}))`);
  }
  if (city) teacherConditions.push(ilike(teacherProfilesTable.city, `%${city}%`));

  const listingConditions = [eq(listingsTable.status, "active")];
  if (q) {
    listingConditions.push(or(
      ilike(listingsTable.title, `%${q}%`),
      ilike(listingsTable.description, `%${q}%`),
      ilike(listingsTable.instrument, `%${q}%`),
      sql`EXISTS (SELECT 1 FROM UNNEST(${listingsTable.tags}) AS tag WHERE tag ILIKE ${`%${q}%`})`,
    )!);
  }
  if (instrument) listingConditions.push(ilike(listingsTable.instrument, `%${instrument}%`));
  if (city) listingConditions.push(ilike(listingsTable.city, `%${city}%`));

  const [teacherRows, listingRows, masterclassRows, productRows] = await Promise.all([
    db
      .select()
      .from(teacherProfilesTable)
      .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
      .where(teacherConditions.length ? and(...teacherConditions) : undefined)
      .limit(limit),
    db
      .select()
      .from(listingsTable)
      .where(and(...listingConditions))
      .limit(limit),
    db
      .select()
      .from(masterclassEventsTable)
      .where(
        and(
          eq(masterclassEventsTable.isCancelled, false),
          q
            ? or(
                ilike(masterclassEventsTable.title, `%${q}%`),
                ilike(masterclassEventsTable.description, `%${q}%`),
                ilike(masterclassEventsTable.instrument, `%${q}%`),
              )!
            : sql`true`,
        ),
      )
      .limit(limit),
    db
      .select()
      .from(digitalProductsTable)
      .where(
        and(
          eq(digitalProductsTable.isPublished, true),
          q
            ? or(
                ilike(digitalProductsTable.title, `%${q}%`),
                ilike(digitalProductsTable.description, `%${q}%`),
                ilike(digitalProductsTable.instrument, `%${q}%`),
                ilike(digitalProductsTable.category, `%${q}%`),
              )!
            : sql`true`,
        ),
      )
      .limit(limit),
  ]);

  res.json({
    query: q,
    teachers: teacherRows.map((r) => ({ ...r.teacher_profiles, user: r.users })),
    listings: listingRows,
    masterclasses: masterclassRows,
    digitalProducts: productRows,
  });
});

export default router;
