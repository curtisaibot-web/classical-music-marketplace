import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, count, gte, sql } from "drizzle-orm";
import {
  db,
  organisationsTable,
  orgMembersTable,
  usersTable,
  teacherProfilesTable,
  studentProfilesTable,
  bookingsTable,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getUncachableStripeClient } from "../stripeClient";

const router: IRouter = Router();

const ORG_SLUG_RE = /^[a-z0-9-]{3,64}$/;

function paramStr(p: string | string[] | undefined): string {
  return Array.isArray(p) ? (p[0] ?? "") : (p ?? "");
}

async function requireOrgAdmin(
  req: Parameters<typeof requireAuth>[0],
  res: Parameters<typeof requireAuth>[1],
  slug: string,
): Promise<{ org: typeof organisationsTable.$inferSelect; userId: string } | null> {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const [org] = await db
    .select()
    .from(organisationsTable)
    .where(eq(organisationsTable.slug, slug));
  if (!org) {
    res.status(404).json({ error: "Organisation not found" });
    return null;
  }
  const [member] = await db
    .select({ role: orgMembersTable.role })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.userId, userId)));
  if (!member || member.role !== "admin") {
    res.status(403).json({ error: "Organisation admin access required" });
    return null;
  }
  return { org, userId };
}

// POST /orgs — create organisation
router.post("/orgs", requireAuth, async (req, res): Promise<void> => {
  const userId = getAuth(req).userId!;
  const { name, slug, description, logoUrl } = req.body as Record<string, unknown>;

  if (typeof name !== "string" || !name.trim()) {
    res.status(400).json({ error: "name is required" });
    return;
  }
  if (typeof slug !== "string" || !ORG_SLUG_RE.test(slug)) {
    res.status(400).json({ error: "slug must be 3–64 chars, lowercase letters, numbers and hyphens" });
    return;
  }

  const existing = await db.select({ id: organisationsTable.id }).from(organisationsTable).where(eq(organisationsTable.slug, slug));
  if (existing.length > 0) {
    res.status(409).json({ error: "Slug already taken" });
    return;
  }

  const [org] = await db
    .insert(organisationsTable)
    .values({
      name: String(name).trim(),
      slug: String(slug),
      description: typeof description === "string" ? description : null,
      logoUrl: typeof logoUrl === "string" ? logoUrl : null,
      ownerId: userId,
    })
    .returning();

  await db.insert(orgMembersTable).values({
    orgId: org.id,
    userId,
    role: "admin",
  });

  // ── Auto-initialize Stripe customer on org creation ───────────────────────
  // Create the Stripe customer eagerly so the billing portal is available
  // immediately. The per-seat subscription is activated separately once
  // students are enrolled (POST /orgs/:slug/subscribe).
  try {
    const stripe = await getUncachableStripeClient();
    const [owner] = await db
      .select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    const customer = await stripe.customers.create({
      email: owner?.email ?? undefined,
      name: `${owner?.firstName ?? ""} ${owner?.lastName ?? ""}`.trim() || org.name,
      metadata: { orgSlug: org.slug, orgId: String(org.id) },
    });
    const [updatedOrg] = await db
      .update(organisationsTable)
      .set({ stripeCustomerId: customer.id })
      .where(eq(organisationsTable.id, org.id))
      .returning();
    res.status(201).json({ org: updatedOrg });
    return;
  } catch (stripeErr) {
    // Non-fatal: Stripe not configured or customer creation failed — return org without customerId
    req.log?.warn({ err: stripeErr }, "Stripe customer creation failed on org creation");
  }

  res.status(201).json({ org });
});

// GET /orgs/:slug — get org details
router.get("/orgs/:slug", async (req, res): Promise<void> => {
  const slug = paramStr(req.params.slug);
  const [org] = await db
    .select({
      id: organisationsTable.id,
      name: organisationsTable.name,
      slug: organisationsTable.slug,
      description: organisationsTable.description,
      logoUrl: organisationsTable.logoUrl,
      isPublicMarketplace: organisationsTable.isPublicMarketplace,
      allowedListingTypes: organisationsTable.allowedListingTypes,
      defaultLessonRateCents: organisationsTable.defaultLessonRateCents,
      perSeatCents: organisationsTable.perSeatCents,
      subscriptionStatus: organisationsTable.subscriptionStatus,
      ownerId: organisationsTable.ownerId,
      createdAt: organisationsTable.createdAt,
      updatedAt: organisationsTable.updatedAt,
    })
    .from(organisationsTable)
    .where(eq(organisationsTable.slug, slug));
  if (!org) {
    res.status(404).json({ error: "Organisation not found" });
    return;
  }
  res.json({ org });
});

