import { pgTable, text, timestamp, serial, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const reelStatusEnum = pgEnum("reel_status", [
  "uploading",
  "queued",
  "processing",
  "ready",
  "failed",
]);

export const videoReelsTable = pgTable("video_reels", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  rawFileUrl: text("raw_file_url").notNull(),
  processedFileUrl: text("processed_file_url"),
  status: reelStatusEnum("status").notNull().default("queued"),
  genre: text("genre"),
  instruments: text("instruments").array().notNull().default([]),
  webhookSecret: text("webhook_secret").notNull(),
  errorMessage: text("error_message"),
  archivedFileUrl: text("archived_file_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertVideoReelSchema = createInsertSchema(videoReelsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVideoReel = z.infer<typeof insertVideoReelSchema>;
export type VideoReel = typeof videoReelsTable.$inferSelect;
