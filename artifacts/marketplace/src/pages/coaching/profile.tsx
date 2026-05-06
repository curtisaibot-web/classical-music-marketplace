import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MapPin, Star, Briefcase, Linkedin, ExternalLink, Clock, CheckCircle, AlertCircle, Calendar } from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { usePageMeta } from "@/hooks/use-page-meta";
import { resolveImageUrl } from "@/lib/image-url";

type CoachListing = {
  id: number;
  title: string;
  description: string | null;
  priceInCents: number;
  durationMinutes: number | null;
  isOnline: boolean;
  tags: string[];
};

type Coach = {
  id: number;
  userId: string;
  bio: string | null;
  credentials: string | null;
  specialties: string[];
  linkedInUrl: string | null;
  sessionRateCents: number | null;
  isOnline: boolean;
  city: string | null;
  country: string | null;
  profileImageUrl: string | null;
  averageRating: number;
  reviewCount: number;
  user: { firstName: string | null; lastName: string | null } | null;
  listings: CoachListing[];
};

export default function CoachProfile() {
  const { userId } = useParams<{ userId: string }>();
  const { user, isLoaded } = useUser();
  const [coach, setCoach] = useState<Coach | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [selectedListing, setSelectedListing] = useState<CoachListing | null>(null);
  const [bookingDate, setBookingDate] = useState("");
  const [bookingNotes, setBookingNotes] = useState("");
  const [bookingLoading, setBookingLoading] = useState(false);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const apiBase = basePath.replace(/\/[^/]*$/, "");

  usePageMeta({
    title: coach ? `${coach.user?.firstName ?? ""} ${coach.user?.lastName ?? ""} — Career Coach` : "Career Coach",
    description: coach?.bio ?? "Career coaching for classical musicians.",
  });

  useEffect(() => {
    if (!userId) return;
    fetch(`${apiBase}/api/coaches/${userId}`)
      .then(async (r) => {
        if (r.status === 404) { setNotFound(true); return; }
        if (!r.ok) throw new Error("Failed to load");
        const data = await r.json() as Coach;
        setCoach(data);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [userId, apiBase]);

  const todayStr = new Date().toISOString().split("T")[0];

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Please sign in to book a session"); return; }
    if (!selectedListing) return;
    if (!bookingDate) { toast.error("Please select a date"); return; }
    setBookingLoading(true);
    try {
      const scheduledAt = new Date(`${bookingDate}T09:00:00`).toISOString();
      const bookingResp = await fetch(`${apiBase}/api/bookings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacherId: coach!.userId,
          type: "coaching",
          listingId: selectedListing.id,
          scheduledAt,
          durationMinutes: selectedListing.durationMinutes ?? 60,
          notes: bookingNotes || undefined,
        }),
      });
      if (!bookingResp.ok) {
        const err = await bookingResp.json() as { error?: string };
        throw new Error(err.error ?? "Booking failed");
      }
      const booking = await bookingResp.json() as { id: number };

      const successUrl = `${window.location.origin}${basePath}/payment/success?type=booking&session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${window.location.origin}${basePath}/payment/cancel`;

      const checkoutResp = await fetch(`${apiBase}/api/stripe/checkout/booking`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, successUrl, cancelUrl }),
      });

      if (!checkoutResp.ok) {
        toast.success("Session requested! Check your dashboard to complete payment.");
        setSelectedListing(null);
        return;
      }
      const { checkoutUrl } = await checkoutResp.json() as { checkoutUrl?: string };
      if (checkoutUrl) {
        window.location.href = checkoutUrl;
      } else {
        toast.success("Session requested! Check your dashboard to complete payment.");
        setSelectedListing(null);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to book session");
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="animate-pulse container mx-auto px-4 py-12 max-w-4xl space-y-6">
          <div className="flex gap-6">
            <div className="h-24 w-24 rounded-full bg-muted" />
            <div className="flex-1 space-y-3">
              <div className="h-8 bg-muted rounded w-48" />
              <div className="h-4 bg-muted rounded w-32" />
            </div>
          </div>
          <div className="h-32 bg-muted rounded" />
        </div>
        <Footer />
      </div>
    );
  }

  if (notFound || !coach) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
            <h2 className="text-xl font-serif font-semibold mb-2">Coach not found</h2>
            <p className="text-muted-foreground">This coaching profile doesn't exist or isn't published yet.</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const imgSrc = resolveImageUrl(coach.profileImageUrl, basePath);
  const fullName = `${coach.user?.firstName ?? ""} ${coach.user?.lastName ?? ""}`.trim() || "Coach";
  const avgRating = coach.averageRating / 100;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted border-b border-border">
        <div className="container mx-auto px-4 py-12 max-w-4xl">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="h-24 w-24 sm:h-32 sm:w-32 rounded-full overflow-hidden bg-background border-2 border-border shrink-0">
              {imgSrc ? (
                <img src={imgSrc} alt={fullName} className="w-full h-full object-cover object-top" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl font-serif font-bold text-muted-foreground/40">
                  {fullName.charAt(0)}
                </div>
              )}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-3xl font-serif font-bold text-foreground">{fullName}</h1>
                <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0" />
              </div>
              {coach.credentials && (
                <p className="text-primary font-medium mb-2">{coach.credentials}</p>
              )}
              <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
                {coach.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5" />
                    {coach.city}{coach.country ? `, ${coach.country}` : ""}
                  </span>
                )}
                {coach.reviewCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span className="text-foreground font-medium">{avgRating.toFixed(1)}</span>
                    ({coach.reviewCount} review{coach.reviewCount !== 1 ? "s" : ""})
                  </span>
                )}
                {coach.isOnline && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="h-3.5 w-3.5" />
                    Online sessions available
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-10 max-w-4xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {coach.bio && (
              <section>
                <h2 className="text-xl font-serif font-semibold mb-3">About</h2>
                <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{coach.bio}</p>
              </section>
            )}

            {coach.specialties.length > 0 && (
              <section>
                <h2 className="text-xl font-serif font-semibold mb-3">Specialties</h2>
                <div className="flex flex-wrap gap-2">
                  {coach.specialties.map((s) => (
                    <Badge key={s} className="bg-primary/10 text-primary border-primary/20 font-medium px-3 py-1">
                      {s}
                    </Badge>
                  ))}
                </div>
              </section>
            )}

            {coach.listings.length > 0 && (
              <section>
                <h2 className="text-xl font-serif font-semibold mb-4">Sessions</h2>
                <div className="space-y-3">
                  {coach.listings.map((listing) => (
                    <Card key={listing.id} className="border-border hover:border-primary/30 transition-colors">
                      <CardContent className="p-5 flex items-start gap-4">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Briefcase className="h-5 w-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-semibold text-foreground mb-1">{listing.title}</h4>
                          {listing.description && (
                            <p className="text-sm text-muted-foreground mb-2 line-clamp-2">{listing.description}</p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {listing.durationMinutes && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Clock className="h-3.5 w-3.5" />
                                {listing.durationMinutes} min
                              </span>
                            )}
                            {listing.isOnline && (
                              <Badge variant="secondary" className="text-xs font-normal">Online</Badge>
                            )}
                            {listing.tags.map((t) => (
                              <Badge key={t} variant="secondary" className="text-xs font-normal capitalize">{t}</Badge>
                            ))}
                          </div>
                        </div>
                        <div className="shrink-0 text-right flex flex-col items-end gap-2">
                          <div>
                            <span className="text-lg font-bold">${Math.round(listing.priceInCents / 100)}</span>
                          </div>
                          <Button size="sm" onClick={() => setSelectedListing(listing)}>
                            Book Session
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}

            {coach.listings.length === 0 && (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <Calendar className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-muted-foreground">No sessions listed yet.</p>
              </div>
            )}
          </div>

          <div className="space-y-4">
            {coach.sessionRateCents && (
              <Card className="border-border">
                <CardContent className="p-5">
                  <p className="text-sm text-muted-foreground mb-1">Starting from</p>
                  <p className="text-3xl font-bold text-foreground">
                    ${Math.round(coach.sessionRateCents / 100)}
                  </p>
                  <p className="text-sm text-muted-foreground">per session</p>
                </CardContent>
              </Card>
            )}

            {coach.linkedInUrl && (
              <Card className="border-border">
                <CardContent className="p-5">
                  <a
                    href={coach.linkedInUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Linkedin className="h-4 w-4" />
                    View LinkedIn Profile
                    <ExternalLink className="h-3.5 w-3.5 ml-auto" />
                  </a>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      <Dialog open={!!selectedListing} onOpenChange={(open) => { if (!open) setSelectedListing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">Book: {selectedListing?.title}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleBook} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label htmlFor="booking-date">Preferred Date</Label>
              <Input
                id="booking-date"
                type="date"
                min={todayStr}
                value={bookingDate}
                onChange={(e) => setBookingDate(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="booking-notes">Notes (optional)</Label>
              <Textarea
                id="booking-notes"
                placeholder="Tell the coach what you'd like to work on…"
                value={bookingNotes}
                onChange={(e) => setBookingNotes(e.target.value)}
                rows={3}
              />
            </div>
            {selectedListing && (
              <div className="rounded-lg bg-muted p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Session fee</span>
                  <span className="font-medium">${Math.round(selectedListing.priceInCents / 100)}</span>
                </div>
                {selectedListing.durationMinutes && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Duration</span>
                    <span>{selectedListing.durationMinutes} min</span>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSelectedListing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={bookingLoading || !isLoaded}>
                {bookingLoading ? "Processing…" : "Continue to Payment"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
