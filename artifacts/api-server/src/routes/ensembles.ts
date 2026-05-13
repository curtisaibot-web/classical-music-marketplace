import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or, inArray } from "drizzle-orm";
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

  // Fetch active event listings linked to this ensemble
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
      ...m,
      user: m.userId ? (userMap.get(m.userId) ?? null) : null,
      profile: m.userId ? (profileMap.get(m.userId) ?? null) : null,
    }));

  return { ...ensemble, members: enrichedMembers, listings };
}

router.get("/ensembles", async (req, res): Promise<void> => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  const offset = Number(req.query.offset) || 0;

  const rows = await db
    .select()
    .from(ensemblesTable)
    .where(eq(ensemblesTable.status, "active"))
    .limit(limit)
    .offset(offset);

  res.json({ ensembles: rows, total: rows.length });
});

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

  // Return enriched ensembles with members so the dashboard can show splits
  const enriched = await Promise.all(allIds.map(formatEnsemble));
  const valid = enriched.filter((e) => e !== null);
  res.json({ ensembles: valid, total: valid.length });
});

router.get("/ensembles/:slug", async (req, res): Promise<void> => {
  const slug = req.params.slug;

  const [ensemble] = await db
    .select()
    .from(ensemblesTable)
    .where(eq(ensemblesTable.slug, slug));

  if (!ensemble) {
    res.status(404).json({ error: "Ensemble not found" });
    return;
  }

  const enriched = await formatEnsemble(ensemble.id);
  res.json(enriched);
});

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

  // Leader starts with 100% split — gets rebalanced as members are added
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

router.put("/ensembles/:id/update", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
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

router.post("/ensembles/:id/invite", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
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

  // Load current active members to compute equal split if none specified
  const currentMembers = await db
    .select({ id: ensembleMembersTable.id, splitPercent: ensembleMembersTable.splitPercent })
    .from(ensembleMembersTable)
    .where(and(eq(ensembleMembersTable.ensembleId, id), eq(ensembleMembersTable.status, "active")));

  const totalMembersAfterInvite = currentMembers.length + 1;
  let splitPct: number;

  if (typeof splitPercent === "number" && splitPercent > 0) {
    splitPct = Math.round(splitPercent);
  } else {
    // Default: equal split across all members (floor, leader absorbs remainder)
    splitPct = Math.floor(100 / totalMembersAfterInvite);
    const leaderMember = currentMembers.find((m) => m.id === currentMembers[0]?.id);
    if (leaderMember) {
      const sumOthers = splitPct * (currentMembers.length - 1);
      const leaderShare = 100 - sumOthers - splitPct;
      await db
        .update(ensembleMembersTable)
        .set({ splitPercent: leaderShare })
        .where(eq(ensembleMembersTable.id, leaderMember.id));
    }
  }

  const [inviteeUser] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, normalizedEmail));

  const inviteToken = randomBytes(24).toString("hex");

  const [member] = await db
    .insert(ensembleMembersTable)
    .values({
      ensembleId: id,
      userId: inviteeUser?.id ?? null,
      inviteEmail: normalizedEmail,
      splitPercent: splitPct,
      status: "invited",
      inviteToken,
      invitedAt: new Date(),
    })
    .returning();

  const BASE = process.env.APP_URL ?? "https://app.harmonia.music";
  const acceptLink = `${BASE}/ensembles/${ensemble.slug}/accept?token=${inviteToken}`;
  logger.info(
    { ensembleId: id, inviteEmail: normalizedEmail, memberId: member.id },
    `[INVITE] Ensemble "${ensemble.name}" invite for ${normalizedEmail} — accept link: ${acceptLink}`,
  );

  res.status(201).json(member);
});

router.post("/ensembles/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
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
  const ageMs = Date.now() - new Date(member.invitedAt).getTime();
  if (ageMs > INVITE_EXPIRY_MS) {
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

  // If all outstanding invites have been accepted, promote ensemble to active
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

  res.json(updated);
});

router.delete(
  "/ensembles/:id/members/:memberId",
  requireAuth,
  async (req, res): Promise<void> => {
    const auth = getAuth(req);
    const userId = auth.userId!;
    const id = parseInt(req.params.id, 10);
    const memberUserId = req.params.memberId;

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

    await db
      .update(ensembleMembersTable)
      .set({ status: "removed" })
      .where(eq(ensembleMembersTable.id, member.id));

    res.status(204).send();
  },
);

