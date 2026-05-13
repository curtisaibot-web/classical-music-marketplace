import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or, inArray, count } from "drizzle-orm";
import { randomBytes } from "crypto";
import {
  db,
  ensemblesTable,
  ensembleMembersTable,
  payoutsTable,
  teacherProfilesTable,
  usersTable,
  bookingsTable,
  listingsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/email";

const SLUG_RE = /^[a-z0-9-]{3,80}$/;
const INVITE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

const router: IRouter = Router();

function buildAutoSlug(name: string, attempt = 0): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "ensemble";
  return attempt === 0 ? base : `${base}-${attempt}`;
}

async function generateUniqueEnsembleSlug(name: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = buildAutoSlug(name, attempt);
    const [existing] = await db
      .select({ id: ensemblesTable.id })
      .from(ensemblesTable)
      .where(eq(ensemblesTable.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  return `ensemble-${randomBytes(4).toString("hex")}`;
}

/** Strip fields that must never appear in any API response */
function stripSensitive<T extends Record<string, unknown>>(obj: T): Omit<T, "inviteToken"> {
  const { inviteToken: _token, ...safe } = obj as Record<string, unknown> & { inviteToken?: unknown };
  return safe as Omit<T, "inviteToken">;
}

/** Full enrichment for authenticated users (leader/members) — strips inviteToken */
async function formatEnsemble(ensembleId: number) {
  const [ensemble] = await db
    .select()
    .from(ensemblesTable)
    .where(eq(ensemblesTable.id, ensembleId));
  if (!ensemble) return null;

  const members = await db
    .select()
    .from(ensembleMembersTable)
    .where(eq(ensembleMembersTable.ensembleId, ensembleId));

  const userIds = members
    .map((m) => m.userId)
    .filter((id): id is string => id !== null);

  const users =
    userIds.length > 0
      ? await db
          .select({
            id: usersTable.id,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            imageUrl: usersTable.imageUrl,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds))
      : [];

  const profileRows =
    userIds.length > 0
      ? await db
          .select({
            userId: teacherProfilesTable.userId,
            profileImageUrl: teacherProfilesTable.profileImageUrl,
            instruments: teacherProfilesTable.instruments,
            city: teacherProfilesTable.city,
            profileSlug: teacherProfilesTable.profileSlug,
          })
          .from(teacherProfilesTable)
          .where(inArray(teacherProfilesTable.userId, userIds))
      : [];

  const listings = await db
    .select()
    .from(listingsTable)
    .where(
      and(
        eq(listingsTable.ensembleId, ensembleId),
        eq(listingsTable.status, "active"),
        eq(listingsTable.type, "event"),
      ),
    );

  const userMap = new Map(users.map((u) => [u.id, u]));
  const profileMap = new Map(profileRows.map((p) => [p.userId, p]));

  const enrichedMembers = members
    .filter((m) => m.status !== "removed")
    .map((m) => ({
      ...stripSensitive(m as Record<string, unknown> as (typeof m & Record<string, unknown>)),
      user: m.userId ? (userMap.get(m.userId) ?? null) : null,
      profile: m.userId ? (profileMap.get(m.userId) ?? null) : null,
    }));

  return { ...ensemble, members: enrichedMembers, listings };
}

/** Public-safe enrichment for unauthenticated browse/detail:
 *  - Only active members
 *  - inviteToken always stripped
 *  - inviteEmail masked (hidden from public) */
async function formatPublicEnsemble(ensembleId: number) {
  const [ensemble] = await db
    .select()
    .from(ensemblesTable)
    .where(eq(ensemblesTable.id, ensembleId));
  if (!ensemble) return null;

  const members = await db
    .select()
    .from(ensembleMembersTable)
    .where(
      and(
        eq(ensembleMembersTable.ensembleId, ensembleId),
        eq(ensembleMembersTable.status, "active"),
      ),
    );

  const userIds = members
    .map((m) => m.userId)
    .filter((id): id is string => id !== null);

  const users =
    userIds.length > 0
      ? await db
          .select({
            id: usersTable.id,
            firstName: usersTable.firstName,
            lastName: usersTable.lastName,
            imageUrl: usersTable.imageUrl,
          })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds))
      : [];

  const profileRows =
    userIds.length > 0
      ? await db
          .select({
            userId: teacherProfilesTable.userId,
            profileImageUrl: teacherProfilesTable.profileImageUrl,
            instruments: teacherProfilesTable.instruments,
            city: teacherProfilesTable.city,
            profileSlug: teacherProfilesTable.profileSlug,
          })
          .from(teacherProfilesTable)
          .where(inArray(teacherProfilesTable.userId, userIds))
      : [];

  const listings = await db
    .select()
    .from(listingsTable)
    .where(
      and(
        eq(listingsTable.ensembleId, ensembleId),
        eq(listingsTable.status, "active"),
        eq(listingsTable.type, "event"),
      ),
    );

  const userMap = new Map(users.map((u) => [u.id, u]));
  const profileMap = new Map(profileRows.map((p) => [p.userId, p]));

  const publicMembers = members.map((m) => ({
    id: m.id,
    ensembleId: m.ensembleId,
    userId: m.userId,
    splitPercent: m.splitPercent,
    status: m.status,
    joinedAt: m.joinedAt,
    user: m.userId ? (userMap.get(m.userId) ?? null) : null,
    profile: m.userId ? (profileMap.get(m.userId) ?? null) : null,
  }));

  return { ...ensemble, members: publicMembers, listings };
}

