import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { useUser } from "@clerk/react";
import { useGetLiveConcert, useGetMyLiveConcertTicket, useCreateOrder, useGetMe } from "@workspace/api-client-react";
import { Calendar, Clock, Music, Ticket, Users, Video, ArrowLeft, ExternalLink, Lock } from "lucide-react";
import { format, isPast, isFuture, isWithinInterval, subMinutes, addMinutes, formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function concertStatus(scheduledAt: string, replayUntil: string | null | undefined, isCancelled: boolean) {
  const scheduled = new Date(scheduledAt);
  const now = new Date();
  if (isCancelled) return "cancelled";
  if (isWithinInterval(now, { start: subMinutes(scheduled, 10), end: addMinutes(scheduled, 180) })) return "live";
  if (isFuture(scheduled)) return "upcoming";
  if (replayUntil && isFuture(new Date(replayUntil))) return "replay";
  return "ended";
}

function YoutubeEmbed({ url }: { url: string }) {
  let videoId = "";
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) {
      videoId = u.pathname.slice(1);
    } else {
      videoId = u.searchParams.get("v") ?? u.pathname.split("/").pop() ?? "";
    }
  } catch {
    videoId = url;
  }
  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1`;
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-black">
      <iframe
        src={embedUrl}
        title="Live Concert Stream"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        className="w-full h-full"
      />
    </div>
  );
}

function MuxEmbed({ url }: { url: string }) {
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-black flex items-center justify-center">
      <div className="text-center space-y-2 text-white">
        <Video className="h-12 w-12 mx-auto opacity-50" />
        <p className="text-sm opacity-70">Mux stream</p>
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm underline flex items-center gap-1 justify-center">
          Open stream <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

function LockedStream() {
  return (
    <div className="aspect-video w-full rounded-xl overflow-hidden bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
      <div className="text-center space-y-3">
        <Lock className="h-16 w-16 text-muted-foreground mx-auto" />
        <p className="font-semibold text-foreground">Purchase a ticket to watch</p>
        <p className="text-sm text-muted-foreground max-w-xs">This stream is exclusively for ticket holders.</p>
      </div>
    </div>
  );
}

export default function LiveConcertDetail({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  const [, setLocation] = useLocation();
  const { isSignedIn } = useUser();
  const { data: me } = useGetMe();

  const { data: concert, isLoading } = useGetLiveConcert(id);
  const { data: ticketData, isLoading: ticketLoading } = useGetMyLiveConcertTicket(
    isSignedIn && !isNaN(id) ? id : 0,
  );

  const createOrder = useCreateOrder();
  const [purchasing, setPurchasing] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 max-w-4xl mx-auto px-4 py-12 w-full space-y-6 animate-pulse">
          <div className="h-6 w-32 bg-muted rounded" />
          <div className="aspect-video bg-muted rounded-xl" />
          <div className="h-8 w-2/3 bg-muted rounded" />
          <div className="h-4 w-1/2 bg-muted rounded" />
        </main>
        <Footer />
      </div>
    );
  }

  if (!concert) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Music className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-xl font-serif text-muted-foreground">Concert not found</p>
            <Link href="/live"><Button variant="outline">Browse concerts</Button></Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const status = concertStatus(concert.scheduledAt, concert.replayAvailableUntil, concert.isCancelled);
  const hasTicket = ticketData?.hasTicket ?? false;
  const canWatch = hasTicket && (status === "live" || status === "replay");
  const scheduledAt = new Date(concert.scheduledAt);
  const ticketsLeft = concert.maxTickets - concert.soldTickets;
  const isTeacher = me?.role === "teacher" && me.id === concert.teacherId;

  async function handleBuyTicket() {
    if (!isSignedIn) {
      setLocation("/sign-in");
      return;
    }
    setPurchasing(true);
    try {
      const order = await createOrder.mutateAsync({
        data: { type: "live_concert", liveConcertId: concert!.id },
      });
      const successUrl = encodeURIComponent(`${window.location.origin}${BASE}/payment/success?type=live_concert&concertId=${concert!.id}`);
      const cancelUrl = encodeURIComponent(`${window.location.origin}${BASE}/live/${concert!.id}`);
      const apiBase = BASE;
      const res = await fetch(`${apiBase}/api/stripe/checkout/order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: order.id,
          successUrl: decodeURIComponent(successUrl),
          cancelUrl: decodeURIComponent(cancelUrl),
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        toast.error(err.error ?? "Failed to start checkout");
        return;
      }
      const { checkoutUrl } = await res.json() as { checkoutUrl: string };
      window.location.href = checkoutUrl;
    } catch (err) {
      const e = err as { message?: string; error?: string };
      toast.error(e.message ?? e.error ?? "An error occurred");
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 max-w-5xl mx-auto px-4 py-10 w-full">
        <Link href="/live" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" />
          Back to Live Concerts
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            {canWatch ? (
              concert.streamType === "youtube" ? (
                <YoutubeEmbed url={concert.streamUrl} />
              ) : (
                <MuxEmbed url={concert.streamUrl} />
              )
            ) : (
              status === "live" ? (
                <div className="relative">
                  <LockedStream />
                </div>
              ) : concert.imageUrl ? (
                <div className="aspect-video w-full rounded-xl overflow-hidden">
                  <img src={concert.imageUrl} alt={concert.title} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="aspect-video w-full rounded-xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                  <Music className="h-20 w-20 text-primary/30" />
                </div>
              )
            )}

            <div className="space-y-4">
              <div className="flex items-start gap-3 flex-wrap">
                {status === "live" && <Badge className="bg-red-500 text-white animate-pulse">● Live Now</Badge>}
                {status === "upcoming" && <Badge variant="outline" className="border-primary text-primary">Upcoming</Badge>}
                {status === "replay" && <Badge className="bg-amber-100 text-amber-800 border-amber-200">Replay Available</Badge>}
                {status === "cancelled" && <Badge variant="destructive">Cancelled</Badge>}
                {status === "ended" && <Badge variant="secondary">Ended</Badge>}
              </div>

              <h1 className="text-3xl font-serif font-bold text-foreground">{concert.title}</h1>

              {concert.teacher && (
                <p className="text-lg text-muted-foreground">
                  by <span className="text-foreground font-medium">
                    {[concert.teacher.user?.firstName, concert.teacher.user?.lastName].filter(Boolean).join(" ") || concert.teacher.profileSlug || "Teacher"}
                  </span>
                </p>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  {format(scheduledAt, "EEEE, MMMM d, yyyy")}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4" />
                  {format(scheduledAt, "h:mm a")}
                </span>
                {status === "upcoming" && (
                  <span className="flex items-center gap-1.5 text-primary">
                    <Clock className="h-4 w-4" />
                    Starts {formatDistanceToNow(scheduledAt, { addSuffix: true })}
                  </span>
                )}
              </div>

              {concert.description && (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <h2 className="font-semibold text-foreground">About this concert</h2>
                    <p className="text-muted-foreground leading-relaxed whitespace-pre-wrap">{concert.description}</p>
                  </div>
                </>
              )}

              {concert.replayAvailableUntil && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
                  <strong>Replay available</strong> until {format(new Date(concert.replayAvailableUntil), "MMM d, yyyy")}
                </div>
              )}

              {hasTicket && !canWatch && status === "upcoming" && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800 flex items-center gap-2">
                  <Ticket className="h-4 w-4 shrink-0" />
                  <span>You have a ticket for this concert. Come back when it goes live!</span>
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="border border-border rounded-xl p-6 space-y-5 bg-card sticky top-20">
              <div className="text-center space-y-1">
                <p className="text-3xl font-bold text-foreground">
                  ${(concert.ticketPriceCents / 100).toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground">per ticket</p>
              </div>

              <Separator />

              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Users className="h-4 w-4" />
                    Tickets sold
                  </span>
                  <span className="font-medium text-foreground">{concert.soldTickets} / {concert.maxTickets}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Remaining</span>
                  <span className={`font-medium ${ticketsLeft === 0 ? "text-red-600" : ticketsLeft < 10 ? "text-amber-600" : "text-foreground"}`}>
                    {ticketsLeft > 0 ? ticketsLeft : "Sold out"}
                  </span>
                </div>
              </div>

              {status === "cancelled" ? (
                <Button disabled className="w-full">Concert Cancelled</Button>
              ) : hasTicket ? (
                <div className="space-y-2">
                  <Button className="w-full" disabled={!canWatch} variant={canWatch ? "default" : "outline"}>
                    {canWatch ? (
                      <span className="flex items-center gap-2"><Video className="h-4 w-4" />Watch Now</span>
                    ) : (
                      <span className="flex items-center gap-2"><Ticket className="h-4 w-4" />Ticket Purchased</span>
                    )}
                  </Button>
                  {!canWatch && status === "upcoming" && (
                    <p className="text-xs text-center text-muted-foreground">Stream will be available when the concert starts</p>
                  )}
                </div>
              ) : ticketsLeft === 0 ? (
                <Button disabled className="w-full">Sold Out</Button>
              ) : status === "ended" ? (
                <Button disabled className="w-full">Concert Ended</Button>
              ) : !isTeacher ? (
                <Button className="w-full" onClick={handleBuyTicket} disabled={purchasing || ticketLoading}>
                  {purchasing ? "Redirecting..." : `Buy Ticket — $${(concert.ticketPriceCents / 100).toFixed(2)}`}
                </Button>
              ) : null}

              {!isSignedIn && !hasTicket && status !== "cancelled" && status !== "ended" && (
                <p className="text-xs text-center text-muted-foreground">
                  <Link href="/sign-in" className="text-primary hover:underline">Sign in</Link> to purchase a ticket
                </p>
              )}

              {isTeacher && (
                <div className="pt-2 border-t border-border">
                  <p className="text-xs text-center text-muted-foreground">You are the host of this concert</p>
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
