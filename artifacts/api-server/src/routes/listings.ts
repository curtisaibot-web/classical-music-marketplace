import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, gte, lte, count, ilike, inArray, sql, or } from "drizzle-orm";
import { db, listingsTable, teacherProfilesTable, usersTable, masterclassEventsTable, digitalProductsTable, orgMembersTable, organisationsTable } from "@workspace/db";
import {
  GetListingResponse,
  ListListingsResponse,
  CreateListingBody,
  UpdateListingBody,
  ListListingsQueryParams,
  GetTeacherListingsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

const router: IRouter = Router();

router.get("/listings", async (req, res): Promise<void> => {
  const params = ListListingsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;
  const type = params.success ? params.data.type : undefined;
  const instrument = params.success ? params.data.instrument : undefined;
  const skillLevel = params.success ? params.data.skillLevel : undefined;
  const minPrice = params.success ? params.data.minPrice : undefined;
  const maxPrice = params.success ? params.data.maxPrice : undefined;
  const city = params.success ? params.data.city : undefined;
  const isOnline = params.success ? params.data.isOnline : undefined;
  const dayOfWeek = params.success ? params.data.dayOfWeek : undefined;
  const orgSlugParam = typeof req.query.orgSlug === "string" ? req.query.orgSlug : undefined;

  const conditions = [eq(listingsTable.status, "active")];

  // ── Org-scoped listing filtering ─────────────────────────────────────────
  // When orgSlug is provided, restrict listings to teachers in that org.
  // For school-private orgs the caller must be an enrolled member.
  if (orgSlugParam) {
    const [org] = await db
      .select({ id: organisationsTable.id, isPublicMarketplace: organisationsTable.isPublicMarketplace })
      .from(organisationsTable)
      .where(eq(organisationsTable.slug, orgSlugParam));

    if (!org) {
      res.json(ListListingsResponse.parse({ listings: [], total: 0 }));
      return;
    }

    if (!org.isPublicMarketplace) {
      // Private org: require authenticated enrollment
      const auth = getAuth(req);
      const callerId = auth.userId ?? null;
      if (!callerId) {
        res.status(403).json({ error: "Authentication required to view this school's listings" });
        return;
      }
      const [membership] = await db
        .select({ id: orgMembersTable.id })
        .from(orgMembersTable)
        .where(and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.userId, callerId)));
      if (!membership) {
        res.status(403).json({ error: "You must be enrolled in this school to view its listings" });
        return;
      }
    }

    // Restrict to teachers who are members of this org
    const orgTeacherRows = await db
      .select({ userId: orgMembersTable.userId })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.role, "teacher")));
    const orgTeacherIds = orgTeacherRows.map((r) => r.userId).filter((id): id is string => id !== null);

    if (orgTeacherIds.length === 0) {
      res.json(ListListingsResponse.parse({ listings: [], total: 0 }));
      return;
    }
    conditions.push(inArray(listingsTable.teacherId, orgTeacherIds));
  } else {
    // No org context — hide listings from teachers in private orgs
    const privateOrgTeacherRows = await db
      .select({ userId: orgMembersTable.userId })
      .from(orgMembersTable)
      .innerJoin(organisationsTable, eq(orgMembersTable.orgId, organisationsTable.id))
      .where(and(eq(orgMembersTable.role, "teacher"), eq(organisationsTable.isPublicMarketplace, false)));
    const privateOrgTeacherIds = privateOrgTeacherRows
      .map((r) => r.userId)
      .filter((id): id is string => id !== null);
    if (privateOrgTeacherIds.length > 0) {
      conditions.push(
        sql`${listingsTable.teacherId} NOT IN (${sql.raw(privateOrgTeacherIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(","))})`,
      );
    }
  }
  if (type) conditions.push(eq(listingsTable.type, type as "lesson" | "event" | "masterclass" | "digital_product"));
  if (instrument) conditions.push(ilike(listingsTable.instrument, instrument));
  if (skillLevel) conditions.push(eq(listingsTable.skillLevel, skillLevel as "beginner" | "intermediate" | "advanced" | "all"));
  if (city) conditions.push(ilike(listingsTable.city, `%${city}%`));
  if (isOnline !== undefined) conditions.push(eq(listingsTable.isOnline, isOnline));
  if (minPrice !== undefined) conditions.push(gte(listingsTable.priceInCents, minPrice));
  if (maxPrice !== undefined) conditions.push(lte(listingsTable.priceInCents, maxPrice));

  if (dayOfWeek !== undefined) {
    const effectiveType = type as string | undefined;
    // Only masterclass listings have rows in masterclass_events.
    // lesson, event, and digital_product are non-schedulable — skip DOW filter for them.
    const isSchedulable = effectiveType === "masterclass";
    const isNonSchedulable = effectiveType === "lesson" || effectiveType === "event" || effectiveType === "digital_product";
    if (!isNonSchedulable) {
      const listingIdsForDay = await db
        .selectDistinct({ listingId: masterclassEventsTable.listingId })
        .from(masterclassEventsTable)
        .where(and(
          eq(masterclassEventsTable.isCancelled, false),
          gte(masterclassEventsTable.scheduledAt, new Date()),
          sql`EXTRACT(DOW FROM ${masterclassEventsTable.scheduledAt}) = ${dayOfWeek}`,
        ));
      const ids = listingIdsForDay.map((r) => r.listingId).filter((id): id is number => id !== null);
      if (ids.length === 0) {
        if (isSchedulable) {
          res.json(ListListingsResponse.parse({ listings: [], total: 0 }));
          return;
        }
        // No masterclass results for this day — only show non-schedulable types
        conditions.push(sql`${listingsTable.type} IN ('lesson', 'event', 'digital_product')`);
      } else if (isSchedulable) {
        conditions.push(inArray(listingsTable.id, ids));
      } else {
        // All types: matched masterclass listings + all non-schedulable types
        conditions.push(or(
          inArray(listingsTable.id, ids),
          sql`${listingsTable.type} IN ('lesson', 'event', 'digital_product')`,
        )!);
      }
    }
    // else: effectiveType is lesson/event/digital_product — skip DOW filter entirely
  }

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ count: count() }).from(listingsTable).where(where),
    db
      .select()
      .from(listingsTable)
      .leftJoin(teacherProfilesTable, eq(listingsTable.teacherId, teacherProfilesTable.userId))
      .leftJoin(usersTable, eq(listingsTable.teacherId, usersTable.id))
      .where(where)
      .limit(limit)
      .offset(offset),
  ]);

  const listingIds = rows.map((r) => r.listings.id);
  const [dpRows, mcRows] = listingIds.length > 0
    ? await Promise.all([
        db.select({ id: digitalProductsTable.id, listingId: digitalProductsTable.listingId })
          .from(digitalProductsTable)
          .where(inArray(digitalProductsTable.listingId, listingIds)),
        db.select({ id: masterclassEventsTable.id, listingId: masterclassEventsTable.listingId })
          .from(masterclassEventsTable)
          .where(and(
            inArray(masterclassEventsTable.listingId, listingIds),
            eq(masterclassEventsTable.isCancelled, false),
          )),
      ])
    : [[], []];

  const dpMap = new Map<number, number>(dpRows.map((d) => [d.listingId, d.id]));
  const mcMap = new Map<number, number>(mcRows.map((m) => [m.listingId, m.id]));

  const listings = rows.map((r) => ({
    ...r.listings,
    digitalProductId: dpMap.get(r.listings.id) ?? null,
    masterclassEventId: mcMap.get(r.listings.id) ?? null,
    teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
  }));

  res.json(ListListingsResponse.parse({ listings, total: totalRow[0]?.count ?? 0 }));
});

