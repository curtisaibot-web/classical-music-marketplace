import { pgTable, text, timestamp, integer, serial, json, boolean, jsonb, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const practiceProfilesTable = pgTable("practice_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  instruments: json("instruments").$type<string[]>().notNull().default([]),
  skillLevel: text("skill_level").notNull().default("intermediate"), // beginner | intermediate | advanced | professional
  goals: json("goals").$type<string[]>().notNull().default([]), // technique | repertoire | sight-reading | chamber-music | performance | theory
  availabilitySlots: json("availability_slots").$type<Array<{ day: string; time: string }>>().notNull().default([]),
  sessionFormat: text("session_format").notNull().default("either"), // video-call | in-person | either
  bio: text("bio"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const practicePartnershipsTable = pgTable("practice_partnerships", {
  id: serial("id").primaryKey(),
  requesterId: text("requester_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  status: text("status").notNull().default("pending"), // pending | active | dissolved
  matchScore: integer("match_score").notNull().default(0),
  matchReason: text("match_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const practiceSessionsTable = pgTable("practice_sessions", {
  id: serial("id").primaryKey(),
  partnershipId: integer("partnership_id").notNull().references(() => practicePartnershipsTable.id, { onDelete: "cascade" }),
  proposedById: text("proposed_by_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  proposedAt: timestamp("proposed_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  joinLink: text("join_link"),
  status: text("status").notNull().default("proposed"), // proposed | confirmed | completed | cancelled
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertPracticeProfileSchema = createInsertSchema(practiceProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPracticeProfile = z.infer<typeof insertPracticeProfileSchema>;
export type PracticeProfile = typeof practiceProfilesTable.$inferSelect;

export const insertPracticePartnershipSchema = createInsertSchema(practicePartnershipsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPracticePartnership = z.infer<typeof insertPracticePartnershipSchema>;
export type PracticePartnership = typeof practicePartnershipsTable.$inferSelect;

export const insertPracticeSessionSchema = createInsertSchema(practiceSessionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPracticeSession = z.infer<typeof insertPracticeSessionSchema>;
export type PracticeSession = typeof practiceSessionsTable.$inferSelect;

export const practiceSessionCompletionsTable = pgTable("practice_session_completions", {
  id: serial("id").primaryKey(),
  sessionId: integer("session_id").notNull().references(() => practiceSessionsTable.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  notes: text("notes"),
  completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique().on(t.sessionId, t.userId)]);

export const insertPracticeSessionCompletionSchema = createInsertSchema(practiceSessionCompletionsTable).omit({ id: true, completedAt: true });
export type InsertPracticeSessionCompletion = z.infer<typeof insertPracticeSessionCompletionSchema>;
export type PracticeSessionCompletion = typeof practiceSessionCompletionsTable.$inferSelect;
