import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc, ilike, sql } from "drizzle-orm";
import {
  db,
  coachProfilesTable,
  usersTable,
  listingsTable,
  bookingsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const COACHING_PLATFORM_FEE_RATE = 0.20;

const router: IRouter = Router();

router.get("/coaches", async (req, res): Promise<void> => {
  const { specialty, city, q, limit: limitQ, offset: offsetQ } = req.query as Record<string, string | undefined>;
  const limit = Math.min(Number(limitQ) || 20, 50);
  const offset = Number(offsetQ) || 0;

  const conditions = [eq(coachProfilesTable.approvalStatus, "approved")];
  if (city) {
    conditions.push(ilike(coachProfilesTable.city, `%${city}%`));
  }

  const rows = await db
    .select()
    .from(coachProfilesTable)
    .leftJoin(usersTable, eq(coachProfilesTable.userId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(coachProfilesTable.averageRating))
    .limit(limit)
    .offset(offset);

  let coaches = rows.map((r) => ({ ...r.coach_profiles, user: r.users }));

  if (specialty) {
    const lower = specialty.toLowerCase();
    coaches = coaches.filter((c) =>
      c.specialties.some((s: string) => s.toLowerCase().includes(lower))
    );
  }

  if (q) {
    const lower = q.toLowerCase();
    coaches = coaches.filter((c) => {
      const name = `${c.user?.firstName ?? ""} ${c.user?.lastName ?? ""}`.toLowerCase();
      return (
        name.includes(lower) ||
        (c.bio ?? "").toLowerCase().includes(lower) ||
        (c.credentials ?? "").toLowerCase().includes(lower) ||
        (c.city ?? "").toLowerCase().includes(lower) ||
        c.specialties.some((s: string) => s.toLowerCase().includes(lower))
      );
    });
  }

  res.json({ coaches, total: coaches.length });
});

router.get("/coaches/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [row] = await db
    .select()
    .from(coachProfilesTable)
    .leftJoin(usersTable, eq(coachProfilesTable.userId, usersTable.id))
    .where(eq(coachProfilesTable.userId, userId));

  if (!row) {
    res.status(404).json({ error: "No coach profile found" });
    return;
  }

  res.json({ ...row.coach_profiles, user: row.users });
});

router.get("/coaches/:userId", async (req, res): Promise<void> => {
  const { userId } = req.params as { userId: string };

  const [row] = await db
    .select()
    .from(coachProfilesTable)
    .leftJoin(usersTable, eq(coachProfilesTable.userId, usersTable.id))
    .where(eq(coachProfilesTable.userId, userId));

  if (!row || row.coach_profiles.approvalStatus !== "approved") {
    const auth = getAuth(req);
    if (!row || row.coach_profiles.userId !== auth.userId) {
      res.status(404).json({ error: "Coach not found" });
      return;
    }
  }

  const listings = await db
    .select()
    .from(listingsTable)
    .where(and(eq(listingsTable.teacherId, userId), sql`${listingsTable.type} = 'coaching'`, eq(listingsTable.status, "active")));

  res.json({ ...row.coach_profiles, user: row.users, listings });
});

router.post("/coaches/apply", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const { bio, credentials, specialties, linkedInUrl, sessionRateCents, isOnline, city, country, profileImageUrl } = req.body as {
    bio?: string;
    credentials?: string;
    specialties?: string[];
    linkedInUrl?: string;
    sessionRateCents?: number;
    isOnline?: boolean;
    city?: string;
    country?: string;
    profileImageUrl?: string;
  };

  if (!bio || !credentials || !specialties?.length) {
    res.status(400).json({ error: "bio, credentials, and specialties are required" });
    return;
  }

  const existing = await db
    .select({ id: coachProfilesTable.id, status: coachProfilesTable.approvalStatus })
    .from(coachProfilesTable)
    .where(eq(coachProfilesTable.userId, userId));

  if (existing.length > 0) {
    if (existing[0].status === "approved") {
      res.status(400).json({ error: "Your coach application has already been approved" });
      return;
    }
    const [updated] = await db
      .update(coachProfilesTable)
      .set({ bio, credentials, specialties: specialties ?? [], linkedInUrl, sessionRateCents, isOnline: isOnline ?? true, city, country, profileImageUrl, approvalStatus: "pending" })
      .where(eq(coachProfilesTable.userId, userId))
      .returning();
    res.json(updated);
    return;
  }

  const [profile] = await db
    .insert(coachProfilesTable)
    .values({ userId, bio, credentials, specialties: specialties ?? [], linkedInUrl, sessionRateCents, isOnline: isOnline ?? true, city, country, profileImageUrl, approvalStatus: "pending" })
    .returning();

  logger.info({ userId }, "New coach application submitted");
  res.status(201).json(profile);
});