router.post("/listings", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = CreateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // ── Org listing-type policy enforcement ──────────────────────────────────
  // If this teacher belongs to a school that restricts listing types, validate.
  const [memberRow] = await db
    .select({ orgId: orgMembersTable.orgId })
    .from(orgMembersTable)
    .innerJoin(organisationsTable, eq(orgMembersTable.orgId, organisationsTable.id))
    .where(eq(orgMembersTable.userId, userId))
    .limit(1);

  if (memberRow) {
    const [org] = await db
      .select({ allowedListingTypes: organisationsTable.allowedListingTypes, defaultLessonRateCents: organisationsTable.defaultLessonRateCents })
      .from(organisationsTable)
      .where(eq(organisationsTable.id, memberRow.orgId));

    if (org && org.allowedListingTypes.length > 0) {
      if (!org.allowedListingTypes.includes(parsed.data.type)) {
        res.status(403).json({ error: `Your school only allows the following listing types: ${org.allowedListingTypes.join(", ")}` });
        return;
      }
    }

    // Apply school default lesson rate if teacher hasn't set a custom price and listing is a lesson
    if (parsed.data.type === "lesson" && !parsed.data.priceInCents && org?.defaultLessonRateCents) {
      (parsed.data as Record<string, unknown>).priceInCents = org.defaultLessonRateCents;
    }
  }

  const [listing] = await db
    .insert(listingsTable)
    .values({ ...parsed.data, teacherId: userId })
    .returning();

  res.status(201).json(GetListingResponse.parse({ ...listing, teacher: undefined }));
});

router.get("/listings/teacher/:userId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const rows = await db
    .select()
    .from(listingsTable)
    .leftJoin(teacherProfilesTable, eq(listingsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(listingsTable.teacherId, usersTable.id))
    .where(and(eq(listingsTable.teacherId, rawId), eq(listingsTable.status, "active")));

  const listings = rows.map((r) => ({
    ...r.listings,
    teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
  }));

  res.json(GetTeacherListingsResponse.parse({ listings, total: listings.length }));
});

router.get("/listings/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  const [row] = await db
    .select()
    .from(listingsTable)
    .leftJoin(teacherProfilesTable, eq(listingsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(listingsTable.teacherId, usersTable.id))
    .where(eq(listingsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.json(GetListingResponse.parse({ ...row.listings, teacher: row.teacher_profiles ? { ...row.teacher_profiles, user: row.users } : undefined }));
});

router.patch("/listings/:id", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  const parsed = UpdateListingBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [listing] = await db
    .update(listingsTable)
    .set({
      ...parsed.data,
      skillLevel: parsed.data.skillLevel as "beginner" | "intermediate" | "advanced" | "all" | undefined,
      updatedAt: new Date(),
    })
    .where(and(eq(listingsTable.id, id), eq(listingsTable.teacherId, userId)))
    .returning();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.json(GetListingResponse.parse({ ...listing, teacher: undefined }));
});

router.delete("/listings/:id", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid listing id" });
    return;
  }

  const [listing] = await db
    .delete(listingsTable)
    .where(and(eq(listingsTable.id, id), eq(listingsTable.teacherId, userId)))
    .returning();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  res.sendStatus(204);
});

export default router;
