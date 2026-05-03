import { pgTable, text, timestamp, integer, serial, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { digitalProductsTable } from "./digitalProducts";
import { masterclassEventsTable } from "./masterclassEvents";

export const orderStatusEnum = pgEnum("order_status", [
  "pending",
  "paid",
  "refunded",
  "failed",
]);

export const orderTypeEnum = pgEnum("order_type", ["digital_product", "masterclass_performer", "masterclass_observer"]);

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  buyerId: text("buyer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sellerId: text("seller_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: orderTypeEnum("type").notNull(),
  status: orderStatusEnum("status").notNull().default("pending"),
  digitalProductId: integer("digital_product_id").references(() => digitalProductsTable.id, { onDelete: "set null" }),
  masterclassEventId: integer("masterclass_event_id").references(() => masterclassEventsTable.id, { onDelete: "set null" }),
  priceInCents: integer("price_in_cents").notNull(),
  platformFeeInCents: integer("platform_fee_in_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  downloadUrl: text("download_url"), // signed, expiring URL
  downloadExpiresAt: timestamp("download_expires_at", { withTimezone: true }),
  downloadCount: integer("download_count").notNull().default(0),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