router.put("/ensembles/:id/splits", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
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
    res.status(403).json({ error: "Only the ensemble leader can update split percentages" });
    return;
  }

  const { splits } = req.body as { splits?: unknown };
  if (!Array.isArray(splits)) {
    res.status(400).json({ error: "splits must be an array of { memberId, splitPercent }" });
    return;
  }

  type SplitEntry = { memberId: unknown; splitPercent: unknown };
  const total = (splits as SplitEntry[]).reduce(
    (sum, s) => sum + (typeof s.splitPercent === "number" ? s.splitPercent : 0),
    0,
  );

  if (total !== 100) {
    res.status(400).json({ error: `Split percentages must sum to 100 (got ${total})` });
    return;
  }

  for (const split of splits as SplitEntry[]) {
    if (typeof split.memberId !== "number" || typeof split.splitPercent !== "number") continue;
    await db
      .update(ensembleMembersTable)
      .set({ splitPercent: Math.round(split.splitPercent) })
      .where(
        and(
          eq(ensembleMembersTable.id, split.memberId),
          eq(ensembleMembersTable.ensembleId, id),
        ),
      );
  }

  const enriched = await formatEnsemble(id);
  res.json(enriched);
});

router.get("/ensembles/:id/payouts", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
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

  const payouts = await db
    .select()
    .from(payoutsTable)
    .where(eq(payoutsTable.ensembleId, id));

  res.json({ payouts });
});

export async function processEnsembleRevenueSplit(
  bookingId: number,
  ensembleId: number,
  stripeTransfer?: (accountId: string, amountCents: number, bookingId: number) => Promise<string | null>,
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

  const existingPayouts = await db
    .select({ id: payoutsTable.id })
    .from(payoutsTable)
    .where(eq(payoutsTable.bookingId, bookingId));

  if (existingPayouts.length > 0) {
    logger.info({ bookingId, ensembleId }, "processEnsembleRevenueSplit: payouts already created — skipping");
    return;
  }

  const totalSplit = activeMembers.reduce((sum, m) => sum + m.splitPercent, 0);
  if (totalSplit === 0) {
    logger.warn({ bookingId, ensembleId }, "processEnsembleRevenueSplit: total split is 0");
    return;
  }

  for (const member of activeMembers) {
    if (!member.userId) continue;

    const effectiveSplit = member.splitPercent / totalSplit;
    const grossAmountCents = Math.round(booking.priceInCents * effectiveSplit);
    const platformFeePortionCents = Math.round(booking.platformFeeInCents * effectiveSplit);
    const netAmountCents = grossAmountCents - platformFeePortionCents;

    let stripeTransferId: string | null = null;
    let payoutStatus: "pending" | "completed" | "failed" = "pending";

    if (stripeTransfer && netAmountCents > 0) {
      const [teacherProfile] = await db
        .select({ stripeAccountId: teacherProfilesTable.stripeAccountId, stripeOnboarded: teacherProfilesTable.stripeOnboarded })
        .from(teacherProfilesTable)
        .where(eq(teacherProfilesTable.userId, member.userId));

      if (teacherProfile?.stripeAccountId && teacherProfile.stripeOnboarded) {
        try {
          stripeTransferId = await stripeTransfer(teacherProfile.stripeAccountId, netAmountCents, bookingId);
          payoutStatus = stripeTransferId ? "completed" : "pending";
        } catch (err) {
          logger.error({ err, bookingId, memberId: member.userId }, "Stripe transfer failed for ensemble member");
          payoutStatus = "failed";
        }
      }
    }

    await db.insert(payoutsTable).values({
      bookingId,
      ensembleId,
      memberId: member.userId,
      splitPercent: member.splitPercent,
      grossAmountCents,
      platformFeePortionCents,
      netAmountCents,
      stripeTransferId,
      status: payoutStatus,
    });

    logger.info(
      { bookingId, ensembleId, memberId: member.userId, netAmountCents, splitPercent: member.splitPercent, payoutStatus },
      "Ensemble payout record created",
    );
  }
}

export default router;
