import { useState } from "react";
import { useListBookings, useCreateReview } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Calendar, Clock, MapPin, Music, Star } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

interface ReviewModalState {
  open: boolean;
  teacherId: string;
  teacherName: string;
  bookingId: number;
}

export default function StudentBookings() {
  const [tab, setTab] = useState<string>("upcoming");
  const [reviewModal, setReviewModal] = useState<ReviewModalState>({
    open: false,
    teacherId: "",
    teacherName: "",
    bookingId: 0,
  });
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewBody, setReviewBody] = useState("");
  const [locallySubmittedBookings, setLocallySubmittedBookings] = useState<Set<number>>(new Set());

  const { data: bookingsData, isLoading } = useListBookings();
  const createReview = useCreateReview();

  const getFilteredBookings = () => {
    if (!bookingsData) return [];
    if (tab === "upcoming") {
      return bookingsData.bookings.filter(b =>
        b.status === "confirmed" || b.status === "pending"
      ).sort((a, b) => new Date(a.scheduledAt || 0).getTime() - new Date(b.scheduledAt || 0).getTime());
    } else {
      return bookingsData.bookings.filter(b =>
        b.status === "completed" || b.status === "cancelled" || b.status === "refunded"
      ).sort((a, b) => new Date(b.scheduledAt || 0).getTime() - new Date(a.scheduledAt || 0).getTime());
    }
  };

  const filteredBookings = getFilteredBookings();

  const getStatusColor = (status: string) => {
    switch (status) {
      case "confirmed": return "bg-green-500/10 text-green-700 hover:bg-green-500/20";
      case "pending": return "bg-yellow-500/10 text-yellow-700 hover:bg-yellow-500/20";
      case "cancelled": return "bg-red-500/10 text-red-700 hover:bg-red-500/20";
      case "completed": return "bg-blue-500/10 text-blue-700 hover:bg-blue-500/20";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const openReviewModal = (booking: { id: number; teacherId: string; teacher?: { user?: { firstName?: string | null; lastName?: string | null } | null } | null }) => {
    setRating(0);
    setHoverRating(0);
    setReviewTitle("");
    setReviewBody("");
    setReviewModal({
      open: true,
      teacherId: booking.teacherId,
      teacherName: `${booking.teacher?.user?.firstName ?? ""} ${booking.teacher?.user?.lastName ?? ""}`.trim() || "this teacher",
      bookingId: booking.id,
    });
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Please select a star rating");
      return;
    }

    createReview.mutate({
      data: {
        teacherId: reviewModal.teacherId,
        bookingId: reviewModal.bookingId,
        rating,
        title: reviewTitle || undefined,
        body: reviewBody || undefined,
      }
    }, {
      onSuccess: () => {
        toast.success("Review submitted! Thank you for your feedback.");
        setLocallySubmittedBookings(prev => new Set(prev).add(reviewModal.bookingId));
        setReviewModal(m => ({ ...m, open: false }));
      },
      onError: (err: Error) => {
        const msg = err?.message || "";
        if (msg.includes("already reviewed")) {
          toast.error("You've already reviewed this booking.");
          setLocallySubmittedBookings(prev => new Set(prev).add(reviewModal.bookingId));
        } else if (msg.includes("completed booking")) {
          toast.error("Reviews are only available after a completed booking.");
        } else {
          toast.error("Failed to submit review. Please try again.");
        }
        setReviewModal(m => ({ ...m, open: false }));
      }
    });
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
        <div className="max-w-4xl mx-auto">
          <Tabs value={tab} onValueChange={setTab} className="mb-8">
            <TabsList className="w-full sm:w-auto grid grid-cols-2">
              <TabsTrigger value="upcoming">Upcoming & Pending</TabsTrigger>
              <TabsTrigger value="past">Past & Cancelled</TabsTrigger>
            </TabsList>
          </Tabs>

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
                                {booking.type === "lesson" ? `${booking.instrument || "Music"} Lesson` : "Event Booking"}
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
                                  <span className="font-medium text-foreground">{format(new Date(booking.scheduledAt), "EEEE, MMMM d, yyyy")}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Clock className="h-4 w-4 shrink-0 text-foreground/50" />
                                  <span className="font-medium text-foreground">{format(new Date(booking.scheduledAt), "h:mm a")} ({booking.durationMinutes} min)</span>
                                </div>
                              </>
                            ) : (
                              <div className="col-span-2 text-foreground/60 italic">Date pending confirmation</div>
                            )}

                            {booking.type === "event" && booking.eventLocation && (
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

                        <div className="mt-6 flex items-center justify-between pt-4 border-t border-border flex-wrap gap-3">
                          <span className="font-semibold text-foreground">
                            ${(booking.priceInCents / 100).toFixed(2)}
                          </span>
                          <div className="flex items-center gap-3">
                            {booking.status === "completed" && !booking.hasReview && !locallySubmittedBookings.has(booking.id) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openReviewModal(booking)}
                                className="gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
                              >
                                <Star className="h-3.5 w-3.5" />
                                Leave a Review
                              </Button>
                            )}
                            {booking.status === "completed" && (booking.hasReview || locallySubmittedBookings.has(booking.id)) && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Star className="h-3.5 w-3.5 fill-primary text-primary" /> Review submitted
                              </span>
                            )}
                            {booking.status === "confirmed" && booking.meetingUrl && (
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
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />

      <Dialog open={reviewModal.open} onOpenChange={(open) => setReviewModal(m => ({ ...m, open }))}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Leave a Review</DialogTitle>
            <DialogDescription>
              Share your experience with {reviewModal.teacherName}. Your feedback helps other students.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmitReview} className="space-y-5 pt-2">
            <div className="space-y-2">
              <Label>Star Rating <span className="text-destructive">*</span></Label>
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="p-1 transition-transform hover:scale-110"
                  >
                    <Star
                      className={`h-7 w-7 transition-colors ${
                        star <= (hoverRating || rating)
                          ? "fill-primary text-primary"
                          : "text-muted-foreground"
                      }`}
                    />
                  </button>
                ))}
                {rating > 0 && (
                  <span className="ml-2 self-center text-sm text-muted-foreground">
                    {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][rating]}
                  </span>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-title">Title <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="review-title"
                placeholder="Summarize your experience"
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                maxLength={100}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="review-body">Your Review <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="review-body"
                placeholder="Tell others about your lesson experience — teaching style, communication, what you learned..."
                value={reviewBody}
                onChange={(e) => setReviewBody(e.target.value)}
                rows={4}
                maxLength={1000}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setReviewModal(m => ({ ...m, open: false }))}>
                Cancel
              </Button>
              <Button type="submit" disabled={createReview.isPending || rating === 0}>
                {createReview.isPending ? "Submitting..." : "Submit Review"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
