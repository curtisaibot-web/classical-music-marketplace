import { pgTable, text, timestamp, serial, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  "active",
  "past_due",
  "cancelled",
  "trialing",
  "incomplete",
]);

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  stripeSubscriptionId: text("stripe_subscription_id"),
  stripeCustomerId: text("stripe_customer_id"),
  stripePriceId: text("stripe_price_id"),
  status: subscriptionStatusEnum("status").notNull().default("incomplete"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptionsTable.$inferSelect;