router.put("/coaches/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const { bio, credentials, specialties, linkedInUrl, sessionRateCents, isOnline, city, country, profileImageUrl } = req.body as {
    bio?: string;
    credentials?: string;
    specialties?: string[];
    linkedInUrl?: string;
    sessionRateCents?: number;
    isOnline?: boolean;
    city?: string;
    country?: string;
    profileImageUrl?: string;
  };

  const existing = await db
    .select({ id: coachProfilesTable.id })
    .from(coachProfilesTable)
    .where(eq(coachProfilesTable.userId, userId));

  if (existing.length === 0) {
    res.status(404).json({ error: "No coach profile found" });
    return;
  }

  const [updated] = await db
    .update(coachProfilesTable)
    .set({ bio, credentials, specialties, linkedInUrl, sessionRateCents, isOnline, city, country, profileImageUrl })
    .where(eq(coachProfilesTable.userId, userId))
    .returning();

  res.json(updated);
});

router.post("/coaches/me/listings", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [coach] = await db
    .select({ id: coachProfilesTable.id, status: coachProfilesTable.approvalStatus })
    .from(coachProfilesTable)
    .where(eq(coachProfilesTable.userId, userId));

  if (!coach || coach.status !== "approved") {
    res.status(403).json({ error: "Only approved coaches can create coaching listings" });
    return;
  }

  const { title, description, sessionType, priceInCents, durationMinutes, isOnline, city } = req.body as {
    title: string;
    description?: string;
    sessionType?: string;
    priceInCents: number;
    durationMinutes?: number;
    isOnline?: boolean;
    city?: string;
  };

  if (!title || !priceInCents) {
    res.status(400).json({ error: "title and priceInCents are required" });
    return;
  }

  const [listing] = await db
    .insert(listingsTable)
    .values({
      teacherId: userId,
      type: "coaching",
      status: "active",
      title,
      description: description ?? null,
      priceInCents,
      durationMinutes: durationMinutes ?? 60,
      isOnline: isOnline ?? true,
      city: city ?? null,
      tags: sessionType ? [sessionType] : [],
    })
    .returning();

  res.status(201).json(listing);
});

router.get("/coaches/me/bookings", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const rows = await db
    .select()
    .from(bookingsTable)
    .leftJoin(usersTable, eq(bookingsTable.studentId, usersTable.id))
    .where(and(eq(bookingsTable.teacherId, userId), sql`${bookingsTable.type} = 'coaching'`))
    .orderBy(desc(bookingsTable.createdAt))
    .limit(50);

  const bookings = rows.map((r) => ({ ...r.bookings, student: r.users }));
  res.json({ bookings });
});

router.put("/coaches/me/bookings/:bookingId/meeting-url", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const bookingId = Number(req.params.bookingId);

  if (isNaN(bookingId)) {
    res.status(400).json({ error: "Invalid booking ID" });
    return;
  }

  const { meetingUrl } = req.body as { meetingUrl: string };
  if (!meetingUrl) {
    res.status(400).json({ error: "meetingUrl is required" });
    return;
  }

  const [booking] = await db
    .select({ id: bookingsTable.id, teacherId: bookingsTable.teacherId, status: bookingsTable.status })
    .from(bookingsTable)
    .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.teacherId, userId), sql`${bookingsTable.type} = 'coaching'`));

  if (!booking) {
    res.status(404).json({ error: "Coaching booking not found" });
    return;
  }

  if (booking.status !== "confirmed" && booking.status !== "completed") {
    res.status(400).json({ error: "Meeting URL can only be set for confirmed or completed coaching sessions" });
    return;
  }

  const [updated] = await db
    .update(bookingsTable)
    .set({ meetingUrl })
    .where(eq(bookingsTable.id, bookingId))
    .returning();

  res.json(updated);
});

export { COACHING_PLATFORM_FEE_RATE };
export default router;
