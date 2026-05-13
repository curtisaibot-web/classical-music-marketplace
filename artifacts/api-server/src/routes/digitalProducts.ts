import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, count, ilike, sql, or } from "drizzle-orm";
import { db, digitalProductsTable, listingsTable, teacherProfilesTable, usersTable, ordersTable } from "@workspace/db";
import {
  GetDigitalProductResponse,
  ListDigitalProductsResponse,
  CreateDigitalProductBody,
  UpdateDigitalProductBody,
  ListDigitalProductsQueryParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireRole } from "../middlewares/requireRole";

const router: IRouter = Router();

router.get("/digital-products", async (req, res): Promise<void> => {
  const params = ListDigitalProductsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 20) : 20;
  const offset = params.success ? (params.data.offset ?? 0) : 0;
  const category = params.success ? params.data.category : undefined;
  const instrument = params.success ? params.data.instrument : undefined;
  const q = typeof req.query.q === "string" && req.query.q.trim() ? req.query.q.trim() : undefined;

  const conditions = [eq(digitalProductsTable.isPublished, true)];
  if (category) conditions.push(eq(digitalProductsTable.category, category));
  if (instrument) conditions.push(ilike(digitalProductsTable.instrument, instrument));
  if (q) conditions.push(or(ilike(digitalProductsTable.title, `%${q}%`), ilike(digitalProductsTable.instrument, `%${q}%`))!);

  const where = and(...conditions);

  const [totalRow, rows] = await Promise.all([
    db.select({ count: count() }).from(digitalProductsTable).where(where),
    db
      .select()
      .from(digitalProductsTable)
      .leftJoin(teacherProfilesTable, eq(digitalProductsTable.teacherId, teacherProfilesTable.userId))
      .leftJoin(usersTable, eq(digitalProductsTable.teacherId, usersTable.id))
      .where(where)
      .limit(limit)
      .offset(offset),
  ]);

  const products = rows.map((r) => ({
    ...r.digital_products,
    fileKey: null,
    fileSize: null,
    fileType: null,
    teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
  }));

  res.json(ListDigitalProductsResponse.parse({ products, total: totalRow[0]?.count ?? 0 }));
});

router.get("/digital-products/mine", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const params = ListDigitalProductsQueryParams.safeParse(req.query);
  const limit = params.success ? (params.data.limit ?? 50) : 50;
  const offset = params.success ? (params.data.offset ?? 0) : 0;

  const [totalRow, rows] = await Promise.all([
    db.select({ count: count() }).from(digitalProductsTable).where(eq(digitalProductsTable.teacherId, userId)),
    db
      .select()
      .from(digitalProductsTable)
      .leftJoin(teacherProfilesTable, eq(digitalProductsTable.teacherId, teacherProfilesTable.userId))
      .leftJoin(usersTable, eq(digitalProductsTable.teacherId, usersTable.id))
      .where(eq(digitalProductsTable.teacherId, userId))
      .limit(limit)
      .offset(offset),
  ]);

  const products = rows.map((r) => ({
    ...r.digital_products,
    teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
  }));

  res.json(ListDigitalProductsResponse.parse({ products, total: totalRow[0]?.count ?? 0 }));
});

function validateFileKeyOwnership(fileKey: string | null | undefined, teacherId: string): boolean {
  if (!fileKey) return true;
  const prefix = `/objects/uploads/${teacherId}/`;
  return fileKey.startsWith(prefix);
}

