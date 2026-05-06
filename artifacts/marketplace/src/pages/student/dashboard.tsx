import { Link } from "wouter";
import { useGetStudentDashboard, useListBookings } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, CreditCard, Music, Star, Clock, MessageSquare } from "lucide-react";
import { format } from "date-fns";

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

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif">Audition Prep</CardTitle>
                <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
                  <Link href="/my-programs">View all</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Track your progress through structured audition prep programs with your coach.
                </p>
                <Button size="sm" variant="outline" className="w-full" asChild>
                  <Link href="/audition-prep">Browse Programs</Link>
                </Button>
              </CardContent>
            </Card>

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
