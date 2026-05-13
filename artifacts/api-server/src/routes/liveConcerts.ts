import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, desc, sql, inArray } from "drizzle-orm";
import {
  db,
  liveConcertsTable,
  ordersTable,
  teacherProfilesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import pino from "pino";

const logger = pino();
const router: IRouter = Router();

const LIVE_CONCERT_FEE_RATE = 0.20;

type UserRow = typeof usersTable.$inferSelect;

function formatConcert(
  concert: typeof liveConcertsTable.$inferSelect,
  teacher?: typeof teacherProfilesTable.$inferSelect | null,
  user?: UserRow | null,
  opts?: { hideStream?: boolean },
) {
  return {
    ...concert,
    streamUrl: opts?.hideStream ? null : concert.streamUrl,
    scheduledAt: concert.scheduledAt.toISOString(),
    replayAvailableUntil: concert.replayAvailableUntil?.toISOString() ?? null,
    createdAt: concert.createdAt.toISOString(),
    updatedAt: undefined,
    teacher: teacher ? {
      ...teacher,
      user: user ? {
        id: user.id,
        email: user.email,
        firstName: user.firstName ?? null,
        lastName: user.lastName ?? null,
        imageUrl: user.imageUrl ?? null,
        role: user.role ?? null,
        createdAt: user.createdAt.toISOString(),
      } : null,
    } : null,
  };
}

router.get("/live-concerts", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10), 100);
  const offset = parseInt(String(req.query.offset ?? "0"), 10);

  const concerts = await db
    .select()
    .from(liveConcertsTable)
    .orderBy(desc(liveConcertsTable.scheduledAt))
    .limit(limit)
    .offset(offset);

  const teacherIds = [...new Set(concerts.map(c => c.teacherId))];
  const teachers = teacherIds.length > 0
    ? await db.select().from(teacherProfilesTable).where(inArray(teacherProfilesTable.userId, teacherIds))
    : [];
  const users = teacherIds.length > 0
    ? await db.select().from(usersTable).where(inArray(usersTable.id, teacherIds))
    : [];

  const teacherMap = new Map(teachers.map(t => [t.userId, t]));
  const userMap = new Map(users.map(u => [u.id, u]));

  res.json({
    concerts: concerts.map(c => formatConcert(c, teacherMap.get(c.teacherId), userMap.get(c.teacherId), { hideStream: true })),
    total: concerts.length,
  });
});

router.get("/live-concerts/mine", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [profile] = await db
    .select()
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, userId));

  if (!profile) {
    res.status(403).json({ error: "Only teachers can access this endpoint" });
    return;
  }

  const concerts = await db
    .select()
    .from(liveConcertsTable)
    .where(eq(liveConcertsTable.teacherId, userId))
    .orderBy(desc(liveConcertsTable.scheduledAt));

  const concertIds = concerts.map(c => c.id);

  let orderStats: Array<{ liveConcertId: number; soldTickets: number; grossRevenueCents: number }> = [];
  if (concertIds.length > 0) {
    const rows = await db
      .select({
        liveConcertId: ordersTable.liveConcertId,
        soldTickets: sql<number>`COUNT(*)::int`,
        grossRevenueCents: sql<number>`SUM(${ordersTable.priceInCents})::int`,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.type, "live_concert"),
          eq(ordersTable.status, "paid"),
          inArray(ordersTable.liveConcertId, concertIds),
        ),
      )
      .groupBy(ordersTable.liveConcertId);
    orderStats = rows.map(r => ({
      liveConcertId: r.liveConcertId!,
      soldTickets: Number(r.soldTickets),
      grossRevenueCents: Number(r.grossRevenueCents),
    }));
  }

  const statsMap = new Map(orderStats.map(s => [s.liveConcertId, s]));

  const result = concerts.map(concert => {
    const stats = statsMap.get(concert.id);
    const soldTickets = stats?.soldTickets ?? 0;
    const grossRevenueCents = stats?.grossRevenueCents ?? 0;
    const netRevenueCents = Math.round(grossRevenueCents * (1 - LIVE_CONCERT_FEE_RATE));
    return {
      concert: formatConcert(concert, profile),
      soldTickets,
      grossRevenueCents,
      netRevenueCents,
    };
  });

  res.json({ concerts: result });
});

