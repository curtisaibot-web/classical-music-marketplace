import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, usersTable, teacherProfilesTable, studentProfilesTable } from "@workspace/db";
import { GetMeResponse, OnboardUserBody, OnboardUserResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;

  let [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));

  if (!user) {
    // Auto-create user record on first access
    const [newUser] = await db
      .insert(usersTable)
      .values({
        id: userId,
        email: auth.sessionClaims?.email as string ?? "",
        firstName: auth.sessionClaims?.firstName as string ?? null,
        lastName: auth.sessionClaims?.lastName as string ?? null,
      })
      .onConflictDoUpdate({
        target: usersTable.id,
        set: { updatedAt: new Date() },
      })
      .returning();
    user = newUser;
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

  const [user] = await db
    .insert(usersTable)
    .values({
      id: userId,
      email: auth.sessionClaims?.email as string ?? "",
      firstName: firstName ?? (auth.sessionClaims?.firstName as string ?? null),
      lastName: lastName ?? (auth.sessionClaims?.lastName as string ?? null),
      role,
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        role,
        firstName: firstName ?? (auth.sessionClaims?.firstName as string ?? null),
        lastName: lastName ?? (auth.sessionClaims?.lastName as string ?? null),
        updatedAt: new Date(),
      },
    })
    .returning();

  // Create role-specific profile
  if (role === "teacher") {
    await db
      .insert(teacherProfilesTable)
      .values({ userId })
      .onConflictDoNothing();
  } else if (role === "student") {
    await db
      .insert(studentProfilesTable)
      .values({ userId })
      .onConflictDoNothing();
  }

  res.json(OnboardUserResponse.parse(user));
});

export default router;