// PUT /orgs/:slug — update org (admin only)
router.put("/orgs/:slug", requireAuth, async (req, res): Promise<void> => {
  const slug = paramStr(req.params.slug);
  const ctx = await requireOrgAdmin(req, res, slug);
  if (!ctx) return;

  const { name, description, logoUrl, defaultLessonRateCents, allowedListingTypes, isPublicMarketplace } = req.body as Record<string, unknown>;

  const updates: Partial<typeof organisationsTable.$inferInsert> = {};
  if (typeof name === "string" && name.trim()) updates.name = name.trim();
  if (typeof description === "string") updates.description = description;
  if (typeof logoUrl === "string") updates.logoUrl = logoUrl;
  if (typeof defaultLessonRateCents === "number") updates.defaultLessonRateCents = defaultLessonRateCents;
  if (Array.isArray(allowedListingTypes)) updates.allowedListingTypes = allowedListingTypes as string[];
  if (typeof isPublicMarketplace === "boolean") updates.isPublicMarketplace = isPublicMarketplace;

  const [org] = await db
    .update(organisationsTable)
    .set({ ...updates, updatedAt: new Date() })
    .where(eq(organisationsTable.id, ctx.org.id))
    .returning();

  res.json({ org });
});

// POST /orgs/:slug/invite — invite a user (admin only)
router.post("/orgs/:slug/invite", requireAuth, async (req, res): Promise<void> => {
  const slug = paramStr(req.params.slug);
  const ctx = await requireOrgAdmin(req, res, slug);
  if (!ctx) return;

  const { userId: inviteeId, role } = req.body as Record<string, unknown>;
  if (typeof inviteeId !== "string" || !inviteeId) {
    res.status(400).json({ error: "userId is required" });
    return;
  }
  if (!["admin", "teacher", "student"].includes(String(role))) {
    res.status(400).json({ error: "role must be admin, teacher, or student" });
    return;
  }

  const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, inviteeId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  await db
    .insert(orgMembersTable)
    .values({ orgId: ctx.org.id, userId: inviteeId, role: role as "admin" | "teacher" | "student", invitedByUserId: ctx.userId })
    .onConflictDoUpdate({ target: [orgMembersTable.orgId, orgMembersTable.userId], set: { role: role as "admin" | "teacher" | "student" } });

  if (role === "teacher") {
    await db
      .update(teacherProfilesTable)
      .set({ orgId: ctx.org.id })
      .where(eq(teacherProfilesTable.userId, inviteeId));
  } else if (role === "student") {
    await db
      .update(studentProfilesTable)
      .set({ orgId: ctx.org.id })
      .where(eq(studentProfilesTable.userId, inviteeId));
  }

  await updateSubscriptionQuantity(ctx.org);

  res.status(201).json({ message: "Member added" });
});

// DELETE /orgs/:slug/members/:userId — remove member by userId (admin only)
router.delete("/orgs/:slug/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const slug = paramStr(req.params.slug);
  const memberId = paramStr(req.params.userId);
  const ctx = await requireOrgAdmin(req, res, slug);
  if (!ctx) return;

  const [member] = await db
    .select()
    .from(orgMembersTable)
    .where(
      sql`${orgMembersTable.orgId} = ${ctx.org.id} AND ${orgMembersTable.userId} = ${memberId}`,
    );

  if (!member) {
    res.status(404).json({ error: "Member not found" });
    return;
  }

  await db.delete(orgMembersTable).where(eq(orgMembersTable.id, member.id));

  if (member.role === "teacher") {
    await db
      .update(teacherProfilesTable)
      .set({ orgId: null })
      .where(
        sql`${teacherProfilesTable.userId} = ${memberId} AND ${teacherProfilesTable.orgId} = ${ctx.org.id}`,
      );
  } else if (member.role === "student") {
    await db
      .update(studentProfilesTable)
      .set({ orgId: null })
      .where(
        sql`${studentProfilesTable.userId} = ${memberId} AND ${studentProfilesTable.orgId} = ${ctx.org.id}`,
      );
  }

  await updateSubscriptionQuantity(ctx.org);

  res.json({ message: "Member removed" });
});

