import { pgTable, text, timestamp, integer, serial, pgEnum, boolean, unique } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

export const targetLevelEnum = pgEnum("target_level", [
  "undergraduate",
  "postgrad",
  "professional_orchestra",
]);

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "pending",
  "active",
  "completed",
  "cancelled",
]);

export const auditionProgramsTable = pgTable("audition_programs", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  instrument: text("instrument").notNull(),
  targetLevel: targetLevelEnum("target_level").notNull(),
  sessionCount: integer("session_count").notNull(),
  priceCents: integer("price_cents").notNull(),
  syllabusText: text("syllabus_text"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const programEnrollmentsTable = pgTable("program_enrollments", {
  id: serial("id").primaryKey(),
  programId: integer("program_id").notNull().references(() => auditionProgramsTable.id, { onDelete: "cascade" }),
  studentId: text("student_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sessionsCompleted: integer("sessions_completed").notNull().default(0),
  status: enrollmentStatusEnum("status").notNull().default("pending"),
  orderId: integer("order_id").references(() => ordersTable.id, { onDelete: "set null" }),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const programSessionNotesTable = pgTable(
  "program_session_notes",
  {
    id: serial("id").primaryKey(),
    enrollmentId: integer("enrollment_id").notNull().references(() => programEnrollmentsTable.id, { onDelete: "cascade" }),
    sessionNumber: integer("session_number").notNull(),
    teacherNote: text("teacher_note"),
    feedbackFileKey: text("feedback_file_key"),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("program_session_notes_enrollment_session_uniq").on(t.enrollmentId, t.sessionNumber)],
);

export type AuditionProgram = typeof auditionProgramsTable.$inferSelect;
export type ProgramEnrollment = typeof programEnrollmentsTable.$inferSelect;
export type ProgramSessionNote = typeof programSessionNotesTable.$inferSelect;
