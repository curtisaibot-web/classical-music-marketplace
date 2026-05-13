import { pgTable, text, timestamp, integer, serial, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const streamTypeEnum = pgEnum("stream_type", ["youtube", "mux"]);

export const liveConcertsTable = pgTable("live_concerts", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  streamUrl: text("stream_url").notNull(),
  streamType: streamTypeEnum("stream_type").notNull().default("youtube"),
  ticketPriceCents: integer("ticket_price_cents").notNull(),
  maxTickets: integer("max_tickets").notNull().default(500),
  soldTickets: integer("sold_tickets").notNull().default(0),
  replayAvailableUntil: timestamp("replay_available_until", { withTimezone: true }),
  imageUrl: text("image_url"),
  isCancelled: boolean("is_cancelled").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertLiveConcertSchema = createInsertSchema(liveConcertsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLiveConcert = z.infer<typeof insertLiveConcertSchema>;
export type LiveConcert = typeof liveConcertsTable.$inferSelect;
