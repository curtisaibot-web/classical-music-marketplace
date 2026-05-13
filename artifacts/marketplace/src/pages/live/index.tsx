import { useState } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useListLiveConcerts } from "@workspace/api-client-react";
import type { LiveConcert } from "@workspace/api-client-react";
import { Calendar, Search, Music, Ticket, Users, Video } from "lucide-react";
import { format, isFuture, isWithinInterval, subMinutes, addMinutes, formatDistanceToNow } from "date-fns";

function concertStatus(concert: LiveConcert) {
  const scheduled = new Date(concert.scheduledAt);
  const now = new Date();
  if (concert.isCancelled) return "cancelled";
  if (isWithinInterval(now, { start: subMinutes(scheduled, 10), end: addMinutes(scheduled, 180) })) return "live";
  if (isFuture(scheduled)) return "upcoming";
  if (concert.replayAvailableUntil && isFuture(new Date(concert.replayAvailableUntil))) return "replay";
  return "ended";
}

function StatusBadge({ status }: { status: string }) {
  if (status === "live") return <Badge className="bg-red-500 text-white animate-pulse">● Live Now</Badge>;
  if (status === "upcoming") return <Badge variant="outline" className="border-primary text-primary">Upcoming</Badge>;
  if (status === "replay") return <Badge className="bg-amber-100 text-amber-800 border-amber-200">Replay Available</Badge>;
  if (status === "cancelled") return <Badge variant="destructive">Cancelled</Badge>;
  return <Badge variant="secondary">Ended</Badge>;
}

function ConcertCard({ concert }: { concert: LiveConcert }) {
  const status = concertStatus(concert);
  const ticketsLeft = concert.maxTickets - concert.soldTickets;
  const scheduledAt = new Date(concert.scheduledAt);

  return (
    <Link href={`/live/${concert.id}`}>
      <div className="group border border-border rounded-xl overflow-hidden bg-card hover:shadow-md transition-all cursor-pointer">
        <div className="relative aspect-video bg-muted overflow-hidden">
          {concert.imageUrl ? (
            <img src={concert.imageUrl} alt={concert.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/10 to-primary/5">
              <Music className="h-16 w-16 text-primary/30" />
            </div>
          )}
          <div className="absolute top-3 left-3">
            <StatusBadge status={status} />
          </div>
          {status === "live" && (
            <div className="absolute bottom-3 right-3">
              <Badge className="bg-black/70 text-white flex items-center gap-1">
                <Video className="h-3 w-3" />
                Streaming
              </Badge>
            </div>
          )}
        </div>
        <div className="p-4 space-y-3">
          <div>
            <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">{concert.title}</h3>
            {concert.teacher && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {[concert.teacher.user?.firstName, concert.teacher.user?.lastName].filter(Boolean).join(" ") || concert.teacher.profileSlug || "Teacher"}
              </p>
            )}
          </div>
          {concert.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{concert.description}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5" />
              {format(scheduledAt, "MMM d, yyyy · h:mm a")}
            </span>
          </div>
          {status === "upcoming" && (
            <p className="text-xs font-medium text-primary">
              Starts {formatDistanceToNow(scheduledAt, { addSuffix: true })}
            </p>
          )}
          <div className="flex items-center justify-between pt-1 border-t border-border">
            <span className="font-bold text-lg text-foreground">
              ${(concert.ticketPriceCents / 100).toFixed(2)}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {ticketsLeft > 0 ? `${ticketsLeft} left` : "Sold out"}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function LiveConcertsPage() {
  const [search, setSearch] = useState("");

  const { data, isLoading } = useListLiveConcerts({ limit: 50, offset: 0 });

  const concerts = (data?.concerts ?? []).filter(c =>
    search.trim() === "" ||
    c.title.toLowerCase().includes(search.toLowerCase()) ||
    ([c.teacher?.user?.firstName, c.teacher?.user?.lastName].filter(Boolean).join(" ") ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const live = concerts.filter(c => concertStatus(c) === "live");
  const upcoming = concerts.filter(c => concertStatus(c) === "upcoming");
  const replays = concerts.filter(c => concertStatus(c) === "replay");
  const past = concerts.filter(c => ["ended", "cancelled"].includes(concertStatus(c)));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        <section className="py-16 px-4 border-b border-border bg-gradient-to-b from-primary/5 to-background">
          <div className="max-w-4xl mx-auto text-center space-y-4">
            <Badge variant="outline" className="text-sm px-3 py-1">
              <Video className="h-3.5 w-3.5 mr-1.5 inline" />
              Pay-Per-View Streaming
            </Badge>
            <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground">
              Live Concerts
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Watch world-class classical performances from anywhere. Buy a ticket, stream live, and enjoy replays.
            </p>
          </div>
        </section>

        <div className="max-w-6xl mx-auto px-4 py-10 space-y-10">
          <div className="relative max-w-md mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search concerts or artists..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="rounded-xl border border-border overflow-hidden animate-pulse">
                  <div className="aspect-video bg-muted" />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-2/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              {live.length > 0 && (
                <section className="space-y-4">
                  <h2 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
                    Live Now
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {live.map(c => <ConcertCard key={c.id} concert={c} />)}
                  </div>
                </section>
              )}

              {upcoming.length > 0 && (
                <section className="space-y-4">
                  <h2 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-primary" />
                    Upcoming
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {upcoming.map(c => <ConcertCard key={c.id} concert={c} />)}
                  </div>
                </section>
              )}

              {replays.length > 0 && (
                <section className="space-y-4">
                  <h2 className="text-2xl font-serif font-bold text-foreground flex items-center gap-2">
                    <Video className="h-5 w-5 text-amber-600" />
                    Available Replays
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {replays.map(c => <ConcertCard key={c.id} concert={c} />)}
                  </div>
                </section>
              )}

              {past.length > 0 && (
                <section className="space-y-4">
                  <h2 className="text-2xl font-serif font-bold text-foreground">
                    Past Concerts
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                    {past.map(c => <ConcertCard key={c.id} concert={c} />)}
                  </div>
                </section>
              )}

              {concerts.length === 0 && !isLoading && (
                <div className="text-center py-20 space-y-3">
                  <Music className="h-12 w-12 text-muted-foreground mx-auto" />
                  <p className="text-xl font-serif text-muted-foreground">No concerts found</p>
                  {search && <p className="text-sm text-muted-foreground">Try a different search term</p>}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
