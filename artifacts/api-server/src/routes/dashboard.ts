import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq, and, or, gte } from "drizzle-orm";
import {
  db,
  bookingsTable,
  ordersTable,
  reviewsTable,
  listingsTable,
  masterclassEventsTable,
  teacherProfilesTable,
  usersTable,
  digitalProductsTable,
} from "@workspace/db";
import {
  GetTeacherDashboardResponse,
  GetStudentDashboardResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get("/dashboard/teacher", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const now = new Date();

  const [upcomingBookingsRows, recentReviewsRows, allOrders, allBookings, activeListings, upcomingMasterclassRows] =
    await Promise.all([
      db
        .select()
        .from(bookingsTable)
        .where(and(eq(bookingsTable.teacherId, userId), gte(bookingsTable.scheduledAt, now)))
        .limit(10),
      db
        .select()
        .from(reviewsTable)
        .leftJoin(usersTable, eq(reviewsTable.reviewerId, usersTable.id))
        .where(and(eq(reviewsTable.teacherId, userId), eq(reviewsTable.isPublished, true)))
        .limit(5),
      db
        .select()
        .from(ordersTable)
        .where(and(eq(ordersTable.sellerId, userId), eq(ordersTable.status, "paid"))),
      db
        .select()
        .from(bookingsTable)
        .where(and(eq(bookingsTable.teacherId, userId), eq(bookingsTable.status, "completed"))),
      db
        .select()
        .from(listingsTable)
        .where(and(eq(listingsTable.teacherId, userId), eq(listingsTable.status, "active"))),
      db
        .select()
        .from(masterclassEventsTable)
        .leftJoin(teacherProfilesTable, eq(masterclassEventsTable.teacherId, teacherProfilesTable.userId))
        .leftJoin(usersTable, eq(masterclassEventsTable.teacherId, usersTable.id))
        .where(and(eq(masterclassEventsTable.teacherId, userId), gte(masterclassEventsTable.scheduledAt, now)))
        .limit(5),
    ]);

  const totalEarningsInCents = allOrders.reduce((sum, o) => sum + o.priceInCents - o.platformFeeInCents, 0);
  const uniqueStudents = new Set(allBookings.map((b) => b.studentId));

  const teacherProfile = await db.select().from(teacherProfilesTable).where(eq(teacherProfilesTable.userId, userId));

  const dashboard = {
    upcomingBookings: upcomingBookingsRows.map((b) => ({ ...b, teacher: undefined })),
    recentReviews: recentReviewsRows.map((r) => ({ ...r.reviews, reviewer: r.users })),
    totalEarningsInCents,
    totalStudents: uniqueStudents.size,
    totalLessonsCompleted: allBookings.length,
    averageRating: teacherProfile[0]?.averageRating ?? 0,
    activeListingsCount: activeListings.length,
    upcomingMasterclasses: upcomingMasterclassRows.map((r) => ({
      ...r.masterclass_events,
      teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
    })),
  };

  res.json(GetTeacherDashboardResponse.parse(dashboard));
});

router.get("/dashboard/student", requireAuth, async (req, res): Promise<void> => {
  const auth = getAuth(req);
  const userId = auth.userId!;
  const now = new Date();

  const [upcomingBookingsRows, recentOrdersRows, registeredMasterclassRows, completedBookings] =
    await Promise.all([
      db
        .select()
        .from(bookingsTable)
        .leftJoin(teacherProfilesTable, eq(bookingsTable.teacherId, teacherProfilesTable.userId))
        .leftJoin(usersTable, eq(bookingsTable.teacherId, usersTable.id))
        .where(and(eq(bookingsTable.studentId, userId), gte(bookingsTable.scheduledAt, now)))
        .limit(10),
      db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.buyerId, userId))
        .limit(10),
      db
        .select()
        .from(ordersTable)
        .innerJoin(masterclassEventsTable, eq(ordersTable.masterclassEventId, masterclassEventsTable.id))
        .leftJoin(teacherProfilesTable, eq(masterclassEventsTable.teacherId, teacherProfilesTable.userId))
        .leftJoin(usersTable, eq(masterclassEventsTable.teacherId, usersTable.id))
        .where(and(eq(ordersTable.buyerId, userId), or(eq(ordersTable.type, "masterclass_performer"), eq(ordersTable.type, "masterclass_observer"))))
        .limit(10),
      db
        .select()
        .from(bookingsTable)
        .where(and(eq(bookingsTable.studentId, userId), eq(bookingsTable.status, "completed"))),
    ]);

  const totalSpentInCents = recentOrdersRows
    .filter((o) => o.status === "paid")
    .reduce((sum, o) => sum + o.priceInCents, 0);

  const dashboard = {
    upcomingBookings: upcomingBookingsRows.map((r) => ({
      ...r.bookings,
      teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
    })),
    recentOrders: recentOrdersRows,
    registeredMasterclasses: registeredMasterclassRows.map((r) => ({
      ...r.masterclass_events,
      order: r.orders,
      teacher: r.teacher_profiles ? { ...r.teacher_profiles, user: r.users } : undefined,
    })),
    lessonsCompleted: completedBookings.length,
    totalSpentInCents,
    favouriteTeachers: [],
  };

  res.json(GetStudentDashboardResponse.parse(dashboard));
});

export default router;