// ─── Public browse ────────────────────────────────────────────────────────────

router.get("/ensembles", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  // Separate count query so total reflects all matching rows, not just the page
  const [{ totalCount }] = await db
    .select({ totalCount: count() })
    .from(ensemblesTable)
    .where(eq(ensemblesTable.status, "active"));

  const rows = await db
    .select()
    .from(ensemblesTable)
    .where(eq(ensemblesTable.status, "active"))
    .limit(limit)
    .offset(offset);

  // Return enriched public data so the client type (EnsembleWithMembers[]) is satisfied
  const enriched = await Promise.all(rows.map((r) => formatPublicEnsemble(r.id)));
  const valid = enriched.filter((e) => e !== null);
  res.json({ ensembles: valid, total: totalCount });
});

// ─── Authenticated: my ensembles ──────────────────────────────────────────────

router.get("/ensembles/mine", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const ledRows = await db
    .select({ id: ensemblesTable.id })
    .from(ensemblesTable)
    .where(eq(ensemblesTable.leaderId, userId));

  const memberRows = await db
    .select({ ensembleId: ensembleMembersTable.ensembleId })
    .from(ensembleMembersTable)
    .where(
      and(
        eq(ensembleMembersTable.userId, userId),
        or(
          eq(ensembleMembersTable.status, "active"),
          eq(ensembleMembersTable.status, "invited"),
        ),
      ),
    );

  const allIds = [
    ...new Set([
      ...ledRows.map((r) => r.id),
      ...memberRows.map((r) => r.ensembleId),
    ]),
  ];

  if (allIds.length === 0) {
    res.json({ ensembles: [], total: 0 });
    return;
  }

  // Authenticated: use full enrichment (includes invited members + emails)
  const enriched = await Promise.all(allIds.map(formatEnsemble));
  const valid = enriched.filter((e) => e !== null);
  res.json({ ensembles: valid, total: valid.length });
});

// ─── Public: ensemble detail by slug ─────────────────────────────────────────

// Helper: authz-checked ensemble fetch by numeric ID
async function getEnsembleByIdAuthed(
  req: import("express").Request,
  res: import("express").Response,
): Promise<void> {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ensemble id" }); return; }

  const [ensemble] = await db.select().from(ensemblesTable).where(eq(ensemblesTable.id, id));
  if (!ensemble) { res.status(404).json({ error: "Ensemble not found" }); return; }

  const isLeader = ensemble.leaderId === userId;
  if (!isLeader) {
    const [memberRow] = await db
      .select({ id: ensembleMembersTable.id })
      .from(ensembleMembersTable)
      .where(
        and(
          eq(ensembleMembersTable.ensembleId, id),
          eq(ensembleMembersTable.userId, userId),
          or(
            eq(ensembleMembersTable.status, "active"),
            eq(ensembleMembersTable.status, "invited"),
          ),
        ),
      );
    if (!memberRow) {
      res.status(403).json({ error: "Only ensemble members can access this resource" });
      return;
    }
  }

  const enriched = await formatEnsemble(id);
  if (!enriched) { res.status(404).json({ error: "Ensemble not found" }); return; }
  res.json(enriched);
}

// GET /ensembles/:id — canonical numeric ID route (registered before :slug catch-all)
// Uses a middleware guard to only handle purely numeric IDs; falls through to :slug otherwise.
router.get(
  "/ensembles/:id",
  (req, res, next) => {
    if (/^\d+$/.test(req.params["id"] as string)) return next();
    next("route");
  },
  requireAuth,
  getEnsembleByIdAuthed,
);

// GET /ensembles/by-id/:id — legacy alias for the same endpoint
router.get("/ensembles/by-id/:id", requireAuth, getEnsembleByIdAuthed);

router.get("/ensembles/:slug", async (req, res): Promise<void> => {
  const slug = req.params["slug"] as string;

  const [ensemble] = await db
    .select()
    .from(ensemblesTable)
    .where(eq(ensemblesTable.slug, slug));

  if (!ensemble) {
    res.status(404).json({ error: "Ensemble not found" });
    return;
  }

  const enriched = await formatPublicEnsemble(ensemble.id);
  res.json(enriched);
});

// ─── Create ensemble ──────────────────────────────────────────────────────────

