import { pgTable, text, timestamp, serial, pgEnum, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const contractStatusEnum = pgEnum("contract_status", [
  "draft",
  "sent",
  "signed",
]);

export const contractTemplateEnum = pgEnum("contract_template", [
  "lesson_package",
  "single_event",
  "masterclass",
]);

export const contractsTable = pgTable("contracts", {
  id: serial("id").primaryKey(),
  teacherId: text("teacher_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  templateType: contractTemplateEnum("template_type").notNull(),
  title: text("title").notNull(),
  fields: jsonb("fields").notNull().default({}),
  clientEmail: text("client_email"),
  clientName: text("client_name"),
  status: contractStatusEnum("status").notNull().default("draft"),
  signToken: text("sign_token"),
  signedAt: timestamp("signed_at", { withTimezone: true }),
  signerName: text("signer_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Contract = typeof contractsTable.$inferSelect;
