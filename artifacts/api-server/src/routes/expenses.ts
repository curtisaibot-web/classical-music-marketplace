import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, gte, lte } from "drizzle-orm";
import { db, expensesTable } from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";
import { isProSubscriber } from "./subscriptions";

const router: IRouter = Router();

const EXPENSE_CATEGORIES = [
  "Instrument Repair",
  "Music Scores & Books",
  "Travel",
  "Accommodation",
  "Equipment",
  "Recording",
  "Marketing",
  "Software",
  "Professional Development",
  "Studio Rental",
  "Insurance",
  "Other",
];

router.get("/expenses/categories", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }
  res.json({ categories: EXPENSE_CATEGORIES });
});

router.get("/expenses", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  const { month, year } = req.query as { month?: string; year?: string };

  const conditions = [eq(expensesTable.teacherId, userId)];

  if (month && year) {
    const m = parseInt(month, 10);
    const y = parseInt(year, 10);
    if (!isNaN(m) && !isNaN(y)) {
      const from = new Date(y, m - 1, 1);
      const to = new Date(y, m, 1);
      conditions.push(gte(expensesTable.date, from));
      conditions.push(lte(expensesTable.date, to));
    }
  }

  const expenses = await db
    .select()
    .from(expensesTable)
    .where(and(...conditions))
    .orderBy(expensesTable.date);

  const totalInCents = expenses.reduce((s, e) => s + e.amountInCents, 0);

  const byCategory: Record<string, number> = {};
  for (const e of expenses) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + e.amountInCents;
  }

  res.json({ expenses, totalInCents, byCategory });
});

router.post("/expenses", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  const { amountInCents, category, description, date } = req.body as {
    amountInCents: number;
    category: string;
    description?: string;
    date: string;
  };

  if (!amountInCents || amountInCents <= 0) {
    res.status(400).json({ error: "amountInCents must be a positive number" });
    return;
  }
  if (!category) {
    res.status(400).json({ error: "category is required" });
    return;
  }
  if (!date) {
    res.status(400).json({ error: "date is required" });
    return;
  }

  const parsedDate = new Date(date);
  if (isNaN(parsedDate.getTime())) {
    res.status(400).json({ error: "date must be a valid date string" });
    return;
  }

  const [expense] = await db
    .insert(expensesTable)
    .values({
      teacherId: userId,
      amountInCents,
      category,
      description,
      date: parsedDate,
    })
    .returning();

  res.status(201).json({ expense });
});

router.put("/expenses/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  const { amountInCents, category, description, date } = req.body as {
    amountInCents?: number;
    category?: string;
    description?: string;
    date?: string;
  };

  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (amountInCents !== undefined) update.amountInCents = amountInCents;
  if (category !== undefined) update.category = category;
  if (description !== undefined) update.description = description;
  if (date !== undefined) {
    const d = new Date(date);
    if (!isNaN(d.getTime())) update.date = d;
  }

  const [updated] = await db
    .update(expensesTable)
    .set(update)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.teacherId, userId)))
    .returning();

  if (!updated) { res.status(404).json({ error: "Expense not found" }); return; }

  res.json({ expense: updated });
});

router.delete("/expenses/:id", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }

  if (!await isProSubscriber(userId)) {
    res.status(403).json({ error: "Business Suite subscription required" });
    return;
  }

  await db
    .delete(expensesTable)
    .where(and(eq(expensesTable.id, id), eq(expensesTable.teacherId, userId)));

  res.status(204).end();
});

export default router;
