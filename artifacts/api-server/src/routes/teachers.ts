import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, gte, lte, sql, count, ilike, inArray, or } from "drizzle-orm";
import { db, teacherProfilesTable, usersTable, listingsTable, masterclassEventsTable, subscriptionsTable, orgMembersTable, organisationsTable } from "@workspace/db";
import {
  GetTeacherResponse,
  GetMyTeacherProfileResponse,
  UpdateMyTeacherProfileBody,
  ListTeachersResponse,
  ListTeachersQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { isProSubscriber } from "./subscriptions";

async function getProSubscriberIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .select({ userId: subscriptionsTable.userId })
    .from(subscriptionsTable)
    .where(
      and(
        inArray(subscriptionsTable.userId, userIds),
        sql`${subscriptionsTable.status} IN ('active', 'trialing')`,
      ),
    );
  return new Set(rows.map((r) => r.userId));
}

const SLUG_RE = /^[a-z0-9-]{3,64}$/;

const router: IRouter = Router();

router.get("/teachers", async (req, res): Promise<void> => {
  const params = ListTeachersQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;
  const instrument = params.success ? params.data.instrument : undefined;
  const instrumentsRaw = params.success ? params.data.instruments : undefined;
  const city = params.success ? params.data.city : undefined;
  const minRate = params.success ? params.data.minRate : undefined;
  const maxRate = params.success ? params.data.maxRate : undefined;
  const listingType = params.success ? params.data.listingType : undefined;
  const dayOfWeek = params.success ? params.data.dayOfWeek : undefined;
  const onlineOnly = req.query.onlineOnly === "true";
  const orgSlug = typeof req.query.orgSlug === "string" ? req.query.orgSlug : undefined;

  const resolvedInstruments = instrumentsRaw
    ? instrumentsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : instrument ? [instrument] : [];

  const conditions = [];
  if (resolvedInstruments.length === 1) {
    const i = resolvedInstruments[0];
    conditions.push(sql`EXISTS (SELECT 1 FROM UNNEST(${teacherProfilesTable.instruments}) AS instr WHERE LOWER(instr) = LOWER(${i}))`);
  } else if (resolvedInstruments.length > 1) {
    const orParts = resolvedInstruments.map(
      (i) => sql`EXISTS (SELECT 1 FROM UNNEST(${teacherProfilesTable.instruments}) AS instr WHERE LOWER(instr) = LOWER(${i}))`
    );
    conditions.push(sql`(${sql.join(orParts, sql` OR `)})`);
  }
  if (city) {
    conditions.push(ilike(teacherProfilesTable.city, `%${city}%`));
  }
  if (minRate !== undefined) {
    conditions.push(gte(teacherProfilesTable.hourlyRate, minRate));
  }
  if (maxRate !== undefined) {
    conditions.push(lte(teacherProfilesTable.hourlyRate, maxRate));
  }

  if (onlineOnly) {
    const teacherIdsOnline = await db
      .selectDistinct({ teacherId: listingsTable.teacherId })
      .from(listingsTable)
      .where(and(eq(listingsTable.isOnline, true), eq(listingsTable.status, "active")));
    const ids = teacherIdsOnline.map((r) => r.teacherId);
    if (ids.length === 0) {
      res.json(ListTeachersResponse.parse({ teachers: [], total: 0 }));
      return;
    }
    conditions.push(inArray(teacherProfilesTable.userId, ids));
  }

  if (listingType) {
    const teacherIdsWithType = await db
      .selectDistinct({ teacherId: listingsTable.teacherId })
      .from(listingsTable)
      .where(and(eq(listingsTable.type, listingType as "lesson" | "event" | "masterclass" | "digital_product"), eq(listingsTable.status, "active")));
    const ids = teacherIdsWithType.map((r) => r.teacherId);
    if (ids.length === 0) {
      res.json(ListTeachersResponse.parse({ teachers: [], total: 0 }));
      return;
    }
    conditions.push(inArray(teacherProfilesTable.userId, ids));
  }

  if (dayOfWeek !== undefined) {
    // Only masterclass listings have rows in masterclass_events.
    // lesson, event, and digital_product are non-schedulable — skip DOW filter for them.
    const skipDow = listingType === "lesson" || listingType === "event" || listingType === "digital_product";
    if (!skipDow) {
      const teacherIdsWithDay = await db
        .selectDistinct({ teacherId: masterclassEventsTable.teacherId })
        .from(masterclassEventsTable)
        .where(and(
          eq(masterclassEventsTable.isCancelled, false),
          gte(masterclassEventsTable.scheduledAt, new Date()),
          sql`EXTRACT(DOW FROM ${masterclassEventsTable.scheduledAt}) = ${dayOfWeek}`,
        ));
      const ids = teacherIdsWithDay.map((r) => r.teacherId);
      if (ids.length === 0) {
        if (listingType === "masterclass") {
          res.json(ListTeachersResponse.parse({ teachers: [], total: 0 }));
          return;
        }
        // No teachers with masterclasses on this day — still show all teachers when no type filter
        // (they may offer lessons on any day)
      } else {
        conditions.push(inArray(teacherProfilesTable.userId, ids));
      }
    }
  }

  // ── Org-scoped filtering ──────────────────────────────────────────────────
  if (orgSlug) {
    const [org] = await db
      .select({ id: organisationsTable.id, isPublicMarketplace: organisationsTable.isPublicMarketplace })
      .from(organisationsTable)
      .where(eq(organisationsTable.slug, orgSlug));

    if (!org) {
      // Unknown org slug — return empty
      res.json(ListTeachersResponse.parse({ teachers: [], total: 0 }));
      return;
    }

    // Teachers who belong to this org
    const orgTeacherRows = await db
      .select({ userId: orgMembersTable.userId })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.role, "teacher")));
    const orgTeacherIds = orgTeacherRows.map((r) => r.userId).filter((id): id is string => id !== null);

    if (!org.isPublicMarketplace) {
      // School-private: only show teachers who belong to this org
      if (orgTeacherIds.length === 0) {
        res.json(ListTeachersResponse.parse({ teachers: [], total: 0 }));
        return;
      }
      conditions.push(inArray(teacherProfilesTable.userId, orgTeacherIds));
    } else if (orgTeacherIds.length > 0) {
      // Public marketplace org: show org teachers + teachers with no org
      conditions.push(
        or(
          inArray(teacherProfilesTable.userId, orgTeacherIds),
          sql`${teacherProfilesTable.orgId} IS NULL`,
        )!,
      );
    }
  } else {
    // No org context — show only teachers with no org, or teachers whose org allows public marketplace
    // (teachers with an org that is not public are only shown in their org portal)
    const privateOrgTeacherRows = await db
      .select({ userId: orgMembersTable.userId })
      .from(orgMembersTable)
      .innerJoin(organisationsTable, eq(orgMembersTable.orgId, organisationsTable.id))
      .where(
        and(
          eq(orgMembersTable.role, "teacher"),
          eq(organisationsTable.isPublicMarketplace, false),
        ),
      );
    const privateOrgTeacherIds = privateOrgTeacherRows
      .map((r) => r.userId)
      .filter((id): id is string => id !== null);

    if (privateOrgTeacherIds.length > 0) {
      conditions.push(
        or(
          sql`${teacherProfilesTable.userId} NOT IN (${sql.raw(privateOrgTeacherIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(","))})`,
        )!,
      );
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalRow, profiles] = await Promise.all([
    db.select({ count: count() }).from(teacherProfilesTable).where(where),
    db
      .select()
      .from(teacherProfilesTable)
      .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
      .where(where)
      .limit(limit)
      .offset(offset),
  ]);

  const userIds = profiles.map((p) => p.teacher_profiles.userId);
  const proIds = await getProSubscriberIds(userIds);

  const teachers = profiles.map((p) => ({
    ...p.teacher_profiles,
    user: p.users,
    isProSubscriber: proIds.has(p.teacher_profiles.userId),
  }));

  res.json(ListTeachersResponse.parse({ teachers, total: totalRow[0]?.count ?? 0 }));
});

