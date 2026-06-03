import { pgTable, text, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const seoLandingPagesTable = pgTable("seo_landing_pages", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  instrument: text("instrument"),
  city: text("city"),
  country: text("country"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  introCopy: text("intro_copy"),
  isEnabled: boolean("is_enabled").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSeoLandingPageSchema = createInsertSchema(seoLandingPagesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSeoLandingPage = z.infer<typeof insertSeoLandingPageSchema>;
export type SeoLandingPage = typeof seoLandingPagesTable.$inferSelect;
