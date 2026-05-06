import { pgTable, text, timestamp, integer, serial, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { listingsTable } from "./listings";

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
  "completed",
  "refunded",
  "expired",
]);

export const bookingTypeEnum = pgEnum("booking_type", ["lesson", "event"]);

export const bookingsTable = pgTable("bookings", {
  id: serial("id").primaryKey(),
  studentId: text("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  listingId: integer("listing_id").references(() => listingsTable.id, { onDelete: "set null" }),
  type: bookingTypeEnum("type").notNull(),
  status: bookingStatusEnum("status").notNull().default("pending"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  durationMinutes: integer("duration_minutes"),
  priceInCents: integer("price_in_cents").notNull(),
  platformFeeInCents: integer("platform_fee_in_cents").notNull().default(0),
  currency: text("currency").notNull().default("USD"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  notes: text("notes"),
  meetingUrl: text("meeting_url"),
  instrument: text("instrument"),
  eventType: text("event_type"), // for event bookings: wedding, corporate, concert, etc.
  eventDate: timestamp("event_date", { withTimezone: true }),
  eventLocation: text("event_location"),
  headcount: integer("headcount"), // expected guest count for event bookings
  surgePercent: integer("surge_percent"),
  surgeAmountInCents: integer("surge_amount_in_cents"),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;