router.post("/ensembles", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [profile] = await db
    .select()
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, userId));

  if (!profile) {
    res.status(403).json({ error: "Only teachers can create ensembles" });
    return;
  }

  const body = req.body as {
    name?: unknown;
    bio?: unknown;
    photoUrl?: unknown;
    city?: unknown;
    genres?: unknown;
    instruments?: unknown;
    recordings?: unknown;
    priceInCents?: unknown;
    slug?: unknown;
  };

  if (typeof body.name !== "string" || !body.name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }

  const name = body.name.trim();
  let slug: string;

  if (typeof body.slug === "string" && body.slug.trim()) {
    const candidate = body.slug.trim().toLowerCase();
    if (!SLUG_RE.test(candidate)) {
      res.status(400).json({ error: "slug must be 3–80 chars, lowercase letters, numbers and hyphens only" });
      return;
    }
    const [existing] = await db
      .select({ id: ensemblesTable.id })
      .from(ensemblesTable)
      .where(eq(ensemblesTable.slug, candidate));
    if (existing) {
      res.status(409).json({ error: "This slug is already taken" });
      return;
    }
    slug = candidate;
  } else {
    slug = await generateUniqueEnsembleSlug(name);
  }

  const [ensemble] = await db
    .insert(ensemblesTable)
    .values({
      name,
      slug,
      bio: typeof body.bio === "string" ? body.bio : null,
      photoUrl: typeof body.photoUrl === "string" ? body.photoUrl : null,
      leaderId: userId,
      city: typeof body.city === "string" ? body.city : null,
      genres: Array.isArray(body.genres) ? body.genres.filter((g): g is string => typeof g === "string") : [],
      instruments: Array.isArray(body.instruments) ? body.instruments.filter((i): i is string => typeof i === "string") : [],
      recordings: Array.isArray(body.recordings) ? body.recordings.filter((r): r is string => typeof r === "string") : [],
      priceInCents: typeof body.priceInCents === "number" ? body.priceInCents : null,
      status: "pending",
    })
    .returning();

  const [leaderUser] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  // Leader starts at 100% — rebalanced as members join
  await db.insert(ensembleMembersTable).values({
    ensembleId: ensemble.id,
    userId,
    inviteEmail: leaderUser?.email ?? "",
    splitPercent: 100,
    status: "active",
    joinedAt: new Date(),
  });

  const enriched = await formatEnsemble(ensemble.id);
  res.status(201).json(enriched);
});

// ─── Update ensemble ──────────────────────────────────────────────────────────

// Canonical PUT /ensembles/:id — alias for backward compat with /ensembles/:id/update
router.put("/ensembles/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid ensemble id" }); return; }
  const [ensemble] = await db.select().from(ensemblesTable).where(eq(ensemblesTable.id, id));
  if (!ensemble) { res.status(404).json({ error: "Ensemble not found" }); return; }
  if (ensemble.leaderId !== userId) { res.status(403).json({ error: "Only the ensemble leader can update the ensemble" }); return; }
  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof ensemblesTable.$inferInsert> = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.bio === "string") updates.bio = body.bio;
  if (typeof body.photoUrl === "string") updates.photoUrl = body.photoUrl;
  if (typeof body.city === "string") updates.city = body.city;
  if (typeof body.priceInCents === "number") updates.priceInCents = body.priceInCents;
  if (Array.isArray(body.genres)) updates.genres = body.genres.filter((g): g is string => typeof g === "string");
  if (Array.isArray(body.instruments)) updates.instruments = body.instruments.filter((i): i is string => typeof i === "string");
  if (Array.isArray(body.recordings)) updates.recordings = body.recordings.filter((r): r is string => typeof r === "string");
  if (typeof body.status === "string" && ["pending", "active", "archived"].includes(body.status)) {
    updates.status = body.status as "pending" | "active" | "archived";
  }
  await db.update(ensemblesTable).set(updates).where(eq(ensemblesTable.id, id));
  const enriched = await formatEnsemble(id);
  res.json(enriched);
});

router.put("/ensembles/:id/update", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ensemble id" });
    return;
  }

  const [ensemble] = await db
    .select()
    .from(ensemblesTable)
    .where(eq(ensemblesTable.id, id));

  if (!ensemble) {
    res.status(404).json({ error: "Ensemble not found" });
    return;
  }

  if (ensemble.leaderId !== userId) {
    res.status(403).json({ error: "Only the ensemble leader can update the ensemble" });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const updates: Partial<typeof ensemblesTable.$inferInsert> = {};
  if (typeof body.name === "string") updates.name = body.name;
  if (typeof body.bio === "string") updates.bio = body.bio;
  if (typeof body.photoUrl === "string") updates.photoUrl = body.photoUrl;
  if (typeof body.city === "string") updates.city = body.city;
  if (typeof body.priceInCents === "number") updates.priceInCents = body.priceInCents;
  if (Array.isArray(body.genres)) updates.genres = body.genres.filter((g): g is string => typeof g === "string");
  if (Array.isArray(body.instruments)) updates.instruments = body.instruments.filter((i): i is string => typeof i === "string");
  if (Array.isArray(body.recordings)) updates.recordings = body.recordings.filter((r): r is string => typeof r === "string");
  if (typeof body.status === "string" && ["pending", "active", "archived"].includes(body.status)) {
    updates.status = body.status as "pending" | "active" | "archived";
  }

  await db.update(ensemblesTable).set(updates).where(eq(ensemblesTable.id, id));

  const enriched = await formatEnsemble(id);
  res.json(enriched);
});

// ─── Associate an event listing with this ensemble ────────────────────────────

