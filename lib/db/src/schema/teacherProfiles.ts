import { pgTable, text, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { organisationsTable } from "./organisations";

export const teacherProfilesTable = pgTable("teacher_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  bio: text("bio"),
  instruments: text("instruments").array().notNull().default([]),
  genres: text("genres").array().notNull().default([]),
  city: text("city"),
  country: text("country"),
  timezone: text("timezone"),
  hourlyRate: integer("hourly_rate"), // in cents
  currency: text("currency").notNull().default("USD"),
  yearsExperience: integer("years_experience"),
  education: text("education"),
  stripeAccountId: text("stripe_account_id"),
  stripeOnboarded: boolean("stripe_onboarded").notNull().default(false),
  averageRating: integer("average_rating").notNull().default(0), // stored as integer * 100 (e.g. 450 = 4.5)
  reviewCount: integer("review_count").notNull().default(0),
  isVerified: boolean("is_verified").notNull().default(false),
  profileSlug: text("profile_slug").unique(),
  profileImageUrl: text("profile_image_url"),
  websiteUrl: text("website_url"),
  videoIntroUrl: text("video_intro_url"),
  lastMinuteAvailable: boolean("last_minute_available").notNull().default(false),
  lastMinuteFromDate: timestamp("last_minute_from_date", { withTimezone: true }),
  lastMinuteToDate: timestamp("last_minute_to_date", { withTimezone: true }),
  minNoticeHours: integer("min_notice_hours").notNull().default(72),
  cancellationPolicyHours: integer("cancellation_policy_hours").notNull().default(24),
  cancellationFeePercent: integer("cancellation_fee_percent").notNull().default(50),
  orgId: integer("org_id").references(() => organisationsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTeacherProfileSchema = createInsertSchema(teacherProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTeacherProfile = z.infer<typeof insertTeacherProfileSchema>;
export type TeacherProfile = typeof teacherProfilesTable.$inferSelect;
