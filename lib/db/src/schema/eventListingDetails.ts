import { pgTable, text, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { listingsTable } from "./listings";
import { usersTable } from "./users";

export const eventListingDetailsTable = pgTable("event_listing_details", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().unique().references(() => listingsTable.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  eventTypes: text("event_types").array().notNull().default([]),
  venueTypes: text("venue_types").array().notNull().default([]),
  minHeadcount: integer("min_headcount"),
  maxHeadcount: integer("max_headcount"),
  travelRadiusMiles: integer("travel_radius_miles"),
  requiresDeposit: boolean("requires_deposit").notNull().default(false),
  depositPercent: integer("deposit_percent"),
  repertoire: text("repertoire"),
  setupTimeMinutes: integer("setup_time_minutes"),
  performanceDurationMinutes: integer("performance_duration_minutes"),
  additionalInfo: text("additional_info"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertEventListingDetailsSchema = createInsertSchema(eventListingDetailsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertEventListingDetails = z.infer<typeof insertEventListingDetailsSchema>;
export type EventListingDetails = typeof eventListingDetailsTable.$inferSelect;