router.put("/ensembles/:id/listings/:listingId", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params["id"] as string, 10);
  const listingId = parseInt(req.params["listingId"] as string, 10);

  if (isNaN(id) || isNaN(listingId)) {
    res.status(400).json({ error: "Invalid ensemble or listing id" });
    return;
  }

  const [ensemble] = await db
    .select()
    .from(ensemblesTable)
    .where(eq(ensemblesTable.id, id));

  if (!ensemble) {
    res.status(404).json({ error: "Ensemble not found" });
    return;
  }
  if (ensemble.leaderId !== userId) {
    res.status(403).json({ error: "Only the ensemble leader can link listings" });
    return;
  }

  const [listing] = await db
    .select()
    .from(listingsTable)
    .where(and(eq(listingsTable.id, listingId), eq(listingsTable.teacherId, userId)));

  if (!listing) {
    res.status(404).json({ error: "Listing not found or does not belong to you" });
    return;
  }
  if (listing.type !== "event") {
    res.status(400).json({ error: "Only event listings can be linked to an ensemble" });
    return;
  }

  await db
    .update(listingsTable)
    .set({ ensembleId: id })
    .where(eq(listingsTable.id, listingId));

  res.json({ ok: true, listingId, ensembleId: id });
});

/** Detach a listing from this ensemble */
router.delete("/ensembles/:id/listings/:listingId", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params["id"] as string, 10);
  const listingId = parseInt(req.params["listingId"] as string, 10);

  if (isNaN(id) || isNaN(listingId)) {
    res.status(400).json({ error: "Invalid ids" });
    return;
  }

  const [ensemble] = await db.select().from(ensemblesTable).where(eq(ensemblesTable.id, id));
  if (!ensemble || ensemble.leaderId !== userId) {
    res.status(403).json({ error: "Not authorized" });
    return;
  }

  await db
    .update(listingsTable)
    .set({ ensembleId: null })
    .where(and(eq(listingsTable.id, listingId), eq(listingsTable.teacherId, userId)));

  res.status(204).send();
});

// ─── Invite member ────────────────────────────────────────────────────────────

