import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListEvents } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Music, MapPin, Search, X, AlertCircle, Star, Users } from "lucide-react";
import { resolveImageUrl } from "@/lib/image-url";
import { usePageMeta } from "@/hooks/use-page-meta";

const INSTRUMENTS = [
  "Piano", "Violin", "String Quartet", "Cello", "Harp",
  "Flute", "Trumpet", "Voice", "Guitar", "Jazz Ensemble",
];

const EVENT_TYPES = [
  "Wedding", "Corporate", "Concert", "Private Party", "Gala", "Ceremony",
];

export default function Events() {
  const [instrument, setInstrument] = useState("");
  const [debouncedInstrument, setDebouncedInstrument] = useState("");
  const [city, setCity] = useState("");
  const [debouncedCity, setDebouncedCity] = useState("");
  const [eventType, setEventType] = useState("");

  usePageMeta({
    title: "Musicians for Hire",
    description: "Book world-class classical musicians for your wedding, corporate event, concert, or private occasion. Browse available performers and send a booking request.",
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
    eventType: eventType || undefined,
    limit: 24,
  });

  const hasFilter = !!instrument || !!city || !!eventType;

  const clearFilters = () => {
    setInstrument("");
    setCity("");
    setEventType("");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2">
            Musicians for Hire
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Elevate your event with world-class classical musicians. From intimate weddings to grand corporate galas, find the perfect performer.
          </p>

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

            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Event:</span>
              {EVENT_TYPES.map((type) => (
                <button
                  key={type}
                  onClick={() => setEventType(eventType === type ? "" : type)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    eventType === type
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                  }`}
                >
                  {type}
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
            <p className="text-muted-foreground mb-6">We couldn't load event listings. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : !data?.events.length ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Music className="h-10 w-10 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No musicians found</h3>
            <p className="text-muted-foreground mb-6">
              {hasFilter
                ? "No event musicians match your filters. Try adjusting your search."
                : "No event musicians are listed yet. Check back soon!"}
            </p>
            {hasFilter && (
              <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              {data.total} musician{data.total !== 1 ? "s" : ""} available for hire
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {data.events.map((event) => {
                const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
                const imgSrc = resolveImageUrl(event.imageUrl, basePath);
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
                            <Music className="h-12 w-12 opacity-20" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
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
                      </div>
                      <CardContent className="p-6 flex flex-col flex-1">
                        <h3 className="font-serif font-semibold text-xl text-foreground mb-1">
                          {event.title}
                        </h3>

                        <p className="text-sm text-muted-foreground mb-1">
                          {event.teacher?.user?.firstName} {event.teacher?.user?.lastName}
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
                              <div className="font-semibold text-foreground">
                                From ${(event.priceInCents / 100).toFixed(0)}
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
