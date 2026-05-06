import { pgTable, text, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const scoresTable = pgTable("scores", {
  id: serial("id").primaryKey(),
  composerId: text("composer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  instrumentation: text("instrumentation").notNull(),
  durationSeconds: integer("duration_seconds"),
  difficulty: text("difficulty").notNull().default("intermediate"),
  genre: text("genre").notNull(),
  description: text("description"),
  previewPdfKey: text("preview_pdf_key"),
  fullPdfKey: text("full_pdf_key"),
  audioDemoKey: text("audio_demo_key"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const scoreLicensesTable = pgTable("score_licenses", {
  id: serial("id").primaryKey(),
  scoreId: integer("score_id").notNull().references(() => scoresTable.id, { onDelete: "cascade" }),
  licenseType: text("license_type").notNull(), // personal | performance | sync
  priceCents: integer("price_cents").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const purchasedLicensesTable = pgTable("purchased_licenses", {
  id: serial("id").primaryKey(),
  scoreId: integer("score_id").notNull().references(() => scoresTable.id, { onDelete: "cascade" }),
  licenseId: integer("license_id").references(() => scoreLicensesTable.id, { onDelete: "set null" }),
  buyerId: text("buyer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  composerId: text("composer_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  licenseType: text("license_type").notNull(),
  priceCents: integer("price_cents").notNull(),
  platformFeeCents: integer("platform_fee_cents").notNull().default(0),
  status: text("status").notNull().default("pending"), // pending | active | expired
  expiresAt: timestamp("expires_at", { withTimezone: true }), // null = perpetual
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  downloadCount: integer("download_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertScoreSchema = createInsertSchema(scoresTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScore = z.infer<typeof insertScoreSchema>;
export type Score = typeof scoresTable.$inferSelect;

export const insertScoreLicenseSchema = createInsertSchema(scoreLicensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScoreLicense = z.infer<typeof insertScoreLicenseSchema>;
export type ScoreLicense = typeof scoreLicensesTable.$inferSelect;

export const insertPurchasedLicenseSchema = createInsertSchema(purchasedLicensesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchasedLicense = z.infer<typeof insertPurchasedLicenseSchema>;
export type PurchasedLicense = typeof purchasedLicensesTable.$inferSelect;