router.get("/teachers/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [result] = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(eq(teacherProfilesTable.userId, userId));

  if (!result) {
    res.status(404).json({ error: "Teacher profile not found" });
    return;
  }

  res.json(GetMyTeacherProfileResponse.parse({ ...result.teacher_profiles, user: result.users }));
});

function buildAutoSlug(firstName: string | null, lastName: string | null, userId: string, attempt = 0): string {
  const suffix = userId.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, "x");
  const base = `${firstName ?? ""} ${lastName ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "musician";
  return attempt === 0 ? `${base}-${suffix}` : `${base}-${suffix}-${attempt}`;
}

async function generateUniqueSlug(firstName: string | null, lastName: string | null, userId: string): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = buildAutoSlug(firstName, lastName, userId, attempt);
    const conflict = await db
      .select({ userId: teacherProfilesTable.userId })
      .from(teacherProfilesTable)
      .where(eq(teacherProfilesTable.profileSlug, candidate))
      .limit(1);
    if (conflict.length === 0 || conflict[0]?.userId === userId) return candidate;
  }
  return `musician-${userId.slice(-12).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
}

router.put("/teachers/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = UpdateMyTeacherProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Cancellation policy fields are a Pro-only feature — verify subscription server-side
  const hasPolicyFields = "cancellationPolicyHours" in parsed.data || "cancellationFeePercent" in parsed.data;
  if (hasPolicyFields) {
    const isPro = await isProSubscriber(userId);
    if (!isPro) {
      res.status(403).json({ error: "Cancellation policy configuration requires an active Business Suite subscription" });
      return;
    }
  }

  // profileSlug is managed exclusively via PUT /teachers/me/slug — strip it here
  const { profileSlug: _ignored, ...profileData } = parsed.data as typeof parsed.data & { profileSlug?: unknown };

  const existing = await db
    .select({ profileSlug: teacherProfilesTable.profileSlug })
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, userId));

  let autoSlug: string | undefined;
  if (!existing[0]?.profileSlug) {
    const [userRow] = await db.select({ firstName: usersTable.firstName, lastName: usersTable.lastName }).from(usersTable).where(eq(usersTable.id, userId));
    autoSlug = await generateUniqueSlug(userRow?.firstName ?? null, userRow?.lastName ?? null, userId);
  }

  const [profile] = await db
    .update(teacherProfilesTable)
    .set({ ...profileData, ...(autoSlug ? { profileSlug: autoSlug } : {}), updatedAt: new Date() })
    .where(eq(teacherProfilesTable.userId, userId))
    .returning();

  if (!profile) {
    res.status(404).json({ error: "Teacher profile not found" });
    return;
  }

  const [result] = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(eq(teacherProfilesTable.userId, userId));

  res.json(GetMyTeacherProfileResponse.parse({ ...result!.teacher_profiles, user: result!.users }));
});