// GET /orgs/:slug/members — list all members (admin only)
router.get("/orgs/:slug/members", requireAuth, async (req, res): Promise<void> => {
  const slug = paramStr(req.params.slug);
  const ctx = await requireOrgAdmin(req, res, slug);
  if (!ctx) return;

  const rows = await db
    .select({
      memberId: orgMembersTable.id,
      role: orgMembersTable.role,
      joinedAt: orgMembersTable.joinedAt,
      userId: usersTable.id,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      email: usersTable.email,
    })
    .from(orgMembersTable)
    .leftJoin(usersTable, eq(orgMembersTable.userId, usersTable.id))
    .where(eq(orgMembersTable.orgId, ctx.org.id))
    .orderBy(orgMembersTable.joinedAt);

  res.json({ members: rows });
});

// GET /orgs/:slug/dashboard — aggregate stats (admin only)
router.get("/orgs/:slug/dashboard", requireAuth, async (req, res): Promise<void> => {
  const slug = paramStr(req.params.slug);
  const ctx = await requireOrgAdmin(req, res, slug);
  if (!ctx) return;

  const [studentCount] = await db
    .select({ count: count() })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, ctx.org.id), eq(orgMembersTable.role, "student")));

  const [teacherCount] = await db
    .select({ count: count() })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, ctx.org.id), eq(orgMembersTable.role, "teacher")));

  const orgStudentIds = await db
    .select({ userId: orgMembersTable.userId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, ctx.org.id), eq(orgMembersTable.role, "student")));

  const orgTeacherIds = await db
    .select({ userId: orgMembersTable.userId })
    .from(orgMembersTable)
    .where(and(eq(orgMembersTable.orgId, ctx.org.id), eq(orgMembersTable.role, "teacher")));

  const studentIds = orgStudentIds.map((r) => r.userId).filter((id): id is string => id !== null);
  const teacherIds = orgTeacherIds.map((r) => r.userId).filter((id): id is string => id !== null);

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  let monthlyBookingVolume = 0;
  let monthlyRevenue = 0;
  let monthlyPlatformFees = 0;

  if (studentIds.length > 0 && teacherIds.length > 0) {
    const studentArr = `ARRAY[${studentIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")}]::text[]`;
    const teacherArr = `ARRAY[${teacherIds.map((id) => `'${id.replace(/'/g, "''")}'`).join(",")}]::text[]`;

    const bookingRows = await db
      .select({
        totalRevenue: sql<number>`COALESCE(SUM(${bookingsTable.priceInCents}), 0)`,
        totalFees: sql<number>`COALESCE(SUM(${bookingsTable.platformFeeInCents}), 0)`,
        totalCount: count(),
      })
      .from(bookingsTable)
      .where(
        and(
          gte(bookingsTable.createdAt, startOfMonth),
          sql`${bookingsTable.studentId} = ANY(${sql.raw(studentArr)})`,
          sql`${bookingsTable.teacherId} = ANY(${sql.raw(teacherArr)})`,
        ),
      );
    monthlyRevenue = Number(bookingRows[0]?.totalRevenue ?? 0);
    monthlyPlatformFees = Number(bookingRows[0]?.totalFees ?? 0);
    monthlyBookingVolume = Number(bookingRows[0]?.totalCount ?? 0);
  }

  res.json({
    totalStudents: studentCount?.count ?? 0,
    totalTeachers: teacherCount?.count ?? 0,
    monthlyBookingVolume,
    monthlyRevenueCents: monthlyRevenue,
    monthlyPlatformFeesCents: monthlyPlatformFees,
    subscriptionStatus: ctx.org.subscriptionStatus,
    perSeatCents: ctx.org.perSeatCents,
  });
});

