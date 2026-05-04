import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or } from "drizzle-orm";
import { db, bookingsTable, ordersTable, teacherProfilesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { getUncachableStripeClient } from "../stripeClient";
import { logger } from "../lib/logger";

const PLATFORM_FEE_RATE = 0.15;

const router: IRouter = Router();

router.post("/stripe/checkout/booking", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const { bookingId, successUrl, cancelUrl } = req.body as {
    bookingId: number;
    successUrl: string;
    cancelUrl: string;
  };

  if (!bookingId || !successUrl || !cancelUrl) {
    res.status(400).json({ error: "bookingId, successUrl, and cancelUrl are required" });
    return;
  }

  const [booking] = await db
    .select()
    .from(bookingsTable)
    .where(and(eq(bookingsTable.id, bookingId), eq(bookingsTable.studentId, userId)));

  if (!booking) {
    res.status(404).json({ error: "Booking not found" });
    return;
  }

  if (booking.status !== "pending") {
    res.status(400).json({ error: "Booking is not in pending status" });
    return;
  }

  const [teacherProfile] = await db
    .select()
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, booking.teacherId));

  try {
    const stripe = await getUncachableStripeClient();

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: booking.currency.toLowerCase(),
            product_data: {
              name: `${booking.type === "lesson" ? "Private Lesson" : "Event Booking"}`,
              description: booking.notes ?? undefined,
            },
            unit_amount: booking.priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        booking_id: String(booking.id),
        type: "booking",
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    if (teacherProfile?.stripeAccountId && teacherProfile?.stripeOnboarded) {
      sessionParams.payment_intent_data = {
        application_fee_amount: Math.round(booking.priceInCents * PLATFORM_FEE_RATE),
        transfer_data: {
          destination: teacherProfile.stripeAccountId,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    await db
      .update(bookingsTable)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(bookingsTable.id, booking.id));

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    logger.error({ err }, "Failed to create booking checkout session");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/stripe/checkout/order", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const { orderId, successUrl, cancelUrl } = req.body as {
    orderId: number;
    successUrl: string;
    cancelUrl: string;
  };

  if (!orderId || !successUrl || !cancelUrl) {
    res.status(400).json({ error: "orderId, successUrl, and cancelUrl are required" });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.buyerId, userId)));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.status !== "pending") {
    res.status(400).json({ error: "Order is not in pending status" });
    return;
  }

  const [sellerProfile] = await db
    .select()
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, order.sellerId));

  let productName = "Digital Product";
  if (order.type === "masterclass_performer") productName = "Masterclass — Performer Ticket";
  else if (order.type === "masterclass_observer") productName = "Masterclass — Observer Ticket";

  try {
    const stripe = await getUncachableStripeClient();

    const sessionParams: Parameters<typeof stripe.checkout.sessions.create>[0] = {
      payment_method_types: ["card"],
      mode: "payment",
      line_items: [
        {
          price_data: {
            currency: order.currency.toLowerCase(),
            product_data: { name: productName },
            unit_amount: order.priceInCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        order_id: String(order.id),
        type: order.type,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    };

    if (sellerProfile?.stripeAccountId && sellerProfile?.stripeOnboarded) {
      sessionParams.payment_intent_data = {
        application_fee_amount: Math.round(order.priceInCents * PLATFORM_FEE_RATE),
        transfer_data: {
          destination: sellerProfile.stripeAccountId,
        },
      };
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    await db
      .update(ordersTable)
      .set({ stripeCheckoutSessionId: session.id })
      .where(eq(ordersTable.id, order.id));

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    logger.error({ err }, "Failed to create order checkout session");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/stripe/connect/onboard", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const { returnUrl } = req.body as { returnUrl: string };

  const [profile] = await db
    .select()
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, userId));

  if (!profile) {
    res.status(404).json({ error: "Teacher profile not found" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();

    let accountId = profile.stripeAccountId;

    if (!accountId) {
      const account = await stripe.accounts.create({
        type: "express",
        metadata: { teacher_user_id: userId },
      });
      accountId = account.id;

      await db
        .update(teacherProfilesTable)
        .set({ stripeAccountId: accountId })
        .where(eq(teacherProfilesTable.userId, userId));
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: returnUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    res.json({ onboardingUrl: accountLink.url });
  } catch (err) {
    logger.error({ err }, "Failed to create Connect onboarding link");
    res.status(500).json({ error: "Failed to create onboarding link" });
  }
});

router.get("/stripe/connect/status", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [profile] = await db
    .select()
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, userId));

  if (!profile) {
    res.status(404).json({ error: "Teacher profile not found" });
    return;
  }

  if (!profile.stripeAccountId) {
    res.json({ isConnected: false, isOnboarded: false, stripeAccountId: null });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const [account, balance] = await Promise.all([
      stripe.accounts.retrieve(profile.stripeAccountId),
      stripe.balance.retrieve({}, { stripeAccount: profile.stripeAccountId }).catch(() => null),
    ]);
    const isOnboarded =
      account.details_submitted &&
      !account.requirements?.currently_due?.length;

    if (isOnboarded !== profile.stripeOnboarded) {
      await db
        .update(teacherProfilesTable)
        .set({ stripeOnboarded: !!isOnboarded })
        .where(eq(teacherProfilesTable.userId, userId));
    }

    const usdAvailable = balance?.available?.find(b => b.currency === "usd");
    const usdPending = balance?.pending?.find(b => b.currency === "usd");

    res.json({
      isConnected: true,
      isOnboarded: !!isOnboarded,
      stripeAccountId: profile.stripeAccountId,
      balanceAvailableInCents: usdAvailable?.amount ?? 0,
      balancePendingInCents: usdPending?.amount ?? 0,
      currency: "USD",
    });
  } catch (err) {
    logger.error({ err }, "Failed to retrieve Connect account status");
    res.json({ isConnected: true, isOnboarded: profile.stripeOnboarded, stripeAccountId: profile.stripeAccountId, balanceAvailableInCents: 0, balancePendingInCents: 0, currency: "USD" });
  }
});

router.get("/stripe/connect/dashboard", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [profile] = await db
    .select()
    .from(teacherProfilesTable)
    .where(eq(teacherProfilesTable.userId, userId));

  if (!profile?.stripeAccountId) {
    res.status(400).json({ error: "No Stripe account connected" });
    return;
  }

  try {
    const stripe = await getUncachableStripeClient();
    const loginLink = await stripe.accounts.createLoginLink(profile.stripeAccountId);
    res.json({ dashboardUrl: loginLink.url });
  } catch (err) {
    logger.error({ err }, "Failed to create Express dashboard link");
    res.status(500).json({ error: "Failed to create dashboard link" });
  }
});

export default router;