router.post("/ensembles/:id/invite", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ensemble id" });
    return;
  }

  const [ensemble] = await db
    .select()
    .from(ensemblesTable)
    .where(eq(ensemblesTable.id, id));

  if (!ensemble) {
    res.status(404).json({ error: "Ensemble not found" });
    return;
  }
  if (ensemble.leaderId !== userId) {
    res.status(403).json({ error: "Only the ensemble leader can invite members" });
    return;
  }

  const { email, splitPercent } = req.body as { email?: unknown; splitPercent?: unknown };

  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email address is required" });
    return;
  }

  const normalizedEmail = email.toLowerCase().trim();

  const existingRows = await db
    .select()
    .from(ensembleMembersTable)
    .where(and(eq(ensembleMembersTable.ensembleId, id), eq(ensembleMembersTable.inviteEmail, normalizedEmail)));

  const existingActive = existingRows.find((r) => r.status !== "removed");
  if (existingActive) {
    res.status(400).json({ error: "This email has already been invited or is already a member" });
    return;
  }

  // Check if there is a removed row for this email — we'll reactivate it instead of inserting
  const existingRemovedRow = existingRows.find((r) => r.status === "removed") ?? null;

  // ── Validate invitee BEFORE touching any splits ────────────────────────────
  const [inviteeUser] = await db
    .select({ id: usersTable.id, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  if (!inviteeUser) {
    res.status(400).json({
      error: "No Harmonia account found for this email address. The invitee must sign up as a teacher first.",
    });
    return;
  }

  const [inviteeProfile] = await db
    .select({ userId: teacherProfilesTable.userId })
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, inviteeUser.id));

  if (!inviteeProfile) {
    res.status(400).json({
      error: "The invited user does not have a Harmonia teacher profile. Only teachers can be ensemble members.",
    });
    return;
  }

  // ── Load current active members and calculate splits ──────────────────────
  const currentMembers = await db
    .select({
      id: ensembleMembersTable.id,
      userId: ensembleMembersTable.userId,
      splitPercent: ensembleMembersTable.splitPercent,
    })
    .from(ensembleMembersTable)
    .where(and(eq(ensembleMembersTable.ensembleId, id), eq(ensembleMembersTable.status, "active")));

  const totalMembersAfterInvite = currentMembers.length + 1;
  let splitPct: number;
  let rebalancedMembers: Array<{ id: number; newSplit: number }> = [];

  if (typeof splitPercent === "number" && splitPercent > 0) {
    const rounded = Math.round(splitPercent);
    if (rounded < 1 || rounded > 100) {
      res.status(400).json({ error: "splitPercent must be between 1 and 100" });
      return;
    }
    const currentTotal = currentMembers.reduce((sum, m) => sum + m.splitPercent, 0);
    if (currentTotal + rounded > 100) {
      res.status(400).json({
        error: `Cannot add ${rounded}% — current active members already hold ${currentTotal}%. Total would exceed 100%.`,
      });
      return;
    }
    // Reject if total would be less than 100 — all funds must be allocated
    if (currentTotal + rounded < 100) {
      res.status(400).json({
        error: `Split total would be ${currentTotal + rounded}% — all 100% of revenue must be allocated across members.`,
      });
      return;
    }
    splitPct = rounded;
  } else {
    // Equal split across all members: floor per member, leader absorbs remainder
    const perMember = Math.floor(100 / totalMembersAfterInvite);
    const leaderShare = 100 - perMember * (totalMembersAfterInvite - 1);
    rebalancedMembers = currentMembers.map((m) => ({
      id: m.id,
      newSplit: m.userId === ensemble.leaderId ? leaderShare : perMember,
    }));
    splitPct = perMember; // new invitee's share
  }

  // 256-bit random invite token — secure, single-use, bound by email + expiry on accept
  const inviteToken = randomBytes(32).toString("hex");

  // ── Upsert member and rebalance splits atomically ─────────────────────────
  // If a removed row exists for this email, reactivate it (avoids unique-index violation).
  const [member] = await db.transaction(async (tx) => {
    let upserted;
    if (existingRemovedRow) {
      // Reactivate the removed row — preserves the unique (ensemble_id, invite_email) constraint
      upserted = await tx
        .update(ensembleMembersTable)
        .set({
          userId: inviteeUser.id,
          splitPercent: splitPct,
          status: "invited",
          inviteToken,
          invitedAt: new Date(),
          joinedAt: null,
        })
        .where(eq(ensembleMembersTable.id, existingRemovedRow.id))
        .returning();
    } else {
      upserted = await tx
        .insert(ensembleMembersTable)
        .values({
          ensembleId: id,
          userId: inviteeUser.id,
          inviteEmail: normalizedEmail,
          splitPercent: splitPct,
          status: "invited",
          inviteToken,
          invitedAt: new Date(),
        })
        .returning();
    }

    // Only rebalance existing members if upsert succeeded
    for (const m of rebalancedMembers) {
      await tx
        .update(ensembleMembersTable)
        .set({ splitPercent: m.newSplit })
        .where(eq(ensembleMembersTable.id, m.id));
    }

    return upserted;
  });

  const BASE = process.env.APP_URL ?? "https://app.harmonia.music";
  const acceptLink = `${BASE}/ensembles/${ensemble.slug}/accept?token=${inviteToken}`;

  // Send invite email via configured SMTP; falls back to log if unconfigured
  const emailResult = await sendEmail({
    to: normalizedEmail,
    subject: `You've been invited to join "${ensemble.name}" on Harmonia`,
    html: `
      <div style="font-family:sans-serif;max-width:560px;margin:0 auto">
        <h2 style="color:#1a1a1a">Ensemble invitation</h2>
        <p>You've been invited to join <strong>${ensemble.name}</strong> as a member on Harmonia.</p>
        <p>Your revenue share: <strong>${splitPct}%</strong></p>
        <p style="margin-top:24px">
          <a href="${acceptLink}"
             style="background:#b45309;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:600">
            Accept Invitation
          </a>
        </p>
        <p style="color:#666;font-size:13px;margin-top:24px">
          This link expires in 7 days. If you were not expecting this invitation, you can ignore this email.
        </p>
      </div>
    `,
  });

  logger.info(
    { ensembleId: id, inviteEmail: normalizedEmail, memberId: member.id, emailSent: emailResult.sent },
    `[INVITE] Ensemble "${ensemble.name}" invitation for ${normalizedEmail} — email sent: ${emailResult.sent}`,
  );

  // Return member without the token — client doesn't need it
  res.status(201).json(stripSensitive(member as Record<string, unknown> as (typeof member & Record<string, unknown>)));
});

// ─── Accept invite ────────────────────────────────────────────────────────────

router.post("/ensembles/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ensemble id" });
    return;
  }

  const { token } = req.body as { token?: unknown };
  if (typeof token !== "string" || !token) {
    res.status(400).json({ error: "token is required" });
    return;
  }

  const [member] = await db
    .select()
    .from(ensembleMembersTable)
    .where(
      and(
        eq(ensembleMembersTable.ensembleId, id),
        eq(ensembleMembersTable.inviteToken, token),
      ),
    );

  if (!member) {
    res.status(400).json({ error: "Invalid or expired invite token" });
    return;
  }

  if (member.status !== "invited") {
    res.status(400).json({ error: "This invitation has already been used or is no longer valid" });
    return;
  }

  // Enforce 7-day expiry
  if (Date.now() - new Date(member.invitedAt).getTime() > INVITE_EXPIRY_MS) {
    res.status(400).json({ error: "This invitation has expired. Please ask the ensemble leader to send a new one." });
    return;
  }

  // Security: verify the authenticated user's email matches the invited email
  const [authUser] = await db
    .select({ email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  if (!authUser || authUser.email.toLowerCase() !== member.inviteEmail.toLowerCase()) {
    res.status(403).json({
      error: "This invitation was sent to a different email address. Please sign in with the invited account.",
    });
    return;
  }

  const [updated] = await db
    .update(ensembleMembersTable)
    .set({
      status: "active",
      userId,
      inviteToken: null,
      joinedAt: new Date(),
    })
    .where(eq(ensembleMembersTable.id, member.id))
    .returning();

  // Promote ensemble to active if all outstanding invites resolved
  const allMembers = await db
    .select()
    .from(ensembleMembersTable)
    .where(eq(ensembleMembersTable.ensembleId, id));

  const allResolved = allMembers.every((m) => m.status === "active" || m.status === "removed");
  const activeMemberCount = allMembers.filter((m) => m.status === "active").length;

  if (allResolved && activeMemberCount > 1) {
    await db
      .update(ensemblesTable)
      .set({ status: "active" })
      .where(and(eq(ensemblesTable.id, id), eq(ensemblesTable.status, "pending")));
  }

  res.json(stripSensitive(updated as Record<string, unknown> as (typeof updated & Record<string, unknown>)));
});

