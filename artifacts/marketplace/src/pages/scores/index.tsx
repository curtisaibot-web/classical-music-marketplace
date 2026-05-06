import { useState, useEffect, useCallback } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Music, Search, Clock, BarChart3 } from "lucide-react";
import { usePageMeta } from "@/hooks/use-page-meta";

const GENRES = ["Baroque", "Classical", "Romantic", "Contemporary", "Jazz", "Film", "Sacred", "Folk"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced", "professional"];
const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  professional: "Professional",
};
const DIFFICULTY_COLORS: Record<string, string> = {
  beginner: "bg-green-100 text-green-800",
  intermediate: "bg-blue-100 text-blue-800",
  advanced: "bg-orange-100 text-orange-800",
  professional: "bg-red-100 text-red-800",
};
const LICENSE_TYPES = ["personal", "performance", "sync"];
const LICENSE_LABELS: Record<string, string> = {
  personal: "Personal",
  performance: "Performance",
  sync: "Sync / Commercial",
};

interface ScoreLicense {
  id: number;
  licenseType: string;
  priceCents: number;
}

interface Score {
  id: number;
  title: string;
  instrumentation: string;
  difficulty: string;
  genre: string;
  durationSeconds?: number | null;
  description?: string | null;
  previewPdfKey?: string | null;
  licenses: ScoreLicense[];
  minPriceCents?: number | null;
  composer?: { user?: { firstName?: string | null; lastName?: string | null } | null } | null;
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ScoreCard({ score }: { score: Score }) {
  const composerName = score.composer?.user
    ? [score.composer.user.firstName, score.composer.user.lastName].filter(Boolean).join(" ")
    : "Unknown Composer";
  const minPrice = score.minPriceCents ? (score.minPriceCents / 100).toFixed(2) : null;

  return (
    <Link href={`/scores/${score.id}`}>
      <Card className="border-border hover:shadow-md transition-all cursor-pointer group h-full">
        <CardContent className="p-5 flex flex-col gap-3 h-full">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="font-serif font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                {score.title}
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">{composerName}</p>
            </div>
            <Badge className={`shrink-0 text-xs ${DIFFICULTY_COLORS[score.difficulty] ?? "bg-muted text-foreground"}`}>
              {DIFFICULTY_LABELS[score.difficulty] ?? score.difficulty}
            </Badge>
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant="outline" className="text-xs">{score.instrumentation}</Badge>
            <Badge variant="outline" className="text-xs">{score.genre}</Badge>
            {score.durationSeconds && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                {formatDuration(score.durationSeconds)}
              </span>
            )}
          </div>

          {score.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">{score.description}</p>
          )}

          <div className="mt-auto pt-2 border-t border-border flex items-center justify-between">
            <div className="flex gap-1 flex-wrap">
              {score.licenses.slice(0, 3).map((l) => (
                <span key={l.id} className="text-xs text-muted-foreground">
                  {LICENSE_LABELS[l.licenseType] ?? l.licenseType}
                </span>
              )).reduce((acc, el, i) => [
                ...acc,
                i > 0 ? <span key={`sep-${i}`} className="text-xs text-muted-foreground">·</span> : null,
                el,
              ], [] as React.ReactNode[])}
            </div>
            {minPrice && (
              <span className="text-sm font-semibold text-foreground">from ${minPrice}</span>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function ScoresBrowse() {
  const [search, setSearch] = useState("");
  const [activeGenre, setActiveGenre] = useState("");
  const [activeDifficulty, setActiveDifficulty] = useState("");
  const [activeLicenseType, setActiveLicenseType] = useState("");
  const [scores, setScores] = useState<Score[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const apiBase = import.meta.env.VITE_API_URL ?? "";

  usePageMeta({
    title: "Score Marketplace",
    description: "Discover and license original compositions — from string quartets to film scores — by composers on Harmonia.",
  });

  const loadScores = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "24", offset: "0" });
      if (activeGenre) params.set("genre", activeGenre);
      if (activeDifficulty) params.set("difficulty", activeDifficulty);
      if (activeLicenseType) params.set("licenseType", activeLicenseType);
      if (search.trim()) params.set("instrumentation", search.trim());
      const resp = await fetch(`${apiBase}/api/scores?${params.toString()}`);
      if (resp.ok) {
        const data = await resp.json() as { scores: Score[]; total: number };
        setScores(data.scores);
        setTotal(data.total);
      }
    } finally {
      setIsLoading(false);
    }
  }, [activeGenre, activeDifficulty, activeLicenseType, search, apiBase]);

  useEffect(() => {
    loadScores();
  }, [loadScores]);

  const applyFilter = (key: string, value: string, setter: (v: string) => void) => {
    setter(value);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex items-center gap-3 mb-3">
            <Music className="h-7 w-7 text-primary" />
            <h1 className="text-4xl font-serif font-bold text-foreground">Score Marketplace</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Discover and license original compositions — from string quartets to film scores — by composers on Harmonia.
          </p>

          <div className="relative max-w-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by instrumentation (e.g. String Quartet, SATB)..."
              className="pl-10 bg-background"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") loadScores(); }}
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 max-w-6xl py-8 flex-1">
        <div className="flex gap-8">
          <aside className="w-52 shrink-0 hidden md:block">
            <div className="space-y-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Genre</p>
                <div className="space-y-1">
                  <button
                    onClick={() => applyFilter("genre", "", setActiveGenre)}
                    className={`block w-full text-left text-sm px-2 py-1 rounded transition-colors ${!activeGenre ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    All Genres
                  </button>
                  {GENRES.map((g) => (
                    <button
                      key={g}
                      onClick={() => applyFilter("genre", g, setActiveGenre)}
                      className={`block w-full text-left text-sm px-2 py-1 rounded transition-colors ${activeGenre === g ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Difficulty</p>
                <div className="space-y-1">
                  <button
                    onClick={() => applyFilter("difficulty", "", setActiveDifficulty)}
                    className={`block w-full text-left text-sm px-2 py-1 rounded transition-colors ${!activeDifficulty ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    All Levels
                  </button>
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      onClick={() => applyFilter("difficulty", d, setActiveDifficulty)}
                      className={`block w-full text-left text-sm px-2 py-1 rounded transition-colors ${activeDifficulty === d ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {DIFFICULTY_LABELS[d]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">License Type</p>
                <div className="space-y-1">
                  <button
                    onClick={() => applyFilter("licenseType", "", setActiveLicenseType)}
                    className={`block w-full text-left text-sm px-2 py-1 rounded transition-colors ${!activeLicenseType ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    All Types
                  </button>
                  {LICENSE_TYPES.map((lt) => (
                    <button
                      key={lt}
                      onClick={() => applyFilter("licenseType", lt, setActiveLicenseType)}
                      className={`block w-full text-left text-sm px-2 py-1 rounded transition-colors ${activeLicenseType === lt ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"}`}
                    >
                      {LICENSE_LABELS[lt]}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setActiveGenre(""); setActiveDifficulty(""); setActiveLicenseType(""); setSearch("");
                }}
              >
                Clear Filters
              </Button>
            </div>
          </aside>

          <div className="flex-1 min-w-0">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-52 rounded-lg bg-muted animate-pulse" />
                ))}
              </div>
            ) : scores.length === 0 ? (
              <div className="text-center py-20">
                <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-serif text-foreground mb-1">No scores found</p>
                <p className="text-muted-foreground">Try adjusting your filters or check back later.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">{total} score{total !== 1 ? "s" : ""} found</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                  {scores.map((s) => <ScoreCard key={s.id} score={s} />)}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
