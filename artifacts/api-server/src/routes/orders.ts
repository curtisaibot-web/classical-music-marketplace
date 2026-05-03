import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or } from "drizzle-orm";
import { db, ordersTable, digitalProductsTable, masterclassEventsTable } from "@workspace/db";
import {
  GetOrderResponse,
  ListOrdersResponse,
  CreateOrderBody,
  ListOrdersQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const PLATFORM_FEE_RATE = 0.15;

const router: IRouter = Router();

router.get("/orders", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const params = ListOrdersQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const orders = await db
    .select()
    .from(ordersTable)
    .where(or(eq(ordersTable.buyerId, userId), eq(ordersTable.sellerId, userId)))
    .limit(limit)
    .offset(offset);

  res.json(ListOrdersResponse.parse({ orders, total: orders.length }));
});

router.post("/orders", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let priceInCents = 0;
  let sellerId = "";

  if (parsed.data.type === "digital_product" && parsed.data.digitalProductId) {
    const [product] = await db
      .select()
      .from(digitalProductsTable)
      .where(eq(digitalProductsTable.id, parsed.data.digitalProductId));
    if (!product) {
      res.status(404).json({ error: "Digital product not found" });
      return;
    }
    priceInCents = product.priceInCents;
    sellerId = product.teacherId;
  } else if (parsed.data.masterclassEventId) {
    const [event] = await db
      .select()
      .from(masterclassEventsTable)
      .where(eq(masterclassEventsTable.id, parsed.data.masterclassEventId));
    if (!event) {
      res.status(404).json({ error: "Masterclass not found" });
      return;
    }
    priceInCents = parsed.data.type === "masterclass_performer"
      ? event.performerPriceInCents
      : event.observerPriceInCents;
    sellerId = event.teacherId;
  }

  if (!sellerId) {
    res.status(400).json({ error: "Could not determine seller" });
    return;
  }

  const platformFeeInCents = Math.round(priceInCents * PLATFORM_FEE_RATE);

  const [order] = await db
    .insert(ordersTable)
    .values({
      ...parsed.data,
      buyerId: userId,
      sellerId,
      priceInCents,
      platformFeeInCents,
    })
    .returning();

  res.status(201).json(GetOrderResponse.parse(order));
});

router.get("/orders/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid order id" });
    return;
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(and(
      eq(ordersTable.id, id),
      or(eq(ordersTable.buyerId, userId), eq(ordersTable.sellerId, userId)),
    ));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  res.json(GetOrderResponse.parse(order));
});

export default router;
