import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or, ne, desc } from "drizzle-orm";
import {
  db,
  practiceProfilesTable,
  practicePartnershipsTable,
  practiceSessionsTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { isProSubscriber } from "./subscriptions";

const router: IRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────────────

function computeMatchScore(
  a: { instruments: string[]; skillLevel: string; goals: string[]; sessionFormat: string },
  b: { instruments: string[]; skillLevel: string; goals: string[]; sessionFormat: string },
): { score: number; reason: string } {
  let score = 0;
  const reasons: string[] = [];

  const sharedInstruments = a.instruments.filter((i) => b.instruments.includes(i));
  if (sharedInstruments.length > 0) {
    score += 40;
    reasons.push(`both play ${sharedInstruments.slice(0, 2).join(" & ")}`);
  }

  if (a.skillLevel === b.skillLevel) {
    score += 30;
    reasons.push("same skill level");
  } else {
    const levels = ["beginner", "intermediate", "advanced", "professional"];
    const diff = Math.abs(levels.indexOf(a.skillLevel) - levels.indexOf(b.skillLevel));
    if (diff === 1) score += 15;
  }

  const sharedGoals = a.goals.filter((g) => b.goals.includes(g));
  if (sharedGoals.length > 0) {
    score += Math.min(20, sharedGoals.length * 7);
    reasons.push(`shared goals: ${sharedGoals.slice(0, 2).join(", ")}`);
  }

  const formatsCompatible =
    a.sessionFormat === b.sessionFormat ||
    a.sessionFormat === "either" ||
    b.sessionFormat === "either";
  if (formatsCompatible) {
    score += 10;
  }

  return {
    score: Math.min(100, score),
    reason: reasons.length > 0 ? reasons.join("; ") : "compatible musicians",
  };
}

async function getMyPartnerships(userId: string) {
  return db
    .select()
    .from(practicePartnershipsTable)
    .where(
      or(
        eq(practicePartnershipsTable.requesterId, userId),
        eq(practicePartnershipsTable.recipientId, userId),
      ),
    );
}

// ── Profile Endpoints ─────────────────────────────────────────────────────────

router.get("/practice/profile/me", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const [row] = await db
    .select()
    .from(practiceProfilesTable)
    .leftJoin(usersTable, eq(practiceProfilesTable.userId, usersTable.id))
    .where(eq(practiceProfilesTable.userId, userId!));
  if (!row) { res.status(404).json({ error: "No practice profile" }); return; }
  res.json({ ...row.practice_profiles, user: row.users });
});

router.post("/practice/profile", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const { instruments, skillLevel, goals, availabilitySlots, sessionFormat, bio } = req.body as {
    instruments?: string[];
    skillLevel?: string;
    goals?: string[];
    availabilitySlots?: Array<{ day: string; time: string }>;
    sessionFormat?: string;
    bio?: string;
  };

  const existing = await db.select({ id: practiceProfilesTable.id }).from(practiceProfilesTable).where(eq(practiceProfilesTable.userId, userId!));
  if (existing.length > 0) { res.status(409).json({ error: "Profile already exists. Use PUT to update." }); return; }

  const [profile] = await db
    .insert(practiceProfilesTable)
    .values({
      userId: userId!,
      instruments: instruments ?? [],
      skillLevel: skillLevel ?? "intermediate",
      goals: goals ?? [],
      availabilitySlots: availabilitySlots ?? [],
      sessionFormat: sessionFormat ?? "either",
      bio: bio ?? null,
    })
    .returning();
  res.status(201).json(profile);
});

router.put("/practice/profile", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const { instruments, skillLevel, goals, availabilitySlots, sessionFormat, bio, isActive } = req.body as {
    instruments?: string[];
    skillLevel?: string;
    goals?: string[];
    availabilitySlots?: Array<{ day: string; time: string }>;
    sessionFormat?: string;
    bio?: string;
    isActive?: boolean;
  };

  const [profile] = await db
    .insert(practiceProfilesTable)
    .values({
      userId: userId!,
      instruments: instruments ?? [],
      skillLevel: skillLevel ?? "intermediate",
      goals: goals ?? [],
      availabilitySlots: availabilitySlots ?? [],
      sessionFormat: sessionFormat ?? "either",
      bio: bio ?? null,
      isActive: isActive ?? true,
    })
    .onConflictDoUpdate({
      target: practiceProfilesTable.userId,
      set: {
        instruments: instruments ?? [],
        skillLevel: skillLevel ?? "intermediate",
        goals: goals ?? [],
        availabilitySlots: availabilitySlots ?? [],
        sessionFormat: sessionFormat ?? "either",
        bio: bio ?? null,
        ...(isActive !== undefined ? { isActive } : {}),
      },
    })
    .returning();
  res.json(profile);
});

