import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";

export function requireRole(role: "teacher" | "student") {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const auth = getAuth(req);
    if (!auth?.userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Fast path: role is already in Clerk session claims (set on onboarding)
    const claimsRole = (auth.sessionClaims?.publicMetadata as Record<string, unknown> | undefined)?.role as string | undefined;
    if (claimsRole) {
      if (claimsRole !== role) {
        res.status(403).json({ error: `Forbidden: ${role} role required` });
        return;
      }
      next();
      return;
    }

    // Fallback: look up role in DB (for sessions created before metadata was set)
    const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, auth.userId));
    if (!user || user.role !== role) {
      res.status(403).json({ error: `Forbidden: ${role} role required` });
      return;
    }

    next();
  };
}
