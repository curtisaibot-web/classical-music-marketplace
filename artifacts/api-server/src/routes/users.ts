import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable, teacherProfilesTable, studentProfilesTable } from "@workspace/db";
import { GetMeResponse, OnboardUserBody, OnboardUserResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

type ResolvedClerkData = {
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: "teacher" | "student" | null;
};

async function resolveClerkData(
  userId: string,
  auth: ReturnType<typeof getAuth>
): Promise<ResolvedClerkData> {
  const claimsEmail = auth.sessionClaims?.email as string | undefined;
  const claimsFirst = auth.sessionClaims?.firstName as string | undefined ?? null;
  const claimsLast = auth.sessionClaims?.lastName as string | undefined ?? null;
  const claimsRole = (auth.sessionClaims?.publicMetadata as Record<string, unknown> | undefined)
    ?.role as "teacher" | "student" | null | undefined ?? null;

  if (claimsEmail && claimsRole) {
    return { email: claimsEmail, firstName: claimsFirst, lastName: claimsLast, role: claimsRole };
  }

  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    const apiRole = (clerkUser.publicMetadata?.role as "teacher" | "student" | undefined) ?? null;
    return {
      email: claimsEmail || clerkUser.emailAddresses?.[0]?.emailAddress || `${userId}@placeholder.invalid`,
      firstName: claimsFirst || clerkUser.firstName || null,
      lastName: claimsLast || clerkUser.lastName || null,
      role: claimsRole ?? apiRole,
    };
  } catch {
    return {
      email: claimsEmail || `${userId}@placeholder.invalid`,
      firstName: claimsFirst,
      lastName: claimsLast,
      role: claimsRole,
    };
  }
}

function generateSlug(firstName: string | null, lastName: string | null, suffix: string): string {
  const base = `${firstName ?? ""} ${lastName ?? ""}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "musician";
  return `${base}-${suffix}`;
}

async function ensureRoleProfile(
  userId: string,
  role: "teacher" | "student" | null,
  firstName?: string | null,
  lastName?: string | null
): Promise<void> {
  if (role === "teacher") {
    const suffix = userId.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, "x");
    const slug = generateSlug(firstName ?? null, lastName ?? null, suffix);
    await db.insert(teacherProfilesTable).values({ userId, profileSlug: slug }).onConflictDoNothing();
  } else if (role === "student") {
    await db.insert(studentProfilesTable).values({ userId }).onConflictDoNothing();
  }
}

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  let [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  if (!user) {
    const clerkData = await resolveClerkData(userId, auth);
    const [newUser] = await db
      .insert(usersTable)
      .values({
        id: userId,
        email: clerkData.email,
        firstName: clerkData.firstName,
        lastName: clerkData.lastName,
        role: clerkData.role,
      })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { updatedAt: new Date() },
      })
      .returning();
    user = newUser;
    await ensureRoleProfile(userId, clerkData.role, clerkData.firstName, clerkData.lastName);
  } else if (!user.role) {
    const clerkData = await resolveClerkData(userId, auth);
    if (clerkData.role) {
      const [updated] = await db
        .update(usersTable)
        .set({ role: clerkData.role, updatedAt: new Date() })
        .where(eq(usersTable.id, userId))
        .returning();
      user = updated ?? user;
      await ensureRoleProfile(userId, clerkData.role, clerkData.firstName, clerkData.lastName);
    }
  }

  res.json(GetMeResponse.parse(user));
});

router.post("/users/me/onboard", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  const parsed = OnboardUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { role, firstName, lastName } = parsed.data;
  const clerkData = await resolveClerkData(userId, auth);

  const resolvedFirst = firstName ?? clerkData.firstName;
  const resolvedLast = lastName ?? clerkData.lastName;

  const [user] = await db
    .insert(usersTable)
    .values({
      id: userId,
      email: clerkData.email,
      firstName: resolvedFirst,
      lastName: resolvedLast,
      role,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        role,
        firstName: resolvedFirst,
        lastName: resolvedLast,
        updatedAt: new Date(),
      },
    })
    .returning();

  await clerkClient.users.updateUserMetadata(userId, {
    publicMetadata: { role },
  });

  await ensureRoleProfile(userId, role, resolvedFirst, resolvedLast);

  res.json(OnboardUserResponse.parse(user));
});

export default router;
