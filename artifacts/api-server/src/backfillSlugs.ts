import { isNull, eq } from "drizzle-orm";
import { db, teacherProfilesTable, usersTable } from "@workspace/db";
import { logger } from "./lib/logger";

function buildAutoSlug(
  firstName: string | null,
  lastName: string | null,
  userId: string,
): string {
  const suffix = userId
    .slice(-6)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "x");
  const base =
    `${firstName ?? ""} ${lastName ?? ""}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "musician";
  return `${base}-${suffix}`;
}

export async function backfillMissingProfileSlugs(): Promise<void> {
  try {
    const rows = await db
      .select({
        userId: teacherProfilesTable.userId,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(teacherProfilesTable)
      .leftJoin(usersTable, eq(teacherProfilesTable.userId, usersTable.id))
      .where(isNull(teacherProfilesTable.profileSlug));

    if (rows.length === 0) return;

    logger.info({ count: rows.length }, "Backfilling profile slugs for teachers with null slug");

    for (const row of rows) {
      const slug = buildAutoSlug(
        row.firstName ?? null,
        row.lastName ?? null,
        row.userId,
      );
      await db
        .update(teacherProfilesTable)
        .set({ profileSlug: slug, updatedAt: new Date() })
        .where(eq(teacherProfilesTable.userId, row.userId));
    }

    logger.info({ count: rows.length }, "Profile slug backfill complete");
  } catch (err) {
    logger.warn({ err }, "Profile slug backfill failed — continuing startup");
  }
}
