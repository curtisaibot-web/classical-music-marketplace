import { pgTable, text, timestamp, integer, serial, pgEnum, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const ensembleStatusEnum = pgEnum("ensemble_status", ["pending", "active", "archived"]);
export const ensembleMemberStatusEnum = pgEnum("ensemble_member_status", ["invited", "active", "removed"]);

export const ensemblesTable = pgTable("ensembles", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  bio: text("bio"),
  photoUrl: text("photo_url"),
  leaderId: text("leader_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  city: text("city"),
  genres: text("genres").array().notNull().default([]),
  instruments: text("instruments").array().notNull().default([]),
  recordings: text("recordings").array().notNull().default([]),
  priceInCents: integer("price_in_cents"),
  status: ensembleStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const ensembleMembersTable = pgTable(
  "ensemble_members",
  {
    id: serial("id").primaryKey(),
    ensembleId: integer("ensemble_id").notNull().references(() => ensemblesTable.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "cascade" }),
    inviteEmail: text("invite_email").notNull(),
    splitPercent: integer("split_percent").notNull().default(0),
    status: ensembleMemberStatusEnum("status").notNull().default("invited"),
    inviteToken: text("invite_token"),
    invitedAt: timestamp("invited_at", { withTimezone: true }).notNull().defaultNow(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("ensemble_members_ensemble_id_invite_email_idx").on(t.ensembleId, t.inviteEmail)],
);

export type Ensemble = typeof ensemblesTable.$inferSelect;
export type EnsembleMember = typeof ensembleMembersTable.$inferSelect;
