import { pgTable, text, timestamp, integer, serial, pgEnum, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const orgSubscriptionStatusEnum = pgEnum("org_subscription_status", [
  "active",
  "trialing",
  "inactive",
  "cancelled",
]);

export const orgMemberRoleEnum = pgEnum("org_member_role", ["admin", "teacher", "student"]);

export const organisationsTable = pgTable("organisations", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logoUrl: text("logo_url"),
  description: text("description"),
  ownerId: text("owner_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  subscriptionStatus: orgSubscriptionStatusEnum("subscription_status").notNull().default("inactive"),
  defaultLessonRateCents: integer("default_lesson_rate_cents"),
  allowedListingTypes: text("allowed_listing_types").array().notNull().default([]),
  perSeatCents: integer("per_seat_cents").notNull().default(1000),
  isPublicMarketplace: boolean("is_public_marketplace").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const orgMembersTable = pgTable(
  "org_members",
  {
    id: serial("id").primaryKey(),
    orgId: integer("org_id").notNull().references(() => organisationsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    role: orgMemberRoleEnum("role").notNull(),
    invitedByUserId: text("invited_by_user_id").references(() => usersTable.id, { onDelete: "set null" }),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("org_members_org_id_user_id_idx").on(t.orgId, t.userId)],
);

export type Organisation = typeof organisationsTable.$inferSelect;
export type OrgMember = typeof orgMembersTable.$inferSelect;