router.get("/live-concerts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid concert id" });
    return;
  }

  const [concert] = await db
    .select()
    .from(liveConcertsTable)
    .where(eq(liveConcertsTable.id, id));

  if (!concert) {
    res.status(404).json({ error: "Concert not found" });
    return;
  }

  const [teacher] = await db
    .select()
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, concert.teacherId));
  const [teacherUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, concert.teacherId));

  const auth = getAuth(req);
  const userId = auth.userId;

  let hasStreamAccess = false;
  if (userId) {
    if (userId === concert.teacherId) {
      hasStreamAccess = true;
    } else {
      const [ticket] = await db
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(
          and(
            eq(ordersTable.buyerId, userId),
            eq(ordersTable.type, "live_concert"),
            eq(ordersTable.liveConcertId, id),
            eq(ordersTable.status, "paid"),
          ),
        );
      hasStreamAccess = !!ticket;
    }
  }

  res.json(formatConcert(concert, teacher, teacherUser, { hideStream: !hasStreamAccess }));
});

router.post("/live-concerts", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [profile] = await db
    .select()
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, userId));

  if (!profile) {
    res.status(403).json({ error: "Only teachers can create live concerts" });
    return;
  }

  const { title, description, scheduledAt, streamUrl, streamType, ticketPriceCents, maxTickets, replayAvailableUntil, imageUrl } = req.body as {
    title: string;
    description?: string;
    scheduledAt: string;
    streamUrl: string;
    streamType?: "youtube" | "mux";
    ticketPriceCents: number;
    maxTickets?: number;
    replayAvailableUntil?: string;
    imageUrl?: string;
  };

  if (!title || !scheduledAt || !streamUrl || !ticketPriceCents) {
    res.status(400).json({ error: "title, scheduledAt, streamUrl, and ticketPriceCents are required" });
    return;
  }

  try {
    const [concert] = await db
      .insert(liveConcertsTable)
      .values({
        teacherId: userId,
        title,
        description: description ?? null,
        scheduledAt: new Date(scheduledAt),
        streamUrl,
        streamType: streamType ?? "youtube",
        ticketPriceCents,
        maxTickets: maxTickets ?? 500,
        replayAvailableUntil: replayAvailableUntil ? new Date(replayAvailableUntil) : null,
        imageUrl: imageUrl ?? null,
      })
      .returning();

    res.status(201).json(formatConcert(concert, profile));
  } catch (err) {
    logger.error({ err }, "Failed to create live concert");
    res.status(500).json({ error: "Failed to create concert" });
  }
});

router.patch("/live-concerts/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid concert id" });
    return;
  }

  const [concert] = await db
    .select()
    .from(liveConcertsTable)
    .where(and(eq(liveConcertsTable.id, id), eq(liveConcertsTable.teacherId, userId)));

  if (!concert) {
    res.status(404).json({ error: "Concert not found or not owned by you" });
    return;
  }

  const { title, description, scheduledAt, streamUrl, streamType, ticketPriceCents, maxTickets, replayAvailableUntil, imageUrl, isCancelled } = req.body as Partial<{
    title: string;
    description: string;
    scheduledAt: string;
    streamUrl: string;
    streamType: "youtube" | "mux";
    ticketPriceCents: number;
    maxTickets: number;
    replayAvailableUntil: string;
    imageUrl: string;
    isCancelled: boolean;
  }>;

  const updates: Partial<typeof liveConcertsTable.$inferInsert> = {};
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (scheduledAt !== undefined) updates.scheduledAt = new Date(scheduledAt);
  if (streamUrl !== undefined) updates.streamUrl = streamUrl;
  if (streamType !== undefined) updates.streamType = streamType;
  if (ticketPriceCents !== undefined) updates.ticketPriceCents = ticketPriceCents;
  if (maxTickets !== undefined) updates.maxTickets = maxTickets;
  if (replayAvailableUntil !== undefined) updates.replayAvailableUntil = replayAvailableUntil ? new Date(replayAvailableUntil) : null;
  if (imageUrl !== undefined) updates.imageUrl = imageUrl;
  if (isCancelled !== undefined) updates.isCancelled = isCancelled;

  const [updated] = await db
    .update(liveConcertsTable)
    .set(updates)
    .where(eq(liveConcertsTable.id, id))
    .returning();

  const [teacher] = await db
    .select()
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, userId));

  res.json(formatConcert(updated, teacher));
});

router.get("/live-concerts/:id/my-ticket", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid concert id" });
    return;
  }

  const [ticket] = await db
    .select()
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.buyerId, userId),
        eq(ordersTable.type, "live_concert"),
        eq(ordersTable.liveConcertId, id),
        eq(ordersTable.status, "paid"),
      ),
    );

  res.json({
    hasTicket: !!ticket,
    orderId: ticket?.id ?? null,
  });
});

export default router;
