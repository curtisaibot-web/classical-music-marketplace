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
import { ObjectStorageService } from "../lib/objectStorage";

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

router.get("/orders/:id/download", requireAuth, async (req, res): Promise<void> => {
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
    .where(and(eq(ordersTable.id, id), eq(ordersTable.buyerId, userId)));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.type !== "digital_product") {
    res.status(400).json({ error: "This order is not a digital product" });
    return;
  }

  if (order.status !== "paid") {
    res.status(403).json({ error: "Payment required before downloading" });
    return;
  }

  if (!order.digitalProductId) {
    res.status(404).json({ error: "No digital product associated with this order" });
    return;
  }

  if (order.downloadExpiresAt && order.downloadExpiresAt < new Date()) {
    res.status(410).json({ error: "Download link has expired. Please contact the seller." });
    return;
  }

  if ((order.downloadCount ?? 0) >= 1) {
    res.status(403).json({ error: "This download link has already been used. Each purchase allows one download." });
    return;
  }

  const [product] = await db
    .select()
    .from(digitalProductsTable)
    .where(eq(digitalProductsTable.id, order.digitalProductId));

  if (!product?.fileKey) {
    res.status(404).json({ error: "File not found for this product" });
    return;
  }

  try {
    const storageService = new ObjectStorageService();
    const objectPath = product.fileKey;
    const objectFile = await storageService.getObjectEntityFile(objectPath);

    const SIGNED_URL_TTL_SECONDS = 300;

    const signResponse = await fetch("http://127.0.0.1:1106/object-storage/signed-object-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: objectFile.bucket.name,
        object_name: objectFile.name,
        method: "GET",
        expires_at: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!signResponse.ok) {
      req.log.error({ status: signResponse.status }, "Failed to sign download URL");
      res.status(500).json({ error: "Failed to generate download URL" });
      return;
    }

    const { signed_url: signedUrl } = await signResponse.json() as { signed_url: string };

    const [consumed] = await db
      .update(ordersTable)
      .set({ downloadCount: 1 })
      .where(and(eq(ordersTable.id, order.id), eq(ordersTable.downloadCount, 0)))
      .returning({ id: ordersTable.id });

    if (!consumed) {
      res.status(403).json({ error: "This download link has already been used." });
      return;
    }

    res.json({ downloadUrl: signedUrl });
  } catch (err) {
    req.log.error({ err }, "Error generating download URL");
    res.status(500).json({ error: "Failed to generate download URL" });
  }
});

router.post("/orders/:id/refresh-download", requireAuth, async (req, res): Promise<void> => {
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
    .where(and(eq(ordersTable.id, id), eq(ordersTable.buyerId, userId)));

  if (!order) {
    res.status(404).json({ error: "Order not found" });
    return;
  }

  if (order.type !== "digital_product") {
    res.status(400).json({ error: "This order is not a digital product" });
    return;
  }

  if (order.status !== "paid") {
    res.status(403).json({ error: "Payment required before downloading" });
    return;
  }

  if (!order.downloadExpiresAt || order.downloadExpiresAt > new Date()) {
    res.status(409).json({ error: "Download window is still active. Refresh is only available after the link has expired." });
    return;
  }

  const freshExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  const [updated] = await db
    .update(ordersTable)
    .set({ downloadCount: 0, downloadExpiresAt: freshExpiresAt })
    .where(eq(ordersTable.id, order.id))
    .returning();

  res.json(GetOrderResponse.parse(updated));
});

export default router;
