import { pgTable, text, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const coachProfilesTable = pgTable("coach_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  bio: text("bio"),
  credentials: text("credentials"),
  specialties: text("specialties").array().notNull().default([]),
  linkedInUrl: text("linkedin_url"),
  approvalStatus: text("approval_status").notNull().default("pending"), // pending | approved | rejected
  sessionRateCents: integer("session_rate_cents"),
  isOnline: boolean("is_online").notNull().default(true),
  city: text("city"),
  country: text("country"),
  profileImageUrl: text("profile_image_url"),
  averageRating: integer("average_rating").notNull().default(0),
  reviewCount: integer("review_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertCoachProfileSchema = createInsertSchema(coachProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCoachProfile = z.infer<typeof insertCoachProfileSchema>;
export type CoachProfile = typeof coachProfilesTable.$inferSelect;