router.get("/teachers/by-slug/:slug", async (req, res): Promise<void> => {
  const slug = req.params.slug;
  const [result] = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(eq(teacherProfilesTable.profileSlug, slug));

  if (!result) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }

  const proIds = await getProSubscriberIds([result.teacher_profiles.userId]);
  res.json(GetTeacherResponse.parse({ ...result.teacher_profiles, user: result.users, isProSubscriber: proIds.has(result.teacher_profiles.userId) }));
});

router.put("/teachers/me/slug", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const slug = typeof req.body?.slug === "string" ? req.body.slug : "";
  if (!SLUG_RE.test(slug)) {
    res.status(400).json({ error: "Slug must be 3–64 characters, lowercase letters, numbers and hyphens only" });
    return;
  }

  const existing = await db
    .select({ id: teacherProfilesTable.id })
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.profileSlug, slug));

  if (existing.length > 0) {
    const myProfile = await db
      .select({ id: teacherProfilesTable.id })
      .from(teacherProfilesTable)
      .where(eq(teacherProfilesTable.userId, userId));
    if (myProfile.length === 0 || existing[0].id !== myProfile[0].id) {
      res.status(409).json({ error: "This URL handle is already taken" });
      return;
    }
  }

  const [updated] = await db
    .update(teacherProfilesTable)
    .set({ profileSlug: slug, updatedAt: new Date() })
    .where(eq(teacherProfilesTable.userId, userId))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Teacher profile not found" });
    return;
  }

  const [result] = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(eq(teacherProfilesTable.userId, userId));

  res.json(GetMyTeacherProfileResponse.parse({ ...result!.teacher_profiles, user: result!.users }));
});

