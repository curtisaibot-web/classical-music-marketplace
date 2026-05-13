import { pgTable, text, timestamp, integer, serial, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const teacherRecordingsTable = pgTable("teacher_recordings", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  instrument: text("instrument"),
  isEnhanced: boolean("is_enhanced").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type TeacherRecording = typeof teacherRecordingsTable.$inferSelect;
