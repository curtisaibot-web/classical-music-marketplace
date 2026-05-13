import { pgTable, text, timestamp, integer, serial, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ensemblesTable } from "./ensembles";
import { bookingsTable } from "./bookings";

export const payoutStatusEnum = pgEnum("payout_status", ["pending", "completed", "failed"]);

export const payoutsTable = pgTable("payouts", {
  id: serial("id").primaryKey(),
  bookingId: integer("booking_id").notNull().references(() => bookingsTable.id, { onDelete: "cascade" }),
  ensembleId: integer("ensemble_id").notNull().references(() => ensemblesTable.id, { onDelete: "cascade" }),
  memberId: text("member_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  splitPercent: integer("split_percent").notNull(),
  grossAmountCents: integer("gross_amount_cents").notNull(),
  platformFeePortionCents: integer("platform_fee_portion_cents").notNull(),
  netAmountCents: integer("net_amount_cents").notNull(),
  stripeTransferId: text("stripe_transfer_id"),
  status: payoutStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Payout = typeof payoutsTable.$inferSelect;