router.get("/teachers/me/last-minute", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [profile] = await db
    .select({
      lastMinuteAvailable: teacherProfilesTable.lastMinuteAvailable,
      lastMinuteFromDate: teacherProfilesTable.lastMinuteFromDate,
      lastMinuteToDate: teacherProfilesTable.lastMinuteToDate,
      minNoticeHours: teacherProfilesTable.minNoticeHours,
    })
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, userId));

  if (!profile) {
    res.status(404).json({ error: "Teacher profile not found" });
    return;
  }

  res.json({
    lastMinuteAvailable: profile.lastMinuteAvailable,
    lastMinuteFromDate: profile.lastMinuteFromDate?.toISOString() ?? null,
    lastMinuteToDate: profile.lastMinuteToDate?.toISOString() ?? null,
    minNoticeHours: profile.minNoticeHours,
  });
});

router.put("/teachers/me/last-minute", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const body = req.body as {
    lastMinuteAvailable?: unknown;
    lastMinuteFromDate?: unknown;
    lastMinuteToDate?: unknown;
    minNoticeHours?: unknown;
  };

  if (typeof body.lastMinuteAvailable !== "boolean") {
    res.status(400).json({ error: "lastMinuteAvailable (boolean) is required" });
    return;
  }

  const lastMinuteFromDate =
    typeof body.lastMinuteFromDate === "string" && body.lastMinuteFromDate
      ? new Date(body.lastMinuteFromDate)
      : null;
  const lastMinuteToDate =
    typeof body.lastMinuteToDate === "string" && body.lastMinuteToDate
      ? new Date(body.lastMinuteToDate)
      : null;

  if (lastMinuteFromDate && isNaN(lastMinuteFromDate.getTime())) {
    res.status(400).json({ error: "lastMinuteFromDate must be a valid date" });
    return;
  }
  if (lastMinuteToDate && isNaN(lastMinuteToDate.getTime())) {
    res.status(400).json({ error: "lastMinuteToDate must be a valid date" });
    return;
  }

  const minNoticeHours =
    typeof body.minNoticeHours === "number" && body.minNoticeHours > 0
      ? Math.round(body.minNoticeHours)
      : 72;

  const [updated] = await db
    .update(teacherProfilesTable)
    .set({
      lastMinuteAvailable: body.lastMinuteAvailable as boolean,
      lastMinuteFromDate,
      lastMinuteToDate,
      minNoticeHours,
      updatedAt: new Date(),
    })
    .where(eq(teacherProfilesTable.userId, userId))
    .returning({
      lastMinuteAvailable: teacherProfilesTable.lastMinuteAvailable,
      lastMinuteFromDate: teacherProfilesTable.lastMinuteFromDate,
      lastMinuteToDate: teacherProfilesTable.lastMinuteToDate,
      minNoticeHours: teacherProfilesTable.minNoticeHours,
    });

  if (!updated) {
    res.status(404).json({ error: "Teacher profile not found" });
    return;
  }

  res.json({
    lastMinuteAvailable: updated.lastMinuteAvailable,
    lastMinuteFromDate: updated.lastMinuteFromDate?.toISOString() ?? null,
    lastMinuteToDate: updated.lastMinuteToDate?.toISOString() ?? null,
    minNoticeHours: updated.minNoticeHours,
  });
});

router.get("/teachers/:userId", async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;

  const [result] = await db
    .select()
    .from(teacherProfilesTable)
    .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
    .where(eq(teacherProfilesTable.userId, rawId));

  if (!result) {
    res.status(404).json({ error: "Teacher not found" });
    return;
  }

  const proIds = await getProSubscriberIds([result.teacher_profiles.userId]);
  res.json(GetTeacherResponse.parse({ ...result.teacher_profiles, user: result.users, isProSubscriber: proIds.has(result.teacher_profiles.userId) }));
});

export default router;
