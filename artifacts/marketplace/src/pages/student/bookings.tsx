import { useState } from "react";
import { useListBookings } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Calendar, Clock, MapPin, Music } from "lucide-react";
import { format } from "date-fns";

export default function StudentBookings() {
  const [tab, setTab] = useState<string>("upcoming");
  const { data: bookingsData, isLoading } = useListBookings();

  const getFilteredBookings = () => {
    if (!bookingsData) return [];
    const now = new Date();
    if (tab === "upcoming") {
      return bookingsData.bookings.filter(b => 
        b.status === 'confirmed' || b.status === 'pending'
      ).sort((a, b) => new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime());
    } else {
      return bookingsData.bookings.filter(b => 
        b.status === 'completed' || b.status === 'cancelled' || b.status === 'refunded'
      ).sort((a, b) => new Date(b.scheduledAt || 0).getTime() - new Date(a.scheduledAt || 0).getTime());
    }
  };

  const filteredBookings = getFilteredBookings();

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'confirmed': return 'bg-green-500/10 text-green-700 hover:bg-green-500/20';
      case 'pending': return 'bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20';
      case 'cancelled': return 'bg-red-500/10 text-red-700 hover:bg-red-500/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-serif font-bold text-foreground">My Bookings</h1>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        <Tabs value={tab} onValueChange={setTab} className="max-w-4xl mx-auto">
          <TabsList className="mb-8 w-full sm:w-auto grid grid-cols-2">
            <TabsTrigger value="upcoming">Upcoming & Pending</TabsTrigger>
            <TabsTrigger value="past">Past & Cancelled</TabsTrigger>
          </TabsList>

          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-muted rounded-xl h-32" />
              ))}
            </div>
          ) : !filteredBookings.length ? (
            <div className="text-center py-20 bg-muted/30 rounded-xl border border-border border-dashed">
              <Calendar className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-medium text-foreground mb-2">No bookings found</h3>
              <p className="text-muted-foreground">You don't have any {tab} bookings.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredBookings.map((booking) => (
                <Card key={booking.id} className="border-border hover-elevate transition-all overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex flex-col sm:flex-row">
                      <div className="p-6 bg-muted/30 sm:w-48 shrink-0 flex flex-col justify-center items-center text-center border-b sm:border-b-0 sm:border-r border-border">
                        <div className="h-16 w-16 rounded-full bg-background overflow-hidden mb-3 border border-border shadow-sm">
                          {booking.teacher?.profileImageUrl ? (
                            <img src={booking.teacher.profileImageUrl} alt="Teacher" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Music className="h-8 w-8 opacity-20" /></div>
                          )}
                        </div>
                        <div className="font-medium text-foreground text-sm">
                          {booking.teacher?.user?.firstName} {booking.teacher?.user?.lastName}
                        </div>
                      </div>
                      <div className="p-6 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <Badge variant="outline" className="mb-2 uppercase text-xs tracking-wider">{booking.type}</Badge>
                              <h3 className="font-serif font-semibold text-xl text-foreground">
                                {booking.type === 'lesson' ? `${booking.instrument || 'Music'} Lesson` : 'Event Booking'}
                              </h3>
                            </div>
                            <Badge className={getStatusColor(booking.status)} variant="outline">
                              {booking.status}
                            </Badge>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 mt-4 text-sm text-muted-foreground">
                            {booking.scheduledAt ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <Calendar className="h-4 w-4 shrink-0 text-foreground/50" />
                                  <span className="font-medium text-foreground">{format(new Date(booking.scheduledAt), 'EEEE, MMMM d, yyyy')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4 shrink-0 text-foreground/50" />
                                  <span className="font-medium text-foreground">{format(new Date(booking.scheduledAt), 'h:mm a')} ({booking.durationMinutes} min)</span>
                                </div>
                              </>
                            ) : (
                              <div className="col-span-2 text-foreground/60 italic">Date pending confirmation</div>
                            )}
                            
                            {booking.type === 'event' && booking.eventLocation && (
                              <div className="flex items-center gap-2 col-span-2 mt-2">
                                <MapPin className="h-4 w-4 shrink-0 text-foreground/50" />
                                <span>{booking.eventLocation}</span>
                              </div>
                            )}
                          </div>
                          
                          {booking.notes && (
                            <div className="mt-4 pt-4 border-t border-border/50 text-sm text-muted-foreground">
                              <span className="font-medium text-foreground/70">Notes:</span> {booking.notes}
                            </div>
                          )}
                        </div>
                        
                        <div className="mt-6 flex items-center justify-between pt-4 border-t border-border">
                          <span className="font-semibold text-foreground">
                            ${(booking.priceInCents / 100).toFixed(2)}
                          </span>
                          {booking.status === 'confirmed' && booking.meetingUrl && (
                            <a 
                              href={booking.meetingUrl} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-sm font-medium text-primary hover:underline bg-primary/10 px-4 py-2 rounded-md transition-colors hover:bg-primary/20"
                            >
                              Join Meeting
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </Tabs>
      </main>
      
      <Footer />
    </div>
  );
}