router.get("/digital-products/mine/analytics", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const [orderRows, products] = await Promise.all([
    db
      .select({
        productId: ordersTable.digitalProductId,
        salesCount: count(ordersTable.id),
        totalRevenueCents: sql<number>`coalesce(sum(${ordersTable.priceInCents} - ${ordersTable.platformFeeInCents}), 0)`,
      })
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.sellerId, userId),
          eq(ordersTable.status, "paid"),
          eq(ordersTable.type, "digital_product"),
        ),
      )
      .groupBy(ordersTable.digitalProductId),
    db
      .select({
        id: digitalProductsTable.id,
        title: digitalProductsTable.title,
        category: digitalProductsTable.category,
        downloadCount: digitalProductsTable.downloadCount,
        priceInCents: digitalProductsTable.priceInCents,
      })
      .from(digitalProductsTable)
      .where(eq(digitalProductsTable.teacherId, userId)),
  ]);

  const ordersByProductId = new Map(
    orderRows
      .filter((r) => r.productId != null)
      .map((r) => [r.productId!, r]),
  );

  const byProduct = products.map((p) => {
    const order = ordersByProductId.get(p.id);
    return {
      productId: p.id,
      title: p.title,
      category: p.category,
      downloadCount: p.downloadCount,
      salesCount: order ? Number(order.salesCount) : 0,
      totalRevenueCents: order ? Number(order.totalRevenueCents ?? 0) : 0,
    };
  });

  const totalRevenueCents = byProduct.reduce((s, p) => s + p.totalRevenueCents, 0);
  const totalSalesCount = byProduct.reduce((s, p) => s + p.salesCount, 0);
  const totalDownloadCount = products.reduce((s, p) => s + p.downloadCount, 0);
  const totalProductCount = products.length;

  res.json({ totalRevenueCents, totalSalesCount, totalDownloadCount, totalProductCount, byProduct });
});

router.post("/digital-products", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = CreateDigitalProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { fileKey, fileSize, fileType, isPublished, ...rest } = parsed.data as typeof parsed.data & {
    fileKey?: string;
    fileSize?: number;
    fileType?: string;
    isPublished?: boolean;
  };

  if (!validateFileKeyOwnership(fileKey, userId)) {
    res.status(403).json({ error: "Forbidden: file does not belong to this teacher" });
    return;
  }

  const [listing] = await db
    .insert(listingsTable)
    .values({
      teacherId: userId,
      type: "digital_product",
      status: "active",
      title: rest.title,
      description: rest.description,
      instrument: rest.instrument,
      priceInCents: rest.priceInCents,
      skillLevel: "all",
      tags: [],
      isOnline: true,
    })
    .returning();

  const [product] = await db
    .insert(digitalProductsTable)
    .values({
      ...rest,
      teacherId: userId,
      listingId: listing.id,
      fileKey: fileKey ?? null,
      fileSize: fileSize ?? null,
      fileType: fileType ?? null,
      isPublished: isPublished ?? true,
    })
    .returning();

  res.status(201).json(GetDigitalProductResponse.parse({ ...product, teacher: undefined }));
});

router.get("/digital-products/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const [row] = await db
    .select()
    .from(digitalProductsTable)
    .leftJoin(teacherProfilesTable, eq(digitalProductsTable.teacherId, teacherProfilesTable.userId))
    .leftJoin(usersTable, eq(digitalProductsTable.teacherId, usersTable.id))
    .where(eq(digitalProductsTable.id, id));

  if (!row) {
    res.status(404).json({ error: "Digital product not found" });
    return;
  }

  res.json(GetDigitalProductResponse.parse({ ...row.digital_products, teacher: row.teacher_profiles ? { ...row.teacher_profiles, user: row.users } : undefined }));
});

router.patch("/digital-products/:id", requireAuth, requireRole("teacher"), async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid product id" });
    return;
  }

  const parsed = UpdateDigitalProductBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const patchData = parsed.data as typeof parsed.data & { fileKey?: string };
  if (!validateFileKeyOwnership(patchData.fileKey, userId)) {
    res.status(403).json({ error: "Forbidden: file does not belong to this teacher" });
    return;
  }

  const [product] = await db
    .update(digitalProductsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(digitalProductsTable.id, id), eq(digitalProductsTable.teacherId, userId)))
    .returning();

  if (!product) {
    res.status(404).json({ error: "Digital product not found" });
    return;
  }

  res.json(GetDigitalProductResponse.parse({ ...product, teacher: undefined }));
});

export default router;
