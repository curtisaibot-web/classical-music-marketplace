import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, subscriptionsTable, teacherProfilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getUncachableStripeClient } from "../stripeClient";
import { logger } from "../lib/logger";

const BUSINESS_SUITE_MONTHLY_PRICE_USD_CENTS = 2900;
const BUSINESS_SUITE_ANNUAL_PRICE_USD_CENTS = 27900;

const router: IRouter = Router();

async function getOrCreateStripeCustomer(stripe: import("stripe").default, userId: string, email?: string): Promise<string> {
  const [existing] = await db
    .select({ stripeCustomerId: subscriptionsTable.stripeCustomerId })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));

  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });

  await db
    .insert(subscriptionsTable)
    .values({ userId, stripeCustomerId: customer.id, status: "incomplete" })
    .onConflictDoUpdate({
      target: subscriptionsTable.userId,
      set: { stripeCustomerId: customer.id, updatedAt: new Date() },
    });

  return customer.id;
}

router.get("/subscriptions/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));

  const isProSubscriber = sub?.status === "active" || sub?.status === "trialing";

  if (!sub) {
    res.json({ subscription: null, isProSubscriber: false });
    return;
  }

  res.json({
    subscription: {
      id: sub.id,
      userId: sub.userId,
      stripeCustomerId: sub.stripeCustomerId,
      stripeSubscriptionId: sub.stripeSubscriptionId,
      stripePriceId: sub.stripePriceId,
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
    },
    isProSubscriber,
  });
});

router.post("/subscriptions/checkout", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const { plan, successUrl, cancelUrl } = req.body as {
    plan?: "monthly" | "annual";
    successUrl: string;
    cancelUrl: string;
  };

  if (!successUrl || !cancelUrl) {
    res.status(400).json({ error: "successUrl and cancelUrl are required" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();

    const customerId = await getOrCreateStripeCustomer(stripe, userId);

    const unitAmount = plan === "annual" ? BUSINESS_SUITE_ANNUAL_PRICE_USD_CENTS : BUSINESS_SUITE_MONTHLY_PRICE_USD_CENTS;
    const interval = plan === "annual" ? "year" : "month";

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      mode: "subscription",
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: "Harmonia Business Suite",
              description: "Professional business tools for musicians: contracts, invoices, expense tracking, and more.",
            },
            unit_amount: unitAmount,
            recurring: { interval },
          },
          quantity: 1,
        },
      ],
      metadata: { userId, type: "business_suite" },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    logger.error({ err }, "Failed to create subscription checkout session");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/subscriptions/portal", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const { returnUrl } = req.body as { returnUrl: string };

  if (!returnUrl) {
    res.status(400).json({ error: "returnUrl is required" });
    return;
  }

  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));

  if (!sub?.stripeCustomerId) {
    res.status(400).json({ error: "No subscription found. Please subscribe first." });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: sub.stripeCustomerId,
      return_url: returnUrl,
    });
    res.json({ portalUrl: session.url });
  } catch (err) {
    logger.error({ err }, "Failed to create billing portal session");
    res.status(500).json({ error: "Failed to create billing portal session" });
  }
});

router.post("/subscriptions/activate", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const { stripeSubscriptionId } = req.body as { stripeSubscriptionId?: string };

  if (!stripeSubscriptionId) {
    res.status(400).json({ error: "stripeSubscriptionId is required" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId, { expand: ["customer"] });
    const stripeCustomerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;

    const customer = typeof sub.customer === "string"
      ? await stripe.customers.retrieve(stripeCustomerId)
      : sub.customer;

    if (customer.deleted) {
      res.status(403).json({ error: "This subscription does not belong to your account" });
      return;
    }

    const customerUserId = (customer as import("stripe").default.Customer).metadata?.userId;
    if (customerUserId !== userId) {
      logger.warn({ userId, customerUserId, stripeCustomerId }, "Subscription activate: customer metadata userId mismatch — rejecting");
      res.status(403).json({ error: "This subscription does not belong to your account" });
      return;
    }

    const [existing] = await db
      .select({ stripeCustomerId: subscriptionsTable.stripeCustomerId })
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.userId, userId));

    if (existing?.stripeCustomerId && existing.stripeCustomerId !== stripeCustomerId) {
      logger.warn({ userId, stripeCustomerId, existingCustomerId: existing.stripeCustomerId }, "Subscription activate: stored customer mismatch — rejecting");
      res.status(403).json({ error: "This subscription does not belong to your account" });
      return;
    }

    const periodEnd = new Date(sub.current_period_end * 1000);

    await db
      .insert(subscriptionsTable)
      .values({
        userId,
        stripeSubscriptionId,
        stripeCustomerId,
        stripePriceId: sub.items.data[0]?.price.id ?? null,
        status: sub.status as "active" | "past_due" | "cancelled" | "trialing" | "incomplete",
        currentPeriodEnd: periodEnd,
      })
      .onConflictDoUpdate({
        target: subscriptionsTable.userId,
        set: {
          stripeSubscriptionId,
          stripeCustomerId,
          status: sub.status as "active" | "past_due" | "cancelled" | "trialing" | "incomplete",
          currentPeriodEnd: periodEnd,
          updatedAt: new Date(),
        },
      });

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Failed to activate subscription");
    res.status(500).json({ error: "Failed to activate subscription" });
  }
});

export async function isProSubscriber(userId: string): Promise<boolean> {
  const [sub] = await db
    .select({ status: subscriptionsTable.status })
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId));
  return sub?.status === "active" || sub?.status === "trialing";
}

export default router;
