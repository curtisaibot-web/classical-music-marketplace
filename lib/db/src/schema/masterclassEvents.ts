import { pgTable, text, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { listingsTable } from "./listings";
import { usersTable } from "./users";

export const masterclassEventsTable = pgTable("masterclass_events", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(90),
  maxPerformers: integer("max_performers").notNull().default(5),
  maxObservers: integer("max_observers").notNull().default(50),
  performerPriceInCents: integer("performer_price_in_cents").notNull(),
  observerPriceInCents: integer("observer_price_in_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  registeredPerformers: integer("registered_performers").notNull().default(0),
  registeredObservers: integer("registered_observers").notNull().default(0),
  meetingUrl: text("meeting_url"),
  recordingUrl: text("recording_url"),
  isLive: boolean("is_live").notNull().default(false),
  isCancelled: boolean("is_cancelled").notNull().default(false),
  instrument: text("instrument"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertMasterclassEventSchema = createInsertSchema(masterclassEventsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertMasterclassEvent = z.infer<typeof insertMasterclassEventSchema>;
export type MasterclassEvent = typeof masterclassEventsTable.$inferSelect;
