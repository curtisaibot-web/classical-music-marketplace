import { Link } from "wouter";
import { useGetStudentDashboard, useListBookings, useListMyEnrollments } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, CreditCard, Music, Star, Clock, MessageSquare, Users } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiFetch(path: string) {
  return fetch(`${BASE}/api${path}`, { credentials: "include" });
}

type DashPartnership = {
  id: number; status: string; isRequester: boolean;
  partner: { firstName: string | null; lastName: string | null } | null;
  partnerProfile: { instruments: string[]; skillLevel: string } | null;
};

function usePartnerSessions(partnershipId: number) {
  return useQuery({
    queryKey: ["practice", "sessions", partnershipId],
    queryFn: async () => {
      const res = await apiFetch(`/practice/partnerships/${partnershipId}/sessions`);
      if (!res.ok) return null;
      return res.json() as Promise<{ sessions: Array<{ id: number; status: string; proposedAt: string; proposedById: string }> }>;
    },
  });
}

function ActivePartnerRow({ partnership }: { partnership: DashPartnership }) {
  const { data } = usePartnerSessions(partnership.id);
  const sessions = data?.sessions ?? [];
  const next = sessions.find(s => s.status === "proposed" || s.status === "confirmed");
  const past = sessions.filter(s => s.status === "completed").length;
  const name = [partnership.partner?.firstName, partnership.partner?.lastName].filter(Boolean).join(" ") || "Musician";

  return (
    <div className="p-2 rounded-lg border border-border bg-muted/20 space-y-1">
      <div className="flex items-center gap-2 text-sm">
        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Users className="h-3 w-3 text-primary" />
        </div>
        <span className="text-foreground flex-1 truncate font-medium">{name}</span>
        <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge>
      </div>
      {next ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-8">
          <Calendar className="h-3 w-3 shrink-0" />
          <span className="capitalize">{next.status}:</span>
          <span>{new Date(next.proposedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground pl-8 flex items-center gap-1.5">
          <Clock className="h-3 w-3 shrink-0" />
          <Link href="/practice-partners" className="text-primary hover:underline">Schedule a session</Link>
        </div>
      )}
      {past > 0 && (
        <p className="text-xs text-muted-foreground pl-8">{past} session{past !== 1 ? "s" : ""} completed</p>
      )}
    </div>
  );
}

function PracticePartnersCard() {
  const { data } = useQuery({
    queryKey: ["practice", "partnerships"],
    queryFn: async () => {
      const res = await apiFetch("/practice/partnerships");
      if (!res.ok) return null;
      return res.json() as Promise<{ partnerships: DashPartnership[] }>;
    },
  });
  const { data: profileData } = useQuery({
    queryKey: ["practice", "profile", "me"],
    queryFn: async () => {
      const res = await apiFetch("/practice/profile/me");
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
  });
  const { data: notifData } = useQuery({
    queryKey: ["practice", "notifications"],
    queryFn: async () => {
      const res = await apiFetch("/practice/notifications");
      if (!res.ok) return null;
      return res.json() as Promise<{ total: number; recentNotifications: Array<{ id: number; message: string; type: string; isRead: boolean }> }>;
    },
    refetchInterval: 30_000,
  });

  const partnerships = data?.partnerships ?? [];
  const pending = partnerships.filter(p => p.status === "pending" && !p.isRequester);
  const active = partnerships.filter(p => p.status === "active");
  const unreadNotifs = notifData?.recentNotifications?.filter(n => !n.isRead) ?? [];

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="font-serif">Practice Partners</CardTitle>
          {(notifData?.total ?? 0) > 0 && (
            <span className="h-5 w-5 text-xs font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center">
              {notifData!.total}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
          <Link href="/practice-partners">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* In-app notifications (accept/decline/dissolve) */}
        {unreadNotifs.slice(0, 2).map(n => (
          <div key={n.id} className="flex items-start gap-2 p-2 bg-primary/5 border border-primary/20 rounded-lg text-xs">
            <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span className="text-foreground">{n.message}</span>
          </div>
        ))}

        {/* Incoming requests */}
        {pending.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm">
            <Users className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-foreground">{pending.length} incoming {pending.length === 1 ? "request" : "requests"}</span>
            <Button size="sm" asChild className="ml-auto h-7 text-xs">
              <Link href="/practice-partners">Review</Link>
            </Button>
          </div>
        )}

        {/* Active partners with next session + past count */}
        {active.length > 0 ? (
          <div className="space-y-2">
            {active.slice(0, 3).map(p => <ActivePartnerRow key={p.id} partnership={p} />)}
          </div>
        ) : !profileData ? (
          <p className="text-sm text-muted-foreground">Set up your practice profile to find compatible music partners for regular sessions.</p>
        ) : (
          <p className="text-sm text-muted-foreground">No active partners yet. Browse matches to find compatible musicians.</p>
        )}

        <Button size="sm" variant={active.length > 0 || profileData ? "outline" : "default"} className="w-full" asChild>
          <Link href="/practice-partners">{profileData ? "Find Partners" : "Get Started"}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function StudentAuditionPrepCard() {
  const { data } = useListMyEnrollments();
  const enrollments = (data?.enrollments ?? []) as Array<{
    id: number;
    status: string;
    sessionsCompleted: number;
    program?: { sessionCount: number; title: string; instrument: string } | null;
  }>;
  const active = enrollments.filter((e) => e.status === "active");

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-serif">Audition Prep</CardTitle>
        {enrollments.length > 0 && (
          <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
            <Link href="/my-programs">View all</Link>
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {active.length > 0 ? (
          <div className="space-y-3">
            {active.slice(0, 3).map((e) => {
              const total = e.program?.sessionCount ?? 1;
              const done = e.sessionsCompleted ?? 0;
              const pct = Math.round((done / total) * 100);
              return (
                <Link key={e.id} href="/my-programs">
                  <div className="rounded-lg border border-border p-3 hover:bg-muted/50 transition-colors cursor-pointer space-y-2">
                    <div className="flex justify-between items-start gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{e.program?.title ?? "Program"}</p>
                        <p className="text-xs text-muted-foreground">{e.program?.instrument}</p>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{done}/{total} sessions</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Track your progress through structured audition prep programs with your coach.
          </p>
        )}
        <Button size="sm" variant={active.length > 0 ? "outline" : "default"} className="w-full" asChild>
          <Link href="/audition-prep">Browse Programs</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function StudentDashboard() {
  const { data: dashboard, isLoading } = useGetStudentDashboard();
  const { data: completedBookings } = useListBookings({ status: "completed", limit: 50 });

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-12 flex justify-center">
          <div className="animate-pulse w-full space-y-8">
            <div className="h-32 bg-muted rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-48 bg-muted rounded-xl" />
              <div className="h-48 bg-muted rounded-xl md:col-span-2" />
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!dashboard) return null;

  const nextBooking = dashboard.upcomingBookings[0];
  const pendingReviewBookings = (completedBookings?.bookings ?? []).filter(b => !b.hasReview);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-12">
        <h1 className="text-3xl font-serif font-bold text-foreground mb-8">Student Dashboard</h1>

        {/* Review prompt banner */}
        {pendingReviewBookings.length > 0 && (
          <div className="mb-8 flex items-center justify-between gap-4 rounded-xl border border-primary/30 bg-primary/5 px-6 py-4">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary shrink-0" />
              <p className="text-sm text-foreground font-medium">
                {pendingReviewBookings.length === 1
                  ? "You have 1 completed lesson waiting for a review."
                  : `You have ${pendingReviewBookings.length} completed lessons waiting for reviews.`}
                {" "}Your feedback helps other students find great teachers.
              </p>
            </div>
            <Button size="sm" asChild className="shrink-0">
              <Link href="/bookings">Leave a Review</Link>
            </Button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Upcoming Lessons</p>
                  <h3 className="text-2xl font-bold text-foreground">{dashboard.upcomingBookings.length}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Music className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Masterclasses</p>
                  <h3 className="text-2xl font-bold text-foreground">{dashboard.registeredMasterclasses.length}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Star className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Lessons Completed</p>
                  <h3 className="text-2xl font-bold text-foreground">{dashboard.lessonsCompleted}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <CreditCard className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Total Spent</p>
                  <h3 className="text-2xl font-bold text-foreground">${(dashboard.totalSpentInCents / 100).toFixed(2)}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-8">
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif">Upcoming Schedule</CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/bookings">View all bookings</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {!dashboard.upcomingBookings.length ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">No upcoming lessons scheduled.</p>
                    <Button asChild><Link href="/teachers">Find a Teacher</Link></Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dashboard.upcomingBookings.slice(0, 3).map(booking => (
                      <div key={booking.id} className="flex gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                        <div className="w-16 h-16 rounded-full bg-muted overflow-hidden shrink-0">
                          {booking.teacher?.profileImageUrl ? (
                            <img src={booking.teacher.profileImageUrl} alt="Teacher" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Music className="h-6 w-6 opacity-20" /></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <h4 className="font-medium text-foreground truncate">
                              Lesson with {booking.teacher?.user?.firstName} {booking.teacher?.user?.lastName}
                            </h4>
                            <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'} className="capitalize shrink-0 ml-2">
                              {booking.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            {booking.scheduledAt ? format(new Date(booking.scheduledAt), 'MMM d, yyyy h:mm a') : 'TBD'}
                            <span className="text-border mx-1">•</span>
                            <Clock className="h-3.5 w-3.5" />
                            {booking.durationMinutes} min
                          </p>
                          {booking.meetingUrl && booking.status === 'confirmed' && (
                            <Button size="sm" asChild className="h-7 text-xs">
                              <a href={booking.meetingUrl} target="_blank" rel="noopener noreferrer">Join Meeting</a>
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif">My Masterclasses</CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/masterclasses">Browse masterclasses</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {!dashboard.registeredMasterclasses.length ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">You haven't registered for any masterclasses.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dashboard.registeredMasterclasses.slice(0, 3).map(mc => (
                      <Link key={mc.id} href={`/masterclasses/${mc.id}`}>
                        <div className="flex justify-between items-center p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors cursor-pointer">
                          <div>
                            <h4 className="font-medium text-foreground">{mc.title}</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {format(new Date(mc.scheduledAt), 'MMM d, yyyy h:mm a')}
                            </p>
                          </div>
                          <Badge variant="outline">Registered</Badge>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right Column */}
          <div className="space-y-8">
            {nextBooking && (
              <Card className="bg-primary text-primary-foreground border-primary shadow-md">
                <CardContent className="p-6">
                  <h3 className="font-serif font-semibold text-lg mb-4 opacity-90">Up Next</h3>
                  <div className="text-2xl font-bold mb-2">
                    {nextBooking.scheduledAt ? format(new Date(nextBooking.scheduledAt), 'h:mm a') : 'TBD'}
                  </div>
                  <div className="text-primary-foreground/80 mb-6">
                    {nextBooking.scheduledAt ? format(new Date(nextBooking.scheduledAt), 'EEEE, MMMM d') : ''}
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-background/20 overflow-hidden">
                      {nextBooking.teacher?.profileImageUrl && (
                        <img src={nextBooking.teacher.profileImageUrl} alt="Teacher" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">Lesson with {nextBooking.teacher?.user?.firstName}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <StudentAuditionPrepCard />

            <PracticePartnersCard />

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif">Recent Orders</CardTitle>
                <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
                  <Link href="/orders">View all</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {!dashboard.recentOrders.length ? (
                  <p className="text-sm text-muted-foreground">No recent orders.</p>
                ) : (
                  <div className="space-y-4">
                    {dashboard.recentOrders.slice(0, 3).map(order => (
                      <div key={order.id} className="flex justify-between items-center text-sm">
                        <div>
                          <div className="font-medium text-foreground capitalize">
                            {order.type.replace('_', ' ')}
                          </div>
                          <div className="text-muted-foreground">{format(new Date(order.createdAt), 'MMM d, yyyy')}</div>
                        </div>
                        <div className="font-medium">
                          ${(order.priceInCents / 100).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
