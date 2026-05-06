import { pgTable, text, timestamp, integer, serial, pgEnum } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const campaignStatusEnum = pgEnum("campaign_status", [
  "active",
  "succeeded",
  "failed",
  "cancelled",
]);

export const ticketStatusEnum = pgEnum("ticket_status", [
  "authorised",
  "captured",
  "cancelled",
]);

export const concertCampaignsTable = pgTable("concert_campaigns", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  coverImageUrl: text("cover_image_url"),
  scheduledDate: text("scheduled_date"),
  venueName: text("venue_name"),
  ticketPriceCents: integer("ticket_price_cents").notNull(),
  goalCount: integer("goal_count").notNull(),
  deadlineAt: timestamp("deadline_at", { withTimezone: true }).notNull(),
  status: campaignStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const campaignTicketsTable = pgTable("campaign_tickets", {
  id: serial("id").primaryKey(),
  campaignId: integer("campaign_id").notNull().references(() => concertCampaignsTable.id, { onDelete: "cascade" }),
  buyerId: text("buyer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  buyerEmail: text("buyer_email"),
  buyerName: text("buyer_name"),
  quantity: integer("quantity").notNull().default(1),
  totalPriceCents: integer("total_price_cents").notNull(),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  accessCode: text("access_code"),
  status: ticketStatusEnum("status").notNull().default("authorised"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export type ConcertCampaign = typeof concertCampaignsTable.$inferSelect;
export type CampaignTicket = typeof campaignTicketsTable.$inferSelect;
