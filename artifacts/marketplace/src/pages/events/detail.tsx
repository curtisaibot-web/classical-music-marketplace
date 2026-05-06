import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  useGetEvent,
  useGetEventAvailability,
  useCreateEventBookingRequest,
} from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Music, MapPin, Star, Users, Clock, CheckCircle2,
  Calendar, AlertCircle, ChevronLeft, ChevronRight, Zap,
} from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isBefore, startOfDay } from "date-fns";
import { resolveImageUrl } from "@/lib/image-url";
import { usePageMeta } from "@/hooks/use-page-meta";

const EVENT_TYPE_OPTIONS = [
  "Wedding", "Wedding Reception", "Corporate Event", "Gala",
  "Private Party", "Concert", "Ceremony", "Birthday", "Anniversary", "Other",
];

function AvailabilityCalendar({
  bookedDates,
  selectedDate,
  onSelectDate,
}: {
  bookedDates: Date[];
  selectedDate: Date | null;
  onSelectDate: (d: Date) => void;
}) {
  const [viewMonth, setViewMonth] = useState(() => new Date());
  const today = startOfDay(new Date());

  const monthStart = startOfMonth(viewMonth);
  const monthEnd = endOfMonth(viewMonth);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const startPad = monthStart.getDay();

  const isBooked = (d: Date) => bookedDates.some((b) => isSameDay(new Date(b), d));
  const isPast = (d: Date) => isBefore(d, today);
  const isSelected = (d: Date) => selectedDate !== null && isSameDay(d, selectedDate);

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={() => setViewMonth((m) => subMonths(m, 1))}
          className="p-1.5 hover:bg-muted rounded-md transition-colors"
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="font-medium text-sm">{format(viewMonth, "MMMM yyyy")}</span>
        <button
          onClick={() => setViewMonth((m) => addMonths(m, 1))}
          className="p-1.5 hover:bg-muted rounded-md transition-colors"
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
          <div key={d} className="text-center text-xs text-muted-foreground py-1 font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: startPad }).map((_, i) => (
          <div key={`pad-${i}`} />
        ))}
        {days.map((day) => {
          const booked = isBooked(day);
          const past = isPast(day);
          const selected = isSelected(day);
          const disabled = booked || past;

          return (
            <button
              key={day.toISOString()}
              disabled={disabled}
              onClick={() => !disabled && onSelectDate(day)}
              className={`
                h-8 w-full rounded-md text-sm transition-colors
                ${selected ? "bg-primary text-primary-foreground font-semibold" : ""}
                ${booked && !selected ? "bg-red-100 text-red-400 line-through cursor-not-allowed" : ""}
                ${past && !booked && !selected ? "text-muted-foreground/40 cursor-not-allowed" : ""}
                ${!disabled && !selected ? "hover:bg-primary/10 text-foreground" : ""}
              `}
            >
              {format(day, "d")}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-red-100 border border-red-200" />
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-3 w-3 rounded-sm bg-primary" />
          <span>Selected</span>
        </div>
      </div>
    </div>
  );
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { user, isLoaded } = useUser();

  const { data: event, isLoading } = useGetEvent(Number(id));
  const { data: availability } = useGetEventAvailability(event?.teacherId ?? "", {
    enabled: !!event?.teacherId,
  });

  const createBooking = useCreateEventBookingRequest();

  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [eventType, setEventType] = useState("");
  const [customEventType, setCustomEventType] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [headcount, setHeadcount] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [bookingResult, setBookingResult] = useState<{
    surgePercent: number | null;
    surgeAmountInCents: number | null;
    priceInCents: number;
    platformFeeInCents: number;
    expiresAt: string | null;
  } | null>(null);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  usePageMeta({
    title: event?.title ?? "Event Musician",
    description: event?.description ?? "Hire a professional musician for your event",
    imageUrl: event?.imageUrl ?? undefined,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!isLoaded || !user) {
      toast.error("Please sign in to send a booking request");
      setLocation("/sign-in");
      return;
    }

    if (!selectedDate) {
      toast.error("Please select an event date");
      return;
    }

    const chosenEventType = eventType === "Other" ? customEventType : eventType;
    if (!chosenEventType) {
      toast.error("Please select an event type");
      return;
    }

    if (!eventLocation.trim()) {
      toast.error("Please enter the event location/venue");
      return;
    }

    createBooking.mutate({
      listingId: event!.id,
      teacherId: event!.teacherId,
      eventType: chosenEventType,
      eventDate: selectedDate.toISOString(),
      eventLocation: eventLocation.trim(),
      headcount: headcount ? parseInt(headcount, 10) : undefined,
      durationMinutes: durationMinutes ? parseInt(durationMinutes, 10) : undefined,
      notes: notes.trim() || undefined,
      instrument: event?.instrument ?? undefined,
    }, {
      onSuccess: (data) => {
        setSubmitted(true);
        setBookingResult({
          surgePercent: data.surgePercent ?? null,
          surgeAmountInCents: data.surgeAmountInCents ?? null,
          priceInCents: data.priceInCents,
          platformFeeInCents: data.platformFeeInCents,
          expiresAt: data.expiresAt ?? null,
        });
        toast.success("Booking request sent! The musician will be in touch shortly.");
      },
      onError: () => {
        toast.error("Failed to send request. Please try again.");
      },
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-12 flex justify-center">
          <div className="animate-pulse w-full max-w-5xl space-y-6">
            <div className="h-72 bg-muted rounded-xl" />
            <div className="h-8 bg-muted rounded w-2/3" />
            <div className="h-32 bg-muted rounded" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-20">
            <Music className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <h2 className="text-2xl font-serif font-semibold mb-2">Listing not found</h2>
            <p className="text-muted-foreground mb-6">This event listing may no longer be available.</p>
            <Button variant="outline" onClick={() => setLocation("/events")}>Browse Events</Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const imgSrc = resolveImageUrl(event.imageUrl, basePath);
  const details = event.eventDetails;
  const bookedDates = availability?.bookedDates ?? [];

  // Compute last-minute pricing preview based on selected date
  const SURGE_PERCENT = 25;
  const LAST_MINUTE_THRESHOLD_HOURS = 72;
  const LAST_MINUTE_PLATFORM_FEE_RATE = 0.20;
  const PLATFORM_FEE_RATE = 0.15;

  const isLastMinuteDate = selectedDate
    ? (selectedDate.getTime() - Date.now()) / (1000 * 60 * 60) < LAST_MINUTE_THRESHOLD_HOURS
    : false;

  const basePrice = event.priceInCents;
  const surgeAmount = isLastMinuteDate ? Math.round(basePrice * (SURGE_PERCENT / 100)) : 0;
  const totalPrice = basePrice + surgeAmount;
  const platformFee = Math.round(totalPrice * (isLastMinuteDate ? LAST_MINUTE_PLATFORM_FEE_RATE : PLATFORM_FEE_RATE));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 bg-muted/30">
        <div className="bg-foreground text-background py-16 lg:py-24 relative overflow-hidden">
          {imgSrc && (
            <>
              <div className="absolute inset-0">
                <img src={imgSrc} alt="" className="w-full h-full object-cover opacity-20" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/80 to-transparent" />
            </>
          )}
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl">
              <div className="flex flex-wrap gap-2 mb-6">
                {event.instrument && (
                  <Badge variant="outline" className="border-primary/50 text-primary bg-primary/10">
                    {event.instrument}
                  </Badge>
                )}
                {details?.eventTypes.map((t) => (
                  <Badge key={t} variant="outline" className="border-background/30 text-background/80">
                    {t}
                  </Badge>
                ))}
              </div>
              <h1 className="text-4xl md:text-5xl font-serif font-bold mb-4 leading-tight">
                {event.title}
              </h1>
              <div className="flex flex-wrap gap-6 text-background/80">
                {event.teacher && (
                  <div className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-full bg-muted/20 overflow-hidden">
                      {event.teacher.profileImageUrl ? (
                        <img src={event.teacher.profileImageUrl} alt="Teacher" className="w-full h-full object-cover" />
                      ) : (
                        <Music className="h-4 w-4 m-2 opacity-40" />
                      )}
                    </div>
                    <span>
                      {event.teacher.user?.firstName} {event.teacher.user?.lastName}
                    </span>
                  </div>
                )}
                {(event.city || event.country) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>{[event.city, event.country].filter(Boolean).join(", ")}</span>
                  </div>
                )}
                {event.teacher && event.teacher.reviewCount > 0 && (
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-primary text-primary" />
                    <span className="font-semibold">{(event.teacher.averageRating / 100).toFixed(1)}</span>
                    <span className="text-background/60">({event.teacher.reviewCount} reviews)</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">

            <div className="lg:col-span-2 space-y-10">
              {event.description && (
                <section>
                  <h2 className="text-2xl font-serif font-semibold mb-4 text-foreground">About</h2>
                  <div className="prose prose-slate max-w-none text-muted-foreground whitespace-pre-wrap">
                    {event.description}
                  </div>
                </section>
              )}

              {details && (
                <section>
                  <h2 className="text-2xl font-serif font-semibold mb-6 text-foreground">Details</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {details.eventTypes.length > 0 && (
                      <div className="bg-card border border-border rounded-xl p-5">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Event Types</div>
                        <div className="flex flex-wrap gap-1.5">
                          {details.eventTypes.map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {details.venueTypes.length > 0 && (
                      <div className="bg-card border border-border rounded-xl p-5">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">Venue Types</div>
                        <div className="flex flex-wrap gap-1.5">
                          {details.venueTypes.map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {(details.minHeadcount || details.maxHeadcount) && (
                      <div className="bg-card border border-border rounded-xl p-5">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Guest Capacity</div>
                        <div className="flex items-center gap-2 text-foreground font-medium">
                          <Users className="h-4 w-4 text-muted-foreground" />
                          {details.minHeadcount && details.maxHeadcount
                            ? `${details.minHeadcount}–${details.maxHeadcount} guests`
                            : details.maxHeadcount
                            ? `Up to ${details.maxHeadcount} guests`
                            : `From ${details.minHeadcount} guests`}
                        </div>
                      </div>
                    )}

                    {details.performanceDurationMinutes && (
                      <div className="bg-card border border-border rounded-xl p-5">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Performance Duration</div>
                        <div className="flex items-center gap-2 text-foreground font-medium">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          {details.performanceDurationMinutes >= 60
                            ? `${Math.floor(details.performanceDurationMinutes / 60)}h${details.performanceDurationMinutes % 60 ? ` ${details.performanceDurationMinutes % 60}m` : ""}`
                            : `${details.performanceDurationMinutes} minutes`}
                        </div>
                      </div>
                    )}

                    {details.travelRadiusMiles && (
                      <div className="bg-card border border-border rounded-xl p-5">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Travel Radius</div>
                        <div className="flex items-center gap-2 text-foreground font-medium">
                          <MapPin className="h-4 w-4 text-muted-foreground" />
                          Up to {details.travelRadiusMiles} miles
                        </div>
                      </div>
                    )}

                    {details.setupTimeMinutes && (
                      <div className="bg-card border border-border rounded-xl p-5">
                        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-1">Setup Time Required</div>
                        <div className="text-foreground font-medium">{details.setupTimeMinutes} minutes</div>
                      </div>
                    )}
                  </div>

                  {details.repertoire && (
                    <div className="mt-6 bg-card border border-border rounded-xl p-6">
                      <h3 className="font-medium text-foreground mb-2">Repertoire</h3>
                      <p className="text-muted-foreground text-sm whitespace-pre-wrap">{details.repertoire}</p>
                    </div>
                  )}

                  {details.additionalInfo && (
                    <div className="mt-4 bg-card border border-border rounded-xl p-6">
                      <h3 className="font-medium text-foreground mb-2">Additional Information</h3>
                      <p className="text-muted-foreground text-sm whitespace-pre-wrap">{details.additionalInfo}</p>
                    </div>
                  )}
                </section>
              )}

              {event.teacher && (
                <section className="bg-card border border-border rounded-xl p-8 shadow-sm">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="h-14 w-14 rounded-full bg-muted overflow-hidden shrink-0">
                      {event.teacher.profileImageUrl ? (
                        <img src={event.teacher.profileImageUrl} alt="Musician" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex justify-center items-center">
                          <Music className="h-7 w-7 opacity-20" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-serif font-semibold text-xl text-foreground">
                        {event.teacher.user?.firstName} {event.teacher.user?.lastName}
                      </h3>
                      {event.teacher.instruments.length > 0 && (
                        <p className="text-sm text-muted-foreground">{event.teacher.instruments.join(", ")}</p>
                      )}
                    </div>
                  </div>
                  {event.teacher.bio && (
                    <p className="text-muted-foreground line-clamp-4 text-sm">{event.teacher.bio}</p>
                  )}
                </section>
              )}
            </div>

            <div className="space-y-6 sticky top-24">
              {submitted ? (
                <Card className="border-border shadow-lg">
                  <CardContent className="p-8 text-center">
                    <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="h-8 w-8 text-green-600" />
                    </div>
                    <h3 className="font-serif text-xl font-semibold mb-2 text-foreground">Request Sent!</h3>
                    <p className="text-muted-foreground text-sm mb-4">
                      Your booking request has been sent. The musician will review your details and get back to you soon.
                    </p>
                    {bookingResult && (
                      <div className="bg-muted/50 rounded-lg p-4 text-left mb-4 space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Price Summary</p>
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground">Base price</span>
                          <span className="font-medium">${((bookingResult.priceInCents - (bookingResult.surgeAmountInCents ?? 0)) / 100).toFixed(0)}</span>
                        </div>
                        {bookingResult.surgePercent && bookingResult.surgeAmountInCents ? (
                          <div className="flex justify-between text-sm">
                            <span className="flex items-center gap-1 text-amber-700">
                              <Zap className="h-3 w-3 fill-amber-600" />
                              Last-minute premium (+{bookingResult.surgePercent}%)
                            </span>
                            <span className="font-medium text-amber-700">+${(bookingResult.surgeAmountInCents / 100).toFixed(0)}</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between text-sm border-t border-border pt-2">
                          <span className="font-semibold text-foreground">Total</span>
                          <span className="font-bold text-foreground">${(bookingResult.priceInCents / 100).toFixed(0)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Platform fee ({bookingResult.surgePercent ? "20%" : "15%"})</span>
                          <span>${(bookingResult.platformFeeInCents / 100).toFixed(0)}</span>
                        </div>
                        {bookingResult.expiresAt && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-md p-2">
                            <p className="text-xs text-amber-800 font-medium flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Musician must accept by {format(new Date(bookingResult.expiresAt), "h:mm a")} today
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                    <Button variant="outline" className="w-full" onClick={() => setLocation("/bookings")}>
                      View My Bookings
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <Card className="border-border shadow-lg">
                  <CardHeader className="bg-muted/50 border-b border-border pb-4">
                    <CardTitle className="font-serif text-xl">Request Booking</CardTitle>
                    {basePrice > 0 && !selectedDate && (
                      <p className="text-2xl font-bold text-foreground mt-1">
                        From ${(basePrice / 100).toFixed(0)}
                      </p>
                    )}
                    {basePrice > 0 && selectedDate && (
                      <div className="mt-2 space-y-1">
                        {isLastMinuteDate ? (
                          <>
                            <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5 mb-2">
                              <Zap className="h-3 w-3 fill-amber-600 shrink-0" />
                              Last-minute booking — 25% surge applies
                            </div>
                            <div className="flex justify-between text-sm text-muted-foreground">
                              <span>Base price</span>
                              <span>${(basePrice / 100).toFixed(0)}</span>
                            </div>
                            <div className="flex justify-between text-sm text-amber-700">
                              <span>Last-minute premium (+25%)</span>
                              <span>+${(surgeAmount / 100).toFixed(0)}</span>
                            </div>
                            <div className="flex justify-between font-bold text-foreground border-t border-border pt-1 mt-1">
                              <span>Total</span>
                              <span>${(totalPrice / 100).toFixed(0)}</span>
                            </div>
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>Platform fee (20%)</span>
                              <span>${(platformFee / 100).toFixed(0)}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <p className="text-2xl font-bold text-foreground">
                              From ${(basePrice / 100).toFixed(0)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Platform fee (15%): ${(platformFee / 100).toFixed(0)}
                            </p>
                          </>
                        )}
                      </div>
                    )}
                    {basePrice === 0 && (
                      <p className="text-sm text-muted-foreground">Price on request</p>
                    )}
                  </CardHeader>
                  <CardContent className="p-6">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">
                          <Calendar className="h-3.5 w-3.5 inline mr-1.5 text-muted-foreground" />
                          Event Date <span className="text-destructive">*</span>
                        </Label>
                        <AvailabilityCalendar
                          bookedDates={bookedDates}
                          selectedDate={selectedDate}
                          onSelectDate={setSelectedDate}
                        />
                        {selectedDate && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            {format(selectedDate, "EEEE, MMMM d, yyyy")}
                          </p>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="event-type" className="text-sm font-medium">
                          Event Type <span className="text-destructive">*</span>
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                          {EVENT_TYPE_OPTIONS.map((type) => (
                            <button
                              key={type}
                              type="button"
                              onClick={() => setEventType(type)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                                eventType === type
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                              }`}
                            >
                              {type}
                            </button>
                          ))}
                        </div>
                        {eventType === "Other" && (
                          <Input
                            placeholder="Describe your event type"
                            value={customEventType}
                            onChange={(e) => setCustomEventType(e.target.value)}
                            className="mt-2"
                          />
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="location" className="text-sm font-medium">
                          Venue / Location <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="location"
                          placeholder="e.g. Grand Ballroom, New York City"
                          value={eventLocation}
                          onChange={(e) => setEventLocation(e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="headcount" className="text-sm font-medium">Guest Count</Label>
                          <Input
                            id="headcount"
                            type="number"
                            placeholder="e.g. 100"
                            min={1}
                            value={headcount}
                            onChange={(e) => setHeadcount(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="duration" className="text-sm font-medium">Duration (min)</Label>
                          <Input
                            id="duration"
                            type="number"
                            placeholder="e.g. 120"
                            min={30}
                            value={durationMinutes}
                            onChange={(e) => setDurationMinutes(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="notes" className="text-sm font-medium">
                          Additional Notes
                        </Label>
                        <Textarea
                          id="notes"
                          placeholder="Special requests, musical preferences, ceremony details…"
                          rows={3}
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          maxLength={1000}
                        />
                      </div>

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={createBooking.isPending}
                      >
                        {createBooking.isPending ? "Sending Request…" : "Send Booking Request"}
                      </Button>

                      {!user && isLoaded && (
                        <p className="text-xs text-center text-muted-foreground">
                          You'll be asked to sign in to complete your request.
                        </p>
                      )}
                    </form>
                  </CardContent>
                </Card>
              )}

              <div className="bg-card border border-border rounded-xl p-5 flex gap-3 text-sm text-muted-foreground shadow-sm">
                <AlertCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p>Booking requests are not charged upfront. The musician will confirm availability and discuss final pricing.</p>
              </div>

              {details?.requiresDeposit && (
                <div className="bg-card border border-border rounded-xl p-5 flex gap-3 text-sm text-muted-foreground shadow-sm">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                  <p>A {details.depositPercent ?? 25}% deposit is required to secure your booking date.</p>
                </div>
              )}
            </div>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