// POST /orgs/:slug/billing-portal — create Stripe billing portal session (admin only)
router.post("/orgs/:slug/billing-portal", requireAuth, async (req, res): Promise<void> => {
  const slug = paramStr(req.params.slug);
  const ctx = await requireOrgAdmin(req, res, slug);
  if (!ctx) return;

  if (!ctx.org.stripeCustomerId) {
    res.status(400).json({ error: "No Stripe customer associated with this organisation" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const returnUrl = String((req.body as Record<string, unknown>)?.returnUrl ?? process.env.PUBLIC_URL ?? "https://harmonia.app/org-admin");
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: ctx.org.stripeCustomerId,
      return_url: returnUrl,
    });
    res.json({ url: portalSession.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Failed to create billing portal session: ${msg}` });
  }
});

// POST /orgs/:slug/subscribe — create Stripe Checkout session for per-seat billing (admin only)
// Returns { checkoutUrl } to redirect the browser to Stripe Checkout for payment method setup.
// After checkout, Stripe redirects to /org-admin?org=<slug>&billing=success (or cancel).
router.post("/orgs/:slug/subscribe", requireAuth, async (req, res): Promise<void> => {
  const slug = paramStr(req.params.slug);
  const ctx = await requireOrgAdmin(req, res, slug);
  if (!ctx) return;

  try {
    const stripe = await getUncachableStripeClient();

    let customerId = ctx.org.stripeCustomerId;
    if (!customerId) {
      const [owner] = await db.select({ email: usersTable.email, firstName: usersTable.firstName, lastName: usersTable.lastName }).from(usersTable).where(eq(usersTable.id, ctx.userId));
      const customer = await stripe.customers.create({
        email: owner?.email ?? undefined,
        name: `${owner?.firstName ?? ""} ${owner?.lastName ?? ""}`.trim() || ctx.org.name,
        metadata: { orgSlug: ctx.org.slug, orgId: String(ctx.org.id) },
      });
      customerId = customer.id;
      await db.update(organisationsTable).set({ stripeCustomerId: customerId }).where(eq(organisationsTable.id, ctx.org.id));
    }

    // Use a lookup_key so we reuse a single price object per (unit_amount, slug) pair
    // rather than creating a new price on every subscribe call.
    const priceLookupKey = `org_seat_${ctx.org.slug}`;
    let priceId: string;
    const existingPrices = await stripe.prices.list({ lookup_keys: [priceLookupKey], limit: 1 });
    if (existingPrices.data.length > 0 && existingPrices.data[0]) {
      priceId = existingPrices.data[0].id;
    } else {
      const price = await stripe.prices.create({
        unit_amount: ctx.org.perSeatCents,
        currency: "usd",
        recurring: { interval: "month" },
        product_data: { name: `${ctx.org.name} — Harmonia per-seat plan` },
        lookup_key: priceLookupKey,
      });
      priceId = price.id;
    }

    // Set initial quantity from current active student count (minimum 1 for Stripe)
    const [studentCountRow] = await db
      .select({ count: count() })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, ctx.org.id), eq(orgMembersTable.role, "student")));
    const studentCount = Number(studentCountRow?.count ?? 0);
    const initialQuantity = Math.max(1, studentCount);

    // Use Checkout (hosted page) so the admin enters their card without needing Stripe.js in the frontend
    const origin = process.env.APP_ORIGIN
      ?? (process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "http://localhost:3000");
    const basePath = process.env.APP_BASE_PATH ?? "";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: [{ price: priceId, quantity: initialQuantity }],
      subscription_data: { metadata: { orgSlug: ctx.org.slug, orgId: String(ctx.org.id) } },
      success_url: `${origin}${basePath}/org-admin?org=${ctx.org.slug}&billing=success`,
      cancel_url: `${origin}${basePath}/schools/join?org=${ctx.org.slug}&billing=cancel`,
    });

    // Record subscription as pending until webhook confirms
    await db.update(organisationsTable).set({
      subscriptionStatus: "trialing",
      updatedAt: new Date(),
    }).where(eq(organisationsTable.id, ctx.org.id));

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: `Failed to create subscription: ${msg}` });
  }
});

export async function reconcileAllOrgSubscriptionQuantities(): Promise<void> {
  const orgs = await db
    .select()
    .from(organisationsTable)
    .where(sql`${organisationsTable.stripeSubscriptionId} IS NOT NULL AND ${organisationsTable.subscriptionStatus} NOT IN ('inactive', 'cancelled')`);
  for (const org of orgs) {
    await updateSubscriptionQuantity(org);
  }
}

async function updateSubscriptionQuantity(org: typeof organisationsTable.$inferSelect): Promise<void> {
  if (!org.stripeSubscriptionId) return;
  try {
    const stripe = await getUncachableStripeClient();
    const [studentCountRow] = await db
      .select({ count: count() })
      .from(orgMembersTable)
      .where(and(eq(orgMembersTable.orgId, org.id), eq(orgMembersTable.role, "student")));
    const quantity = Math.max(1, Number(studentCountRow?.count ?? 0));
    const subscription = await stripe.subscriptions.retrieve(org.stripeSubscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (itemId) {
      await stripe.subscriptionItems.update(itemId, { quantity });
    }
  } catch (syncErr) {
    // Non-fatal: subscription quantity sync can be retried on the next membership change
    console.warn("[orgs] Stripe subscription quantity sync failed:", syncErr instanceof Error ? syncErr.message : syncErr);
  }
}

export default router;
