import { pgTable, text, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { verificationStatusEnum } from "./teacherProfiles";

export const teacherVerificationDocumentsTable = pgTable("teacher_verification_documents", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  documentType: text("document_type").notNull(), // degree, certification, orchestra_roster, identity, other
  fileKey: text("file_key"),
  publicNote: text("public_note"),
  status: verificationStatusEnum("status").notNull().default("pending"),
  reviewerNotes: text("reviewer_notes"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertTeacherVerificationDocumentSchema = createInsertSchema(teacherVerificationDocumentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTeacherVerificationDocument = z.infer<typeof insertTeacherVerificationDocumentSchema>;
export type TeacherVerificationDocument = typeof teacherVerificationDocumentsTable.$inferSelect;
