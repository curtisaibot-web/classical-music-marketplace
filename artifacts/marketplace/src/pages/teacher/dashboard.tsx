import { Link } from "wouter";
import { useGetTeacherDashboard, useGetConnectStatus, useCreateConnectOnboarding } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, Users, Star, Music, ExternalLink, CreditCard, AlertCircle, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function TeacherDashboard() {
  const { data: dashboard, isLoading } = useGetTeacherDashboard();
  const { data: connectStatus } = useGetConnectStatus();
  const createOnboarding = useCreateConnectOnboarding();

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleSetupPayouts = () => {
    const returnUrl = `${window.location.origin}${basePath}/teacher-dashboard`;
    createOnboarding.mutate({ data: { returnUrl } }, {
      onSuccess: (data) => {
        if (data.onboardingUrl) {
          window.location.href = data.onboardingUrl;
        }
      },
      onError: () => {
        toast.error("Failed to start payout setup. Please try again.");
      }
    });
  };

  const handleOpenDashboard = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/stripe/connect/dashboard`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      if (data.dashboardUrl) window.open(data.dashboardUrl, "_blank");
    } catch {
      toast.error("Failed to open Stripe dashboard. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-12 flex justify-center">
          <div className="animate-pulse w-full space-y-8">
            <div className="h-32 bg-muted rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-64 bg-muted rounded-xl md:col-span-2" />
              <div className="h-64 bg-muted rounded-xl" />
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground">Teacher Dashboard</h1>
          <Button asChild>
            <Link href="/profile/edit">Edit Profile</Link>
          </Button>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <DollarSign className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Total Earnings</p>
                  <h3 className="text-2xl font-bold text-foreground">${(dashboard.totalEarningsInCents / 100).toFixed(2)}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Active Students</p>
                  <h3 className="text-2xl font-bold text-foreground">{dashboard.totalStudents}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Lessons Taught</p>
                  <h3 className="text-2xl font-bold text-foreground">{dashboard.totalLessonsCompleted}</h3>
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
                  <p className="text-sm text-muted-foreground font-medium">Average Rating</p>
                  <h3 className="text-2xl font-bold text-foreground">{dashboard.averageRating.toFixed(1)}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif">Upcoming Bookings</CardTitle>
              </CardHeader>
              <CardContent>
                {!dashboard.upcomingBookings.length ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No upcoming bookings scheduled.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dashboard.upcomingBookings.slice(0, 5).map(booking => (
                      <div key={booking.id} className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <h4 className="font-medium text-foreground truncate flex items-center gap-2">
                              {booking.type === 'lesson' ? 'Lesson' : 'Event'}
                              <span className="text-muted-foreground font-normal text-sm">
                                with {booking.studentId}
                              </span>
                            </h4>
                            <Badge variant={booking.status === 'pending' ? 'secondary' : 'default'} className="capitalize shrink-0 ml-2">
                              {booking.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            {booking.scheduledAt ? format(new Date(booking.scheduledAt), 'MMM d, yyyy h:mm a') : 'Date pending'}
                            <span className="text-border mx-1">•</span>
                            ${(booking.priceInCents / 100).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif">Upcoming Masterclasses</CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/listings">Manage Masterclasses</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {!dashboard.upcomingMasterclasses.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No upcoming masterclasses.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dashboard.upcomingMasterclasses.map(mc => (
                      <div key={mc.id} className="flex justify-between items-center p-4 rounded-lg border border-border bg-muted/20">
                        <div>
                          <h4 className="font-medium text-foreground">{mc.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {format(new Date(mc.scheduledAt), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <div><span className="font-medium">{mc.registeredPerformers}</span>/{mc.maxPerformers} Performers</div>
                          <div><span className="font-medium">{mc.registeredObservers}</span>/{mc.maxObservers} Observers</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-8">
            {/* Stripe Connect Card */}
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="font-serif text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Payouts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!connectStatus ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-8 bg-muted rounded" />
                  </div>
                ) : connectStatus.isConnected && connectStatus.isOnboarded ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="font-medium">Stripe payouts active</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div className="rounded-lg bg-muted/50 border border-border p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Available</p>
                        <p className="text-base font-bold text-foreground">
                          ${((connectStatus.balanceAvailableInCents ?? 0) / 100).toFixed(2)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 border border-border p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Pending</p>
                        <p className="text-base font-bold text-foreground">
                          ${((connectStatus.balancePendingInCents ?? 0) / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      You receive 85% of each payment. The platform retains a 15% fee.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleOpenDashboard}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Stripe Dashboard
                    </Button>
                  </>
                ) : connectStatus.isConnected && !connectStatus.isOnboarded ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="font-medium">Setup incomplete</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Complete your Stripe account setup to receive payouts.
                    </p>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleSetupPayouts}
                      disabled={createOnboarding.isPending}
                    >
                      {createOnboarding.isPending ? "Loading..." : "Complete Setup"}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Connect your bank account to receive lesson and booking payments directly. The platform takes a 15% fee.
                    </p>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleSetupPayouts}
                      disabled={createOnboarding.isPending}
                    >
                      {createOnboarding.isPending ? "Loading..." : "Set Up Payouts"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif text-lg">My Offerings</CardTitle>
                <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
                  <Link href="/listings">Manage</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <Music className="h-5 w-5 text-primary" />
                    <span className="font-medium">Active Listings</span>
                  </div>
                  <span className="text-xl font-bold">{dashboard.activeListingsCount}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="font-serif text-lg">Recent Reviews</CardTitle>
              </CardHeader>
              <CardContent>
                {!dashboard.recentReviews.length ? (
                  <p className="text-sm text-muted-foreground">No reviews yet.</p>
                ) : (
                  <div className="space-y-4">
                    {dashboard.recentReviews.slice(0, 3).map(review => (
                      <div key={review.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex text-primary">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`h-3 w-3 ${i < review.rating ? 'fill-primary' : 'fill-muted text-muted'}`} />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">{format(new Date(review.createdAt), 'MMM d, yyyy')}</span>
                        </div>
                        {review.title && <h4 className="text-sm font-medium text-foreground">{review.title}</h4>}
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{review.body}</p>
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