// ─── Remove member ────────────────────────────────────────────────────────────

router.delete(
  "/ensembles/:id/members/:memberId",
  requireAuth,
  async (req, res): Promise<void> => {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const id = parseInt(req.params["id"] as string, 10);
    const memberUserId = req.params["memberId"] as string;

    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid ensemble id" });
      return;
    }

    const [ensemble] = await db
      .select()
      .from(ensemblesTable)
      .where(eq(ensemblesTable.id, id));

    if (!ensemble) {
      res.status(404).json({ error: "Ensemble not found" });
      return;
    }
    if (ensemble.leaderId !== userId) {
      res.status(403).json({ error: "Only the ensemble leader can remove members" });
      return;
    }
    if (memberUserId === userId) {
      res.status(400).json({ error: "The leader cannot remove themselves" });
      return;
    }

    const [member] = await db
      .select()
      .from(ensembleMembersTable)
      .where(
        and(
          eq(ensembleMembersTable.ensembleId, id),
          eq(ensembleMembersTable.userId, memberUserId),
        ),
      );

    if (!member || member.status === "removed") {
      res.status(404).json({ error: "Member not found" });
      return;
    }

    // Remove the member and auto-rebalance remaining active/invited splits to sum to 100.
    // Leader absorbs any remainder to keep total exact (same strategy as equal-split invite).
    await db.transaction(async (tx) => {
      await tx
        .update(ensembleMembersTable)
        .set({ status: "removed", splitPercent: 0 })
        .where(eq(ensembleMembersTable.id, member.id));

      const remaining = await tx
        .select({ id: ensembleMembersTable.id, userId: ensembleMembersTable.userId, splitPercent: ensembleMembersTable.splitPercent })
        .from(ensembleMembersTable)
        .where(
          and(
            eq(ensembleMembersTable.ensembleId, id),
            or(
              eq(ensembleMembersTable.status, "active"),
              eq(ensembleMembersTable.status, "invited"),
            ),
          ),
        );

      if (remaining.length > 0) {
        const perMember = Math.floor(100 / remaining.length);
        const leaderRemainder = 100 - perMember * remaining.length;
        const leaderRow = remaining.find((m) => m.userId === ensemble.leaderId) ?? remaining[0];

        for (const m of remaining) {
          const newSplit = m.id === leaderRow.id ? perMember + leaderRemainder : perMember;
          await tx
            .update(ensembleMembersTable)
            .set({ splitPercent: newSplit })
            .where(eq(ensembleMembersTable.id, m.id));
        }
      }
    });

    res.status(204).send();
  },
);

// ─── Update splits ────────────────────────────────────────────────────────────

