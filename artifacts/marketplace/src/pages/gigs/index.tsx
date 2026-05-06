import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useListEvents, useGetUserReel, getGetUserReelQueryKey } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Zap, MapPin, Search, X, AlertCircle, Star, Users, Play, Volume2, VolumeX, Clock } from "lucide-react";
import { resolveImageUrl } from "@/lib/image-url";
import { usePageMeta } from "@/hooks/use-page-meta";

const INSTRUMENTS = [
  "Piano", "Violin", "String Quartet", "Cello", "Harp",
  "Flute", "Trumpet", "Voice", "Guitar", "Jazz Ensemble",
];

function ReelModalButton({ teacherId, teacherName }: { teacherId: string; teacherName: string }) {
  const { data: reel } = useGetUserReel(teacherId, {
    query: { enabled: !!teacherId, queryKey: getGetUserReelQueryKey(teacherId) }
  });
  const [open, setOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  if (!reel || reel.status !== "ready" || !reel.processedFileUrl) return null;

  return (
    <>
      <Button
        size="sm"
        variant="secondary"
        className="text-xs h-8 gap-1.5"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        Watch Reel
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 max-w-2xl overflow-hidden bg-black border-0">
          <div className="relative aspect-video">
            <video
              ref={videoRef}
              src={reel.processedFileUrl}
              autoPlay
              muted={muted}
              loop
              playsInline
              controls={false}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between">
              <div className="text-white">
                <p className="font-serif font-semibold text-lg leading-tight">{teacherName}</p>
                <p className="text-xs text-white/60 mt-0.5">Booking Reel</p>
              </div>
              <button
                onClick={() => {
                  setMuted((m) => !m);
                  if (videoRef.current) videoRef.current.muted = !muted;
                }}
                className="bg-white/20 hover:bg-white/30 text-white rounded-full p-2 transition backdrop-blur-sm"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Gigs() {
  const [instrument, setInstrument] = useState("");
  const [debouncedInstrument, setDebouncedInstrument] = useState("");
  const [city, setCity] = useState("");
  const [debouncedCity, setDebouncedCity] = useState("");

  usePageMeta({
    title: "Instant Gig Marketplace — Available Now",
    description: "Find musicians available for last-minute bookings. Weddings, corporate events, and private parties — book a performer for your event this week.",
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedInstrument(instrument), 400);
    return () => clearTimeout(t);
  }, [instrument]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedCity(city), 400);
    return () => clearTimeout(t);
  }, [city]);

  const { data, isLoading, isError, refetch } = useListEvents({
    instrument: debouncedInstrument || undefined,
    city: debouncedCity || undefined,
    lastMinute: true,
    limit: 24,
  });

  const hasFilter = !!instrument || !!city;

  const clearFilters = () => {
    setInstrument("");
    setCity("");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-full bg-green-100 border border-green-200">
              <Zap className="h-5 w-5 text-green-600 fill-green-600" />
            </div>
            <Badge className="bg-green-500 text-white border-0 text-sm px-3 py-1">Available Now</Badge>
          </div>
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2">
            Instant Gig Marketplace
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-2">
            Need a musician fast? These performers are open for last-minute bookings right now. Short-notice bookings include a 25% surge premium.
          </p>
          <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 max-w-xl mb-8">
            <Clock className="h-4 w-4 shrink-0" />
            <span>Last-minute bookings (within 72 hours) have a <strong>2-hour acceptance window</strong> and a 25% surge premium added to the base price.</span>
          </div>

          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Instrument (e.g. Violin, Piano…)"
                  className="pl-10 bg-background"
                  value={instrument}
                  onChange={(e) => setInstrument(e.target.value)}
                />
                {instrument && (
                  <button onClick={() => setInstrument("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="relative flex-1">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="City or region…"
                  className="pl-10 bg-background"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
                {city && (
                  <button onClick={() => setCity("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {INSTRUMENTS.map((inst) => (
                <button
                  key={inst}
                  onClick={() => setInstrument(instrument === inst ? "" : inst)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    instrument === inst
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                  }`}
                >
                  {inst}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl overflow-hidden border border-border">
                <div className="h-52 bg-muted" />
                <div className="p-6 space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-6 bg-muted rounded w-4/5" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-10 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4 opacity-70" />
            <h3 className="text-xl font-medium text-foreground mb-2">Something went wrong</h3>
            <p className="text-muted-foreground mb-6">We couldn't load available gigs. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : !data?.events.length ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Zap className="h-10 w-10 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No musicians available right now</h3>
            <p className="text-muted-foreground mb-6">
              {hasFilter
                ? "No musicians match your filters. Try adjusting your search."
                : "No musicians have enabled last-minute availability. Check back soon or browse all event musicians."}
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              {hasFilter && (
                <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
              )}
              <Link href="/events">
                <Button variant="outline">Browse All Events</Button>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              {data.total} musician{data.total !== 1 ? "s" : ""} available for last-minute booking
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {data.events.map((event) => {
                const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
                const imgSrc = resolveImageUrl(event.imageUrl, basePath);
                const teacherName = [event.teacher?.user?.firstName, event.teacher?.user?.lastName].filter(Boolean).join(" ");
                return (
                  <Link key={event.id} href={`/events/${event.id}`}>
                    <Card className="h-full hover-elevate transition-all border-border flex flex-col cursor-pointer overflow-hidden group">
                      <div className="h-52 overflow-hidden bg-muted relative">
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={event.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Zap className="h-12 w-12 opacity-20" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        {/* Available Now ribbon */}
                        <div className="absolute top-3 left-3">
                          <Badge className="bg-green-500 text-white border-0 gap-1 text-xs px-2 py-1 shadow-md">
                            <Zap className="h-3 w-3 fill-white" />
                            Available Now
                          </Badge>
                        </div>
                        <div className="absolute bottom-3 left-3 flex gap-2 flex-wrap">
                          {event.instrument && (
                            <Badge className="bg-primary text-primary-foreground text-xs">
                              {event.instrument}
                            </Badge>
                          )}
                          {event.eventDetails?.eventTypes.slice(0, 2).map((t) => (
                            <Badge key={t} variant="secondary" className="text-xs bg-black/40 text-white border-0">
                              {t}
                            </Badge>
                          ))}
                        </div>
                        {event.teacher?.userId && (
                          <div className="absolute top-3 right-3">
                            <ReelModalButton
                              teacherId={event.teacher.userId}
                              teacherName={teacherName}
                            />
                          </div>
                        )}
                      </div>
                      <CardContent className="p-6 flex flex-col flex-1">
                        <h3 className="font-serif font-semibold text-xl text-foreground mb-1">
                          {event.title}
                        </h3>

                        <p className="text-sm text-muted-foreground mb-1">
                          {teacherName}
                        </p>

                        {(event.city || event.country) && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground mb-3">
                            <MapPin className="h-3 w-3" />
                            <span>{[event.city, event.country].filter(Boolean).join(", ")}</span>
                          </div>
                        )}

                        {event.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
                            {event.description}
                          </p>
                        )}

                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            {event.teacher && (
                              <div className="flex items-center gap-1">
                                <Star className="h-3.5 w-3.5 fill-primary text-primary" />
                                <span className="font-medium text-foreground">
                                  {(event.teacher.averageRating / 100).toFixed(1)}
                                </span>
                                <span className="text-xs">({event.teacher.reviewCount})</span>
                              </div>
                            )}
                            {event.eventDetails?.maxHeadcount && (
                              <div className="flex items-center gap-1">
                                <Users className="h-3.5 w-3.5" />
                                <span>up to {event.eventDetails.maxHeadcount}</span>
                              </div>
                            )}
                          </div>
                          <div className="text-right">
                            {event.priceInCents > 0 ? (
                              <div>
                                <div className="font-semibold text-foreground">
                                  From ${(event.priceInCents / 100).toFixed(0)}
                                </div>
                                <div className="text-xs text-amber-600 font-medium">+25% last-minute</div>
                              </div>
                            ) : (
                              <div className="text-sm font-medium text-primary">Request Quote</div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
