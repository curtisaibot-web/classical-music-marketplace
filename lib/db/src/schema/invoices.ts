import { pgTable, text, timestamp, integer, serial, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const invoiceStatusEnum = pgEnum("invoice_status", [
  "draft",
  "sent",
  "paid",
]);

export const invoicesTable = pgTable("invoices", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  bookingId: integer("booking_id"),
  clientEmail: text("client_email").notNull(),
  clientName: text("client_name").notNull(),
  amountInCents: integer("amount_in_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: invoiceStatusEnum("status").notNull().default("draft"),
  notes: text("notes"),
  paymentNote: text("payment_note"),
  lineItems: jsonb("line_items").notNull().default([]),
  dueDate: timestamp("due_date", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Invoice = typeof invoicesTable.$inferSelect;