router.get("/practice/profile/:userId", async (req, res): Promise<void> => {
  const { userId } = req.params as { userId: string };
  const [row] = await db
    .select()
    .from(practiceProfilesTable)
    .leftJoin(usersTable, eq(practiceProfilesTable.userId, usersTable.id))
    .where(and(eq(practiceProfilesTable.userId, userId), eq(practiceProfilesTable.isActive, true)));
  if (!row) { res.status(404).json({ error: "Practice profile not found" }); return; }
  res.json({ ...row.practice_profiles, user: row.users });
});

// ── Matches ───────────────────────────────────────────────────────────────────

router.get("/practice/matches", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const isPro = await isProSubscriber(userId!);
  const { instrument, format: formatFilter, limit: limitQ } = req.query as Record<string, string | undefined>;
  const limit = Math.min(Number(limitQ) || 20, 50);

  const [myRow] = await db
    .select()
    .from(practiceProfilesTable)
    .where(eq(practiceProfilesTable.userId, userId!));

  if (!myRow) { res.json({ matches: [], hasProfile: false }); return; }

  const allRows = await db
    .select()
    .from(practiceProfilesTable)
    .leftJoin(usersTable, eq(practiceProfilesTable.userId, usersTable.id))
    .where(and(eq(practiceProfilesTable.isActive, true), ne(practiceProfilesTable.userId, userId!)));

  const partnerships = await getMyPartnerships(userId!);
  const partnerUserIds = new Set(
    partnerships
      .filter((p) => p.status !== "dissolved")
      .map((p) => (p.requesterId === userId ? p.recipientId : p.requesterId)),
  );

  let matches = allRows
    .filter((r) => !partnerUserIds.has(r.practice_profiles.userId))
    .map((r) => {
      const { score, reason } = computeMatchScore(myRow, r.practice_profiles);
      return { ...r.practice_profiles, user: r.users, matchScore: score, matchReason: isPro ? reason : null };
    });

  if (instrument) {
    const lower = instrument.toLowerCase();
    matches = matches.filter((m) => m.instruments.some((i: string) => i.toLowerCase().includes(lower)));
  }

  if (formatFilter) {
    matches = matches.filter((m) => m.sessionFormat === formatFilter || m.sessionFormat === "either" || formatFilter === "either");
  }

  matches.sort((a, b) => b.matchScore - a.matchScore);

  res.json({ matches: matches.slice(0, limit), hasProfile: true, isPremium: isPro });
});

// ── Partnership Request Flow ──────────────────────────────────────────────────

router.post("/practice/request/:recipientId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const { recipientId } = req.params as { recipientId: string };

  if (userId === recipientId) { res.status(400).json({ error: "Cannot send a request to yourself" }); return; }

  const existing = await db
    .select({ id: practicePartnershipsTable.id })
    .from(practicePartnershipsTable)
    .where(
      or(
        and(eq(practicePartnershipsTable.requesterId, userId!), eq(practicePartnershipsTable.recipientId, recipientId)),
        and(eq(practicePartnershipsTable.requesterId, recipientId), eq(practicePartnershipsTable.recipientId, userId!)),
      ),
    )
    .limit(1);

  if (existing.length > 0) { res.status(409).json({ error: "A partnership or pending request already exists" }); return; }

  const [myProfile] = await db.select().from(practiceProfilesTable).where(eq(practiceProfilesTable.userId, userId!));
  const [theirProfile] = await db.select().from(practiceProfilesTable).where(eq(practiceProfilesTable.userId, recipientId));

  let matchScore = 0;
  let matchReason: string | null = null;
  if (myProfile && theirProfile) {
    const result = computeMatchScore(myProfile, theirProfile);
    matchScore = result.score;
    matchReason = result.reason;
  }

  const [partnership] = await db
    .insert(practicePartnershipsTable)
    .values({ requesterId: userId!, recipientId, status: "pending", matchScore, matchReason })
    .returning();

  res.status(201).json(partnership);
});

