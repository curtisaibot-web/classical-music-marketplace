import { pgTable, text, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { listingsTable } from "./listings";
import { usersTable } from "./users";

export const digitalProductsTable = pgTable("digital_products", {
  id: serial("id").primaryKey(),
  listingId: integer("listing_id").notNull().references(() => listingsTable.id, { onDelete: "cascade" }),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category").notNull(), // sheet_music, lesson_plan, backing_track, arrangement, other
  instrument: text("instrument"),
  difficulty: text("difficulty"),
  fileKey: text("file_key"), // object storage key
  fileSize: integer("file_size"), // bytes
  fileType: text("file_type"), // pdf, mp3, zip, etc.
  previewUrl: text("preview_url"),
  downloadCount: integer("download_count").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(false),
  priceInCents: integer("price_in_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertDigitalProductSchema = createInsertSchema(digitalProductsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDigitalProduct = z.infer<typeof insertDigitalProductSchema>;
export type DigitalProduct = typeof digitalProductsTable.$inferSelect;
