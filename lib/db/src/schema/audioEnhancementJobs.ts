import { pgTable, text, timestamp, integer, serial } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const audioEnhancementJobsTable = pgTable("audio_enhancement_jobs", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  inputFileKey: text("input_file_key").notNull(),
  outputFileKey: text("output_file_key"),
  level: text("level", { enum: ["standard", "professional"] }).notNull(),
  status: text("status", { enum: ["pending", "processing", "done", "failed"] }).notNull().default("pending"),
  pricePaidCents: integer("price_paid_cents").notNull(),
  stripeCheckoutSessionId: text("stripe_checkout_session_id"),
  stripePaymentIntentId: text("stripe_payment_intent_id"),
  externalJobId: text("external_job_id"),
  webhookSecret: text("webhook_secret").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
});

export type AudioEnhancementJob = typeof audioEnhancementJobsTable.$inferSelect;
