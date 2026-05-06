import { useState } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Music, Users, Calendar, AlertCircle, Target } from "lucide-react";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useListCampaigns } from "@workspace/api-client-react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { resolveImageUrl } from "@/lib/image-url";

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 border-green-200",
  succeeded: "bg-blue-100 text-blue-700 border-blue-200",
  failed: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-gray-100 text-gray-700 border-gray-200",
};

export default function Concerts() {
  usePageMeta({
    title: "Concerts",
    description: "Back fan-funded classical music concerts. Your support brings live music to life.",
  });

  const { data, isLoading, isError, refetch } = useListCampaigns();
  const campaigns = data?.campaigns ?? [];
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2">Crowdfunded Concerts</h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Support live classical music performances. Campaigns use an all-or-nothing model — your card is only charged if the concert reaches its ticket goal.
          </p>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl overflow-hidden border border-border">
                <div className="h-48 bg-muted" />
                <div className="p-6 space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-6 bg-muted rounded w-4/5" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-2 bg-muted rounded" />
                  <div className="h-10 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4 opacity-70" />
            <h3 className="text-xl font-medium text-foreground mb-2">Something went wrong</h3>
            <p className="text-muted-foreground mb-6">We couldn't load the campaigns. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Music className="h-10 w-10 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No campaigns yet</h3>
            <p className="text-muted-foreground">
              No concerts are being crowdfunded right now. Check back soon!
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              {data?.total} active {data?.total === 1 ? "campaign" : "campaigns"}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {campaigns.map((c) => {
                const pct = Math.min(100, Math.round((c.ticketsSold / c.goalCount) * 100));
                const imgSrc = resolveImageUrl(c.coverImageUrl ?? null, basePath);
                const deadline = parseISO(c.deadlineAt);
                const timeLeft = formatDistanceToNow(deadline, { addSuffix: true });

                return (
                  <Link key={c.id} href={`/concerts/${c.id}`}>
                    <Card className="h-full hover-elevate transition-all border-border flex flex-col cursor-pointer overflow-hidden group">
                      <div className="h-48 overflow-hidden bg-muted relative">
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={c.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-muted">
                            <Music className="h-12 w-12 opacity-20" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                        <div className="absolute bottom-3 left-3">
                          <span className={`text-xs font-medium px-2 py-1 rounded-full border ${STATUS_COLORS[c.status] ?? ""}`}>
                            {c.status === "active" ? "Active" : c.status.charAt(0).toUpperCase() + c.status.slice(1)}
                          </span>
                        </div>
                      </div>

                      <CardContent className="p-6 flex flex-col flex-1">
                        <h3 className="font-serif font-semibold text-xl text-foreground mb-1 line-clamp-2">
                          {c.title}
                        </h3>

                        {(c.teacherFirstName || c.teacherLastName) && (
                          <p className="text-sm text-muted-foreground mb-3">
                            by {c.teacherFirstName} {c.teacherLastName}
                          </p>
                        )}

                        {c.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">{c.description}</p>
                        )}

                        <div className="mt-auto">
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="font-medium text-foreground">
                              {c.ticketsSold} / {c.goalCount} tickets
                            </span>
                            <span className="text-muted-foreground">{pct}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden mb-4">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>

                          <div className="flex items-center justify-between text-sm text-muted-foreground border-t border-border pt-4">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3.5 w-3.5" />
                              <span className="text-xs">{timeLeft}</span>
                            </div>
                            <div className="font-medium text-foreground text-base">
                              ${(c.ticketPriceCents / 100).toFixed(0)}<span className="text-sm text-muted-foreground font-normal">/ticket</span>
                            </div>
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