router.put("/ensembles/:id/splits", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ensemble id" });
    return;
  }

  const [ensemble] = await db.select().from(ensemblesTable).where(eq(ensemblesTable.id, id));
  if (!ensemble) {
    res.status(404).json({ error: "Ensemble not found" });
    return;
  }
  if (ensemble.leaderId !== userId) {
    res.status(403).json({ error: "Only the ensemble leader can update split percentages" });
    return;
  }

  const { splits } = req.body as { splits?: unknown };
  if (!Array.isArray(splits)) {
    res.status(400).json({ error: "splits must be an array of { memberId, splitPercent }" });
    return;
  }

  type SplitEntry = { memberId: unknown; splitPercent: unknown };
  const typedSplits = splits as SplitEntry[];

  // Validate: each entry must have valid types
  if (typedSplits.some((s) => typeof s.memberId !== "number" || typeof s.splitPercent !== "number")) {
    res.status(400).json({ error: "Each split entry must have numeric memberId and splitPercent" });
    return;
  }

  // Round each value first so the sum check and persistence use the same values — no post-validation drift
  const roundedSplits = typedSplits.map((s) => ({
    memberId: s.memberId as number,
    splitPercent: Math.round(s.splitPercent as number),
  }));

  // Per-entry bounds: each rounded value must be between 0 and 100 inclusive
  const outOfRange = roundedSplits.find((s) => s.splitPercent < 0 || s.splitPercent > 100);
  if (outOfRange) {
    res.status(400).json({
      error: `Each member's splitPercent must be between 0 and 100 (got ${outOfRange.splitPercent} for memberId ${outOfRange.memberId})`,
    });
    return;
  }

  // Sum must be exactly 100 after rounding — checked on rounded values to prevent drift
  const total = roundedSplits.reduce((sum, s) => sum + s.splitPercent, 0);
  if (total !== 100) {
    res.status(400).json({ error: `Split percentages must sum to 100 after rounding (got ${total})` });
    return;
  }

  // Fetch all active+invited members and verify the submitted splits cover all of them
  const activeMembers = await db
    .select({ id: ensembleMembersTable.id })
    .from(ensembleMembersTable)
    .where(
      and(
        eq(ensembleMembersTable.ensembleId, id),
        or(
          eq(ensembleMembersTable.status, "active"),
          eq(ensembleMembersTable.status, "invited"),
        ),
      ),
    );

  const submittedIds = new Set(typedSplits.map((s) => s.memberId as number));
  const missingMembers = activeMembers.filter((m) => !submittedIds.has(m.id));
  if (missingMembers.length > 0) {
    res.status(400).json({
      error: `Submitted splits do not cover all active/invited members. Missing member IDs: ${missingMembers.map((m) => m.id).join(", ")}`,
    });
    return;
  }

  // Apply updates — using pre-rounded values, only for members that actually belong to this ensemble
  for (const split of roundedSplits) {
    await db
      .update(ensembleMembersTable)
      .set({ splitPercent: split.splitPercent })
      .where(
        and(
          eq(ensembleMembersTable.id, split.memberId),
          eq(ensembleMembersTable.ensembleId, id),
          or(
            eq(ensembleMembersTable.status, "active"),
            eq(ensembleMembersTable.status, "invited"),
          ),
        ),
      );
  }

  const enriched = await formatEnsemble(id);
  res.json(enriched);
});

// ─── List ensemble bookings (accessible to all active members) ────────────────

router.get("/ensembles/:id/bookings", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ensemble id" });
    return;
  }

  const [ensemble] = await db.select().from(ensemblesTable).where(eq(ensemblesTable.id, id));
  if (!ensemble) {
    res.status(404).json({ error: "Ensemble not found" });
    return;
  }

  // Allow leader or any active member
  const isLeader = ensemble.leaderId === userId;
  if (!isLeader) {
    const [memberRow] = await db
      .select({ id: ensembleMembersTable.id })
      .from(ensembleMembersTable)
      .where(
        and(
          eq(ensembleMembersTable.ensembleId, id),
          eq(ensembleMembersTable.userId, userId),
          eq(ensembleMembersTable.status, "active"),
        ),
      );
    if (!memberRow) {
      res.status(403).json({ error: "Only active ensemble members can view ensemble bookings" });
      return;
    }
  }

  const bookings = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.ensembleId, id))
    .orderBy(bookingsTable.createdAt);

  res.json({ bookings, total: bookings.length });
});

// ─── List payouts ─────────────────────────────────────────────────────────────

router.get("/ensembles/:id/payouts", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params["id"] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ensemble id" });
    return;
  }

  const [ensemble] = await db.select().from(ensemblesTable).where(eq(ensemblesTable.id, id));
  if (!ensemble) {
    res.status(404).json({ error: "Ensemble not found" });
    return;
  }

  const isLeader = ensemble.leaderId === userId;
  const [memberRow] = await db
    .select()
    .from(ensembleMembersTable)
    .where(
      and(
        eq(ensembleMembersTable.ensembleId, id),
        eq(ensembleMembersTable.userId, userId),
        eq(ensembleMembersTable.status, "active"),
      ),
    );

  if (!isLeader && !memberRow) {
    res.status(403).json({ error: "Only ensemble members can view payouts" });
    return;
  }

  // Leader sees all member payouts; non-leader members see only their own rows
  const payouts = isLeader
    ? await db.select().from(payoutsTable).where(eq(payoutsTable.ensembleId, id))
    : await db
        .select()
        .from(payoutsTable)
        .where(and(eq(payoutsTable.ensembleId, id), eq(payoutsTable.memberId, userId)));
  res.json({ payouts });
});

// ─── Revenue split processor (called by webhook handler) ─────────────────────

