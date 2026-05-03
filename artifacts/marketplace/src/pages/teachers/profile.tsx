import { useState } from "react";
import { useParams } from "wouter";
import { useGetTeacher, useGetTeacherListings, useGetTeacherReviews, useCreateBooking, getGetTeacherQueryKey, getGetTeacherListingsQueryKey, getGetTeacherReviewsQueryKey } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Star, MapPin, Music, GraduationCap, Clock, CheckCircle } from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";

export default function TeacherProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user, isLoaded } = useUser();
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");

  const { data: teacher, isLoading: isLoadingTeacher } = useGetTeacher(userId, { 
    query: { enabled: !!userId, queryKey: getGetTeacherQueryKey(userId) } 
  });
  
  const { data: listingsData } = useGetTeacherListings(userId, { 
    query: { enabled: !!userId, queryKey: getGetTeacherListingsQueryKey(userId) }
  });
  
  const { data: reviewsData } = useGetTeacherReviews(userId, undefined, { 
    query: { enabled: !!userId, queryKey: getGetTeacherReviewsQueryKey(userId) }
  });

  const createBooking = useCreateBooking();

  const handleBookLesson = (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please sign in to book a lesson");
      return;
    }
    
    if (!bookingDate) {
      toast.error("Please select a date and time");
      return;
    }

    createBooking.mutate({
      data: {
        teacherId: userId,
        type: "lesson",
        scheduledAt: new Date(bookingDate).toISOString(),
        durationMinutes: 60,
        notes: bookingNotes,
        instrument: teacher?.instruments[0],
      }
    }, {
      onSuccess: () => {
        toast.success("Lesson request sent successfully!");
        setBookingModalOpen(false);
      },
      onError: () => {
        toast.error("Failed to send request. Please try again.");
      }
    });
  };

  if (isLoadingTeacher) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-12 flex justify-center">
          <div className="animate-pulse w-full max-w-4xl space-y-8">
            <div className="h-64 bg-muted rounded-xl" />
            <div className="h-32 bg-muted rounded-xl" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!teacher) return <div className="p-8 text-center">Teacher not found</div>;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          
          {/* Left Column - Teacher Info */}
          <div className="lg:col-span-2 space-y-12">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row gap-8 items-start">
              <div className="w-32 h-32 md:w-48 md:h-48 shrink-0 rounded-full overflow-hidden bg-muted border-4 border-background shadow-lg">
                {teacher.profileImageUrl ? (
                  <img src={teacher.profileImageUrl} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-secondary text-secondary-foreground">
                    <Music className="h-16 w-16 opacity-20" />
                  </div>
                )}
              </div>
              <div className="flex-1 pt-2">
                <div className="flex items-center gap-3 mb-2">
                  <h1 className="text-4xl font-serif font-bold text-foreground">
                    {teacher.user?.firstName} {teacher.user?.lastName}
                  </h1>
                  {teacher.isVerified && (
                    <CheckCircle className="h-6 w-6 text-primary" />
                  )}
                </div>
                <p className="text-xl text-primary font-medium mb-4">
                  {teacher.instruments.join(", ")}
                </p>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
                  <div className="flex items-center">
                    <MapPin className="h-4 w-4 mr-1.5" />
                    {teacher.city || "Online"}
                  </div>
                  <div className="flex items-center">
                    <GraduationCap className="h-4 w-4 mr-1.5" />
                    {teacher.yearsExperience} Years Experience
                  </div>
                  <div className="flex items-center">
                    <Star className="h-4 w-4 text-primary fill-primary mr-1.5" />
                    <span className="font-medium text-foreground mr-1">{teacher.averageRating.toFixed(1)}</span>
                    ({teacher.reviewCount} reviews)
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {teacher.genres.map(g => (
                    <Badge key={g} variant="secondary" className="font-normal">{g}</Badge>
                  ))}
                </div>
              </div>
            </div>

            {/* Bio Section */}
            <section>
              <h2 className="text-2xl font-serif font-semibold mb-4 text-foreground">About</h2>
              <div className="prose prose-slate dark:prose-invert max-w-none text-muted-foreground">
                {teacher.bio ? (
                  <p className="whitespace-pre-wrap">{teacher.bio}</p>
                ) : (
                  <p className="italic">No biography provided.</p>
                )}
              </div>
            </section>

            {/* Education Section */}
            {teacher.education && (
              <section>
                <h2 className="text-2xl font-serif font-semibold mb-4 text-foreground">Education</h2>
                <div className="prose prose-slate dark:prose-invert max-w-none text-muted-foreground">
                  <p className="whitespace-pre-wrap">{teacher.education}</p>
                </div>
              </section>
            )}

            {/* Reviews Section */}
            <section>
              <h2 className="text-2xl font-serif font-semibold mb-6 text-foreground">Student Reviews</h2>
              {!reviewsData?.reviews.length ? (
                <p className="text-muted-foreground italic">No reviews yet.</p>
              ) : (
                <div className="space-y-6">
                  {reviewsData.reviews.map((review) => (
                    <div key={review.id} className="border-b border-border pb-6 last:border-0">
                      <div className="flex items-center gap-4 mb-3">
                        <div className="h-10 w-10 rounded-full bg-muted overflow-hidden">
                          {review.reviewer?.imageUrl && (
                            <img src={review.reviewer.imageUrl} alt="Reviewer" className="w-full h-full object-cover" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{review.reviewer?.firstName} {review.reviewer?.lastName}</div>
                          <div className="flex text-primary">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`h-3 w-3 ${i < review.rating ? 'fill-primary' : 'fill-muted text-muted'}`} />
                            ))}
                          </div>
                        </div>
                      </div>
                      {review.title && <h4 className="font-medium text-foreground mb-1">{review.title}</h4>}
                      <p className="text-muted-foreground text-sm">{review.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
          
          {/* Right Column - Booking & Listings */}
          <div className="space-y-8">
            <Card className="border-border sticky top-24">
              <CardContent className="p-6">
                <div className="text-center mb-6">
                  <div className="text-3xl font-bold text-foreground mb-1">
                    ${(teacher.hourlyRate! / 100).toFixed(2)}<span className="text-base font-normal text-muted-foreground">/hr</span>
                  </div>
                  <p className="text-sm text-muted-foreground">Private Lessons</p>
                </div>
                <Button 
                  className="w-full mb-4" 
                  size="lg"
                  onClick={() => {
                    if (!isLoaded || !user) {
                      toast.error("Please sign in to book a lesson");
                      return;
                    }
                    setBookingModalOpen(true);
                  }}
                >
                  Request Lesson
                </Button>
                <div className="text-xs text-center text-muted-foreground">
                  You won't be charged until the teacher confirms.
                </div>
              </CardContent>
            </Card>

            {/* Other Offerings */}
            {listingsData && listingsData.listings.length > 0 && (
              <div>
                <h3 className="font-serif font-semibold text-xl mb-4 text-foreground">Other Offerings</h3>
                <div className="space-y-4">
                  {listingsData.listings.map(listing => (
                    <Card key={listing.id} className="border-border">
                      <CardContent className="p-4 flex gap-4 items-center">
                        <div className="h-12 w-12 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          {listing.type === 'masterclass' ? <Star className="h-6 w-6" /> : <Music className="h-6 w-6" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-sm text-foreground truncate">{listing.title}</h4>
                          <p className="text-xs text-muted-foreground capitalize">{listing.type.replace('_', ' ')}</p>
                        </div>
                        <div className="font-semibold text-sm">
                          ${(listing.priceInCents / 100).toFixed(2)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
          
        </div>
      </main>
      
      <Footer />

      <Dialog open={bookingModalOpen} onOpenChange={setBookingModalOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Request a Lesson</DialogTitle>
            <DialogDescription>
              Select a preferred date and time. {teacher.user?.firstName} will review and confirm your request.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBookLesson} className="space-y-6 pt-4">
            <div className="space-y-2">
              <Label htmlFor="datetime">Preferred Date & Time</Label>
              <Input 
                id="datetime" 
                type="datetime-local" 
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Notes for Instructor</Label>
              <Textarea 
                id="notes" 
                placeholder="What would you like to focus on?" 
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setBookingModalOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createBooking.isPending}>
                {createBooking.isPending ? "Sending..." : "Send Request"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

    </div>
  );
}
