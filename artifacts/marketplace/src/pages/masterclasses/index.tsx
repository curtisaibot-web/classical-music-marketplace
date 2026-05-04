import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListMasterclasses } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar, Users, Music, Search, X, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { resolveImageUrl } from "@/lib/image-url";
import { usePageMeta } from "@/hooks/use-page-meta";

const INSTRUMENTS = [
  "Piano", "Violin", "Viola", "Cello", "Double Bass",
  "Flute", "Clarinet", "Trumpet", "Voice", "Guitar",
];

const DAYS_OF_WEEK = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

export default function Masterclasses() {
  const [instrument, setInstrument] = useState("");
  const [debouncedInstrument, setDebouncedInstrument] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<number | undefined>(undefined);

  usePageMeta({
    title: "Masterclasses",
    description: "Watch or perform in live masterclass sessions with world-renowned classical musicians. Register as a performer or observer.",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInstrument(instrument), 400);
    return () => clearTimeout(timer);
  }, [instrument]);

  const { data, isLoading, isError, refetch } = useListMasterclasses({
    instrument: debouncedInstrument || undefined,
    dayOfWeek: dayOfWeek,
    limit: 20,
  });

  const hasFilter = !!instrument || dayOfWeek !== undefined;

  const clearFilters = () => {
    setInstrument("");
    setDayOfWeek(undefined);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2">Masterclasses</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Watch or perform in live sessions with world-renowned master musicians. An invaluable opportunity for intensive learning.
          </p>

          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Filter by instrument..."
                className="pl-10 bg-background"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
              />
              {instrument && (
                <button
                  onClick={() => setInstrument("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
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
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Day:</span>
              {DAYS_OF_WEEK.map((day) => (
                <button
                  key={day.value}
                  onClick={() => setDayOfWeek(dayOfWeek === day.value ? undefined : day.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    dayOfWeek === day.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                  }`}
                >
                  {day.label}
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
            <p className="text-muted-foreground mb-6">We couldn't load the masterclasses. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : !data?.masterclasses.length ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Music className="h-10 w-10 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No masterclasses scheduled</h3>
            <p className="text-muted-foreground mb-6">
              {hasFilter
                ? "No masterclasses match your filters. Try adjusting your search."
                : "No upcoming masterclasses yet. Check back soon for exciting sessions!"}
            </p>
            {hasFilter && (
              <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              {data.total} {data.total === 1 ? "masterclass" : "masterclasses"} scheduled
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {data.masterclasses.map((mc) => {
                const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
                const imgSrc = resolveImageUrl(mc.imageUrl, basePath);
                const spotsLeft = mc.maxObservers - mc.registeredObservers;
                return (
                  <Link key={mc.id} href={`/masterclasses/${mc.id}`}>
                    <Card className="h-full hover-elevate transition-all border-border flex flex-col cursor-pointer overflow-hidden group">
                      <div className="h-52 overflow-hidden bg-muted relative">
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={mc.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Music className="h-12 w-12 opacity-20" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        <div className="absolute bottom-3 left-3 flex gap-2">
                          <Badge className="bg-primary text-primary-foreground text-xs">
                            {mc.instrument || "All Instruments"}
                          </Badge>
                          {spotsLeft <= 5 && spotsLeft > 0 && (
                            <Badge className="bg-orange-500 text-white text-xs">
                              {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} left
                            </Badge>
                          )}
                          {spotsLeft <= 0 && (
                            <Badge className="bg-red-500 text-white text-xs">Full</Badge>
                          )}
                        </div>
                      </div>
                      <CardContent className="p-6 flex flex-col flex-1">
                        <div className="text-sm text-muted-foreground mb-4">
                          {format(new Date(mc.scheduledAt), "EEEE, MMM d, yyyy")} · {format(new Date(mc.scheduledAt), "h:mm a")}
                        </div>

                        <h3 className="font-serif font-semibold text-xl text-foreground mb-2">
                          {mc.title}
                        </h3>

                        <p className="text-sm text-muted-foreground mb-2">
                          with {mc.teacher?.user?.firstName} {mc.teacher?.user?.lastName}
                        </p>

                        {mc.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{mc.description}</p>
                        )}

                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                          <div className="flex items-center gap-3 text-sm text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {mc.durationMinutes} min
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-4 w-4" />
                              {mc.registeredObservers}/{mc.maxObservers}
                            </div>
                          </div>
                          <div className="font-medium text-foreground">
                            From ${(mc.observerPriceInCents / 100).toFixed(0)}
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
