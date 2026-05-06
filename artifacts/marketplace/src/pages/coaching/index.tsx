import { useState, useCallback, useEffect } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, MapPin, Star, Briefcase, AlertCircle, Linkedin, Users } from "lucide-react";
import { usePageMeta } from "@/hooks/use-page-meta";
import { resolveImageUrl } from "@/lib/image-url";

const SPECIALTIES = [
  "Audition Preparation",
  "Career Development",
  "Music Business",
  "Orchestral Careers",
  "Artist Management",
  "Music Education",
  "Grant Writing",
  "Recording & Production",
  "Music Law",
  "Entrepreneurship",
];

type Coach = {
  id: number;
  userId: string;
  bio: string | null;
  credentials: string | null;
  specialties: string[];
  linkedInUrl: string | null;
  approvalStatus: string;
  sessionRateCents: number | null;
  isOnline: boolean;
  city: string | null;
  country: string | null;
  profileImageUrl: string | null;
  averageRating: number;
  reviewCount: number;
  user: { firstName: string | null; lastName: string | null } | null;
};

export default function CoachingBrowse() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [activeSpecialty, setActiveSpecialty] = useState<string | null>(null);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const apiBase = basePath.replace(/\/[^/]*$/, "");

  usePageMeta({
    title: "Career Coaching — Harmonia",
    description: "Work with industry insiders to accelerate your classical music career.",
  });

  const loadCoaches = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const params = new URLSearchParams();
      if (activeSpecialty) params.set("specialty", activeSpecialty);
      const resp = await fetch(`${apiBase}/api/coaches?${params.toString()}`);
      if (!resp.ok) throw new Error("Failed to load coaches");
      const data = await resp.json() as { coaches: Coach[] };
      setCoaches(data.coaches);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [apiBase, activeSpecialty]);

  useEffect(() => {
    loadCoaches();
  }, [loadCoaches]);

  const filtered = search.trim()
    ? coaches.filter((c) => {
        const q = search.toLowerCase();
        const name = `${c.user?.firstName ?? ""} ${c.user?.lastName ?? ""}`.toLowerCase();
        return (
          name.includes(q) ||
          c.bio?.toLowerCase().includes(q) ||
          c.credentials?.toLowerCase().includes(q) ||
          c.specialties.some((s) => s.toLowerCase().includes(q)) ||
          c.city?.toLowerCase().includes(q)
        );
      })
    : coaches;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4 max-w-5xl">
          <div className="flex items-center gap-3 mb-2">
            <Briefcase className="h-7 w-7 text-primary" />
            <h1 className="text-4xl font-serif font-bold text-foreground">Career Coaching</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Get personalised guidance from industry insiders — orchestral musicians, music lawyers, agents,
            and educators who've navigated the careers you want to build.
          </p>

          <div className="flex gap-3 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search coaches by name, specialty, city…"
                className="pl-10 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            <button
              onClick={() => setActiveSpecialty(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                !activeSpecialty
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/50"
              }`}
            >
              All
            </button>
            {SPECIALTIES.map((s) => (
              <button
                key={s}
                onClick={() => setActiveSpecialty(activeSpecialty === s ? null : s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                  activeSpecialty === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12 max-w-5xl">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl border border-border p-6 space-y-3">
                <div className="flex gap-4">
                  <div className="h-16 w-16 rounded-full bg-muted shrink-0" />
                  <div className="flex-1 space-y-2">
                    <div className="h-5 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                </div>
                <div className="h-16 bg-muted rounded" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4 opacity-70" />
            <h3 className="text-xl font-medium mb-2">Something went wrong</h3>
            <Button variant="outline" onClick={loadCoaches}>Try again</Button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <Users className="h-16 w-16 text-muted-foreground opacity-20 mx-auto mb-6" />
            <h3 className="text-xl font-serif font-medium mb-2">No coaches found</h3>
            <p className="text-muted-foreground mb-6">
              {search || activeSpecialty
                ? "Try adjusting your search or filters."
                : "No coaching profiles are published yet. Check back soon!"}
            </p>
            {(search || activeSpecialty) && (
              <Button variant="outline" onClick={() => { setSearch(""); setActiveSpecialty(null); }}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              {filtered.length} {filtered.length === 1 ? "coach" : "coaches"} available
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filtered.map((coach) => {
                const imgSrc = resolveImageUrl(coach.profileImageUrl, basePath);
                const fullName = `${coach.user?.firstName ?? ""} ${coach.user?.lastName ?? ""}`.trim() || "Coach";
                const avgRating = coach.averageRating / 100;
                return (
                  <Link key={coach.id} href={`/coaching/${coach.userId}`}>
                    <Card className="h-full hover-elevate transition-all border-border cursor-pointer group">
                      <CardContent className="p-6">
                        <div className="flex gap-4 mb-4">
                          <div className="h-16 w-16 rounded-full overflow-hidden bg-muted shrink-0 border border-border">
                            {imgSrc ? (
                              <img src={imgSrc} alt={fullName} className="w-full h-full object-cover object-top" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-2xl font-serif font-bold text-muted-foreground/50">
                                {fullName.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-serif font-semibold text-lg text-foreground group-hover:text-primary transition-colors truncate">
                              {fullName}
                            </h3>
                            {coach.city && (
                              <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                                <MapPin className="h-3.5 w-3.5 shrink-0" />
                                {coach.city}
                              </p>
                            )}
                            {coach.reviewCount > 0 && (
                              <p className="text-sm flex items-center gap-1 mt-0.5">
                                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                <span className="font-medium">{avgRating.toFixed(1)}</span>
                                <span className="text-muted-foreground">({coach.reviewCount})</span>
                              </p>
                            )}
                          </div>
                          {coach.sessionRateCents && (
                            <div className="shrink-0 text-right">
                              <span className="text-lg font-bold text-foreground">
                                ${Math.round(coach.sessionRateCents / 100)}
                              </span>
                              <span className="text-xs text-muted-foreground">/session</span>
                            </div>
                          )}
                        </div>

                        {coach.credentials && (
                          <p className="text-xs font-medium text-primary/80 mb-2 uppercase tracking-wide">
                            {coach.credentials}
                          </p>
                        )}

                        {coach.bio && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
                            {coach.bio}
                          </p>
                        )}

                        <div className="flex flex-wrap gap-1.5">
                          {coach.specialties.slice(0, 3).map((s) => (
                            <Badge key={s} variant="secondary" className="text-xs font-normal">
                              {s}
                            </Badge>
                          ))}
                          {coach.specialties.length > 3 && (
                            <Badge variant="secondary" className="text-xs font-normal">
                              +{coach.specialties.length - 3} more
                            </Badge>
                          )}
                        </div>

                        {coach.linkedInUrl && (
                          <div className="mt-3 pt-3 border-t border-border flex items-center gap-1.5 text-xs text-muted-foreground">
                            <Linkedin className="h-3.5 w-3.5" />
                            <span>LinkedIn profile</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </main>

      <div className="border-t border-border bg-muted/50">
        <div className="container mx-auto px-4 py-12 max-w-5xl text-center">
          <h2 className="text-2xl font-serif font-bold mb-3">Are you an industry insider?</h2>
          <p className="text-muted-foreground mb-6 max-w-lg mx-auto">
            Share your expertise and help the next generation of classical musicians. Apply to become a Harmonia coach.
          </p>
          <Link href="/coaching/apply">
            <Button>Apply to Coach</Button>
          </Link>
        </div>
      </div>

      <Footer />
    </div>
  );
}