router.post("/practice/partnerships/:id/accept", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);

  const [partnership] = await db
    .select()
    .from(practicePartnershipsTable)
    .where(and(eq(practicePartnershipsTable.id, id), eq(practicePartnershipsTable.recipientId, userId!), eq(practicePartnershipsTable.status, "pending")));

  if (!partnership) { res.status(404).json({ error: "Partnership request not found" }); return; }

  const [updated] = await db
    .update(practicePartnershipsTable)
    .set({ status: "active" })
    .where(eq(practicePartnershipsTable.id, id))
    .returning();

  res.json(updated);
});

router.post("/practice/partnerships/:id/decline", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);

  const [partnership] = await db
    .select()
    .from(practicePartnershipsTable)
    .where(
      and(
        eq(practicePartnershipsTable.id, id),
        eq(practicePartnershipsTable.status, "pending"),
        or(eq(practicePartnershipsTable.recipientId, userId!), eq(practicePartnershipsTable.requesterId, userId!)),
      ),
    );

  if (!partnership) { res.status(404).json({ error: "Partnership request not found" }); return; }

  await db.delete(practicePartnershipsTable).where(eq(practicePartnershipsTable.id, id));
  res.json({ ok: true });
});

router.post("/practice/partnerships/:id/dissolve", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);

  const [partnership] = await db
    .select()
    .from(practicePartnershipsTable)
    .where(
      and(
        eq(practicePartnershipsTable.id, id),
        or(eq(practicePartnershipsTable.requesterId, userId!), eq(practicePartnershipsTable.recipientId, userId!)),
      ),
    );

  if (!partnership) { res.status(404).json({ error: "Partnership not found" }); return; }

  const [updated] = await db
    .update(practicePartnershipsTable)
    .set({ status: "dissolved" })
    .where(eq(practicePartnershipsTable.id, id))
    .returning();

  res.json(updated);
});

// ── List My Partnerships ──────────────────────────────────────────────────────

router.get("/practice/partnerships", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);

  const rows = await db
    .select()
    .from(practicePartnershipsTable)
    .where(
      and(
        or(
          eq(practicePartnershipsTable.requesterId, userId!),
          eq(practicePartnershipsTable.recipientId, userId!),
        ),
        ne(practicePartnershipsTable.status, "dissolved"),
      ),
    )
    .orderBy(desc(practicePartnershipsTable.createdAt));

  const partnerUserIds = rows.map((p) => (p.requesterId === userId ? p.recipientId : p.requesterId));
  const uniqueIds = [...new Set(partnerUserIds)];

  const users =
    uniqueIds.length > 0
      ? await db.select().from(usersTable).where(
          or(...uniqueIds.map((id) => eq(usersTable.id, id))),
        )
      : [];

  const profiles =
    uniqueIds.length > 0
      ? await db.select().from(practiceProfilesTable).where(
          or(...uniqueIds.map((id) => eq(practiceProfilesTable.userId, id))),
        )
      : [];

  const userMap = Object.fromEntries(users.map((u) => [u.id, u]));
  const profileMap = Object.fromEntries(profiles.map((p) => [p.userId, p]));

  const partnerships = rows.map((p) => {
    const partnerId = p.requesterId === userId ? p.recipientId : p.requesterId;
    return {
      ...p,
      partner: userMap[partnerId] ?? null,
      partnerProfile: profileMap[partnerId] ?? null,
      isRequester: p.requesterId === userId,
    };
  });

  res.json({ partnerships });
});

// ── Session Scheduling ────────────────────────────────────────────────────────

router.post("/practice/partnerships/:id/sessions", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  const { proposedAt, joinLink } = req.body as { proposedAt: string; joinLink?: string };

  if (!proposedAt) { res.status(400).json({ error: "proposedAt is required" }); return; }

  const [partnership] = await db
    .select()
    .from(practicePartnershipsTable)
    .where(
      and(
        eq(practicePartnershipsTable.id, id),
        eq(practicePartnershipsTable.status, "active"),
        or(eq(practicePartnershipsTable.requesterId, userId!), eq(practicePartnershipsTable.recipientId, userId!)),
      ),
    );

  if (!partnership) { res.status(404).json({ error: "Active partnership not found" }); return; }

  const [session] = await db
    .insert(practiceSessionsTable)
    .values({
      partnershipId: id,
      proposedById: userId!,
      proposedAt: new Date(proposedAt),
      joinLink: joinLink ?? null,
      status: "proposed",
    })
    .returning();

  res.status(201).json(session);
});

