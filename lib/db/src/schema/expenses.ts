import { pgTable, text, timestamp, integer, serial } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  amountInCents: integer("amount_in_cents").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  date: timestamp("date", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Expense = typeof expensesTable.$inferSelect;
