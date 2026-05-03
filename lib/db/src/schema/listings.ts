import { pgTable, text, timestamp, integer, serial, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const listingTypeEnum = pgEnum("listing_type", ["lesson", "event", "masterclass", "digital_product"]);
export const listingStatusEnum = pgEnum("listing_status", ["active", "inactive", "draft"]);
export const skillLevelEnum = pgEnum("skill_level", ["beginner", "intermediate", "advanced", "all"]);

export const listingsTable = pgTable("listings", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  type: listingTypeEnum("type").notNull(),
  status: listingStatusEnum("status").notNull().default("active"),
  title: text("title").notNull(),
  description: text("description"),
  instrument: text("instrument"),
  skillLevel: skillLevelEnum("skill_level").notNull().default("all"),
  priceInCents: integer("price_in_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  durationMinutes: integer("duration_minutes"), // for lessons/masterclasses
  imageUrl: text("image_url"),
  tags: text("tags").array().notNull().default([]),
  isOnline: boolean("is_online").notNull().default(true),
  city: text("city"),
  country: text("country"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertListingSchema = createInsertSchema(listingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertListing = z.infer<typeof insertListingSchema>;
export type Listing = typeof listingsTable.$inferSelect;