router.post("/practice/sessions/:id/confirm", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  const { joinLink } = req.body as { joinLink?: string };

  const [session] = await db
    .select()
    .from(practiceSessionsTable)
    .where(and(eq(practiceSessionsTable.id, id), eq(practiceSessionsTable.status, "proposed")));

  if (!session) { res.status(404).json({ error: "Session not found or already confirmed" }); return; }

  if (session.proposedById === userId) { res.status(403).json({ error: "Cannot confirm your own session proposal" }); return; }

  const [partnership] = await db
    .select()
    .from(practicePartnershipsTable)
    .where(
      and(
        eq(practicePartnershipsTable.id, session.partnershipId),
        or(eq(practicePartnershipsTable.requesterId, userId!), eq(practicePartnershipsTable.recipientId, userId!)),
      ),
    );

  if (!partnership) { res.status(403).json({ error: "Not part of this partnership" }); return; }

  const [updated] = await db
    .update(practiceSessionsTable)
    .set({ status: "confirmed", confirmedAt: new Date(), ...(joinLink ? { joinLink } : {}) })
    .where(eq(practiceSessionsTable.id, id))
    .returning();

  res.json(updated);
});

router.post("/practice/sessions/:id/complete", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  const { notes } = req.body as { notes?: string };

  const [session] = await db
    .select()
    .from(practiceSessionsTable)
    .where(and(eq(practiceSessionsTable.id, id), eq(practiceSessionsTable.status, "confirmed")));

  if (!session) { res.status(404).json({ error: "Confirmed session not found" }); return; }

  const [partnership] = await db
    .select()
    .from(practicePartnershipsTable)
    .where(
      and(
        eq(practicePartnershipsTable.id, session.partnershipId),
        or(eq(practicePartnershipsTable.requesterId, userId!), eq(practicePartnershipsTable.recipientId, userId!)),
      ),
    );

  if (!partnership) { res.status(403).json({ error: "Not part of this partnership" }); return; }

  const [updated] = await db
    .update(practiceSessionsTable)
    .set({ status: "completed", completedAt: new Date(), ...(notes ? { notes } : {}) })
    .where(eq(practiceSessionsTable.id, id))
    .returning();

  res.json(updated);
});

router.put("/practice/sessions/:id/join-link", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);
  const { joinLink } = req.body as { joinLink: string };

  if (!joinLink) { res.status(400).json({ error: "joinLink is required" }); return; }

  const [session] = await db
    .select()
    .from(practiceSessionsTable)
    .where(and(eq(practiceSessionsTable.id, id), or(eq(practiceSessionsTable.status, "proposed"), eq(practiceSessionsTable.status, "confirmed"))));

  if (!session) { res.status(404).json({ error: "Session not found" }); return; }

  const [partnership] = await db
    .select()
    .from(practicePartnershipsTable)
    .where(
      and(
        eq(practicePartnershipsTable.id, session.partnershipId),
        or(eq(practicePartnershipsTable.requesterId, userId!), eq(practicePartnershipsTable.recipientId, userId!)),
      ),
    );

  if (!partnership) { res.status(403).json({ error: "Not part of this partnership" }); return; }

  const [updated] = await db
    .update(practiceSessionsTable)
    .set({ joinLink })
    .where(eq(practiceSessionsTable.id, id))
    .returning();

  res.json(updated);
});

router.get("/practice/partnerships/:id/sessions", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getAuth(req);
  const id = Number(req.params.id);

  const [partnership] = await db
    .select()
    .from(practicePartnershipsTable)
    .where(
      and(
        eq(practicePartnershipsTable.id, id),
        or(eq(practicePartnershipsTable.requesterId, userId!), eq(practicePartnershipsTable.recipientId, userId!)),
      ),
    );

  if (!partnership) { res.status(404).json({ error: "Partnership not found" }); return; }

  const sessions = await db
    .select()
    .from(practiceSessionsTable)
    .where(eq(practiceSessionsTable.partnershipId, id))
    .orderBy(desc(practiceSessionsTable.proposedAt));

  res.json({ sessions });
});

export default router;
