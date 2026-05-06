import { pgTable, text, timestamp, serial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { organisationsTable } from "./organisations";

export const studentProfilesTable = pgTable("student_profiles", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }).unique(),
  bio: text("bio"),
  instruments: text("instruments").array().notNull().default([]),
  skillLevel: text("skill_level"), // beginner, intermediate, advanced
  city: text("city"),
  country: text("country"),
  timezone: text("timezone"),
  learningGoals: text("learning_goals"),
  ageGroup: text("age_group"), // child, teen, adult, senior
  lessonsCompleted: integer("lessons_completed").notNull().default(0),
  orgId: integer("org_id").references(() => organisationsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertStudentProfileSchema = createInsertSchema(studentProfilesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertStudentProfile = z.infer<typeof insertStudentProfileSchema>;
export type StudentProfile = typeof studentProfilesTable.$inferSelect;