export async function processEnsembleRevenueSplit(
  bookingId: number,
  ensembleId: number,
  stripeTransfer?: (accountId: string, amountCents: number, bookingId: number, idempotencyKey: string) => Promise<string | null>,
): Promise<void> {
  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(eq(bookingsTable.id, bookingId));

  if (!booking) {
    logger.warn({ bookingId }, "processEnsembleRevenueSplit: booking not found");
    return;
  }

  const activeMembers = await db
    .select()
    .from(ensembleMembersTable)
    .where(
      and(
        eq(ensembleMembersTable.ensembleId, ensembleId),
        eq(ensembleMembersTable.status, "active"),
      ),
    );

  if (activeMembers.length === 0) {
    logger.warn({ bookingId, ensembleId }, "processEnsembleRevenueSplit: no active members");
    return;
  }

  // Hard guard: active member splits must sum to exactly 100 before any transfer is issued.
  // Any divergence (e.g. due to a removed member whose share was never redistributed) is a
  // configuration error — we abort rather than overpay or underpay.
  const totalConfiguredSplit = activeMembers.reduce((sum, m) => sum + m.splitPercent, 0);
  if (totalConfiguredSplit === 0) {
    logger.warn({ bookingId, ensembleId }, "processEnsembleRevenueSplit: total split is 0 — aborting");
    return;
  }
  if (totalConfiguredSplit !== 100) {
    logger.error(
      { bookingId, ensembleId, totalConfiguredSplit },
      "processEnsembleRevenueSplit: active member splits do not sum to 100 — aborting to prevent financial inconsistency",
    );
    return;
  }

  // Load existing payouts for this booking to drive per-member idempotency.
  // Policy: skip members with status="completed" (transfer already sent).
  //         retry members with status="failed" or "pending" (transfer not sent or failed).
  // The unique constraint on (booking_id, member_id) prevents double-insert races;
  // we use onConflictDoNothing as a safety net for concurrent webhook deliveries.
  const existingPayouts = await db
    .select({ id: payoutsTable.id, memberId: payoutsTable.memberId, status: payoutsTable.status })
    .from(payoutsTable)
    .where(eq(payoutsTable.bookingId, bookingId));

  const successfulMemberIds = new Set(
    existingPayouts.filter((p) => p.status === "completed").map((p) => p.memberId),
  );
  const retryableMemberIds = new Set(
    existingPayouts.filter((p) => p.status !== "completed").map((p) => p.memberId),
  );

  if (successfulMemberIds.size > 0 || retryableMemberIds.size > 0) {
    logger.info(
      { bookingId, ensembleId, completed: successfulMemberIds.size, retrying: retryableMemberIds.size, total: activeMembers.length },
      "processEnsembleRevenueSplit: resuming — skipping completed, retrying failed/pending",
    );
  }

  for (const member of activeMembers) {
    if (!member.userId) continue;

    // Skip members whose payout already completed successfully
    if (successfulMemberIds.has(member.userId)) {
      logger.info({ bookingId, memberId: member.userId }, "processEnsembleRevenueSplit: payout completed — skipping");
      continue;
    }

    // Payout amount = splitPercent / 100 of net booking amount (gross - platform fee).
    // This honours the configured percentage directly — not normalised by totalConfiguredSplit.
    const memberNetAmountCents = Math.round(
      (booking.priceInCents - booking.platformFeeInCents) * (member.splitPercent / 100),
    );
    const memberGrossAmountCents = Math.round(booking.priceInCents * (member.splitPercent / 100));
    const memberPlatformFeePortionCents = memberGrossAmountCents - memberNetAmountCents;

    let stripeTransferId: string | null = null;
    let payoutStatus: "pending" | "completed" | "failed" = "pending";

    if (stripeTransfer && memberNetAmountCents > 0) {
      const [teacherProfile] = await db
        .select({
          stripeAccountId: teacherProfilesTable.stripeAccountId,
          stripeOnboarded: teacherProfilesTable.stripeOnboarded,
        })
        .from(teacherProfilesTable)
        .where(eq(teacherProfilesTable.userId, member.userId));

      if (teacherProfile?.stripeAccountId && teacherProfile.stripeOnboarded) {
        // Deterministic idempotency key: prevents duplicate Stripe transfers on
        // concurrent/duplicate webhook deliveries for the same booking + member pair.
        const idempotencyKey = `ensemble-payout-${bookingId}-${member.userId}`;
        try {
          stripeTransferId = await stripeTransfer(
            teacherProfile.stripeAccountId,
            memberNetAmountCents,
            bookingId,
            idempotencyKey,
          );
          payoutStatus = stripeTransferId ? "completed" : "pending";
        } catch (err) {
          logger.error({ err, bookingId, memberId: member.userId }, "Stripe transfer failed for ensemble member");
          payoutStatus = "failed";
        }
      }
    }

    const grossAmountCents = memberGrossAmountCents;
    const platformFeePortionCents = memberPlatformFeePortionCents;
    const netAmountCents = memberNetAmountCents;

    if (retryableMemberIds.has(member.userId)) {
      // Update the existing failed/pending row rather than inserting a duplicate
      await db
        .update(payoutsTable)
        .set({ stripeTransferId, status: payoutStatus })
        .where(and(eq(payoutsTable.bookingId, bookingId), eq(payoutsTable.memberId, member.userId)));
    } else {
      // First-time insert; onConflictDoNothing guards against concurrent webhook deliveries.
      // The unique constraint on (booking_id, member_id) is the hard idempotency guard;
      // this call is a no-op if a concurrent webhook already inserted the row.
      await db
        .insert(payoutsTable)
        .values({
          bookingId,
          ensembleId,
          memberId: member.userId,
          splitPercent: member.splitPercent,
          grossAmountCents,
          platformFeePortionCents,
          netAmountCents,
          stripeTransferId,
          status: payoutStatus,
        })
        .onConflictDoNothing();
    }

    logger.info(
      { bookingId, ensembleId, memberId: member.userId, netAmountCents, splitPercent: member.splitPercent, payoutStatus },
      "Ensemble payout record upserted",
    );
  }
}

export default router;
