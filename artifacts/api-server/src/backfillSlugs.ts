import { isNull, eq } from "drizzle-orm";
import { db, teacherProfilesTable, usersTable } from "@workspace/db";
import { logger } from "./lib/logger";

function buildAutoSlug(
  firstName: string | null,
  lastName: string | null,
  userId: string,
  attempt = 0,
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
  return attempt === 0 ? `${base}-${suffix}` : `${base}-${suffix}-${attempt}`;
}

async function generateUniqueSlug(
  firstName: string | null,
  lastName: string | null,
  userId: string,
): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = buildAutoSlug(firstName, lastName, userId, attempt);
    const conflict = await db
      .select({ userId: teacherProfilesTable.userId })
      .from(teacherProfilesTable)
      .where(eq(teacherProfilesTable.profileSlug, candidate))
      .limit(1);
    if (conflict.length === 0 || conflict[0]?.userId === userId) return candidate;
  }
  return `musician-${userId.slice(-12).toLowerCase().replace(/[^a-z0-9]/g, "x")}`;
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
      const slug = await generateUniqueSlug(
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
