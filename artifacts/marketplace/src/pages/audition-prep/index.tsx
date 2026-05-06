import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useListAuditionPrograms } from "@workspace/api-client-react";
import { Music, Search, X, BookOpen, Users, AlertCircle, GraduationCap } from "lucide-react";
import { resolveImageUrl } from "@/lib/image-url";
import { usePageMeta } from "@/hooks/use-page-meta";

const INSTRUMENTS = [
  "Piano", "Violin", "Viola", "Cello", "Double Bass",
  "Flute", "Clarinet", "Oboe", "Trumpet", "Horn", "Voice", "Guitar",
];

const TARGET_LEVELS = [
  { value: "undergraduate", label: "Undergraduate" },
  { value: "postgrad", label: "Postgrad" },
  { value: "professional_orchestra", label: "Professional Orchestra" },
];

const LEVEL_COLORS: Record<string, string> = {
  undergraduate: "bg-blue-100 text-blue-800",
  postgrad: "bg-purple-100 text-purple-800",
  professional_orchestra: "bg-amber-100 text-amber-800",
};

export default function AuditionPrep() {
  const [instrument, setInstrument] = useState("");
  const [debouncedInstrument, setDebouncedInstrument] = useState("");
  const [targetLevel, setTargetLevel] = useState("");

  usePageMeta({
    title: "Audition Prep Programs",
    description:
      "Structured audition preparation programs with specialist coaches. Fixed-length packages for conservatory, postgrad, and orchestra auditions.",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedInstrument(instrument), 400);
    return () => clearTimeout(timer);
  }, [instrument]);

  const { data, isLoading, isError, refetch } = useListAuditionPrograms({
    instrument: debouncedInstrument || undefined,
    targetLevel: (targetLevel as "undergraduate" | "postgrad" | "professional_orchestra") || undefined,
    limit: 24,
  });

  const hasFilter = !!instrument || !!targetLevel;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {/* Hero */}
      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3 mb-3">
            <GraduationCap className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-serif font-bold text-foreground">Audition Prep</h1>
          </div>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Fixed-length, one-to-one coaching packages for conservatory admissions, postgrad auditions, and professional
            orchestra trials. Work with a specialist across a structured program and arrive fully prepared.
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
              <span className="text-xs text-muted-foreground uppercase tracking-wider font-medium">Level:</span>
              {TARGET_LEVELS.map((lvl) => (
                <button
                  key={lvl.value}
                  onClick={() => setTargetLevel(targetLevel === lvl.value ? "" : lvl.value)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    targetLevel === lvl.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                  }`}
                >
                  {lvl.label}
                </button>
              ))}
              {hasFilter && (
                <button
                  onClick={() => { setInstrument(""); setTargetLevel(""); }}
                  className="px-3 py-1 rounded-full text-xs font-medium border border-border text-muted-foreground hover:border-foreground/30 transition-colors flex items-center gap-1"
                >
                  <X className="h-3 w-3" /> Clear all
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl overflow-hidden border border-border">
                <div className="h-10 bg-muted m-6 rounded" />
                <div className="px-6 pb-6 space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-4 bg-muted rounded w-4/5" />
                  <div className="h-10 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4 opacity-70" />
            <h3 className="text-xl font-medium text-foreground mb-2">Something went wrong</h3>
            <p className="text-muted-foreground mb-6">We couldn't load programs. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : !data?.programs.length ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <BookOpen className="h-10 w-10 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No programs found</h3>
            <p className="text-muted-foreground mb-6">
              {hasFilter
                ? "No programs match your filters. Try adjusting your search."
                : "No audition prep programs are available yet. Check back soon!"}
            </p>
            {hasFilter && (
              <Button variant="outline" onClick={() => { setInstrument(""); setTargetLevel(""); }}>
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              {data.total} {data.total === 1 ? "program" : "programs"} available
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {data.programs.map((program) => {
                const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
                const imgSrc = resolveImageUrl(program.teacher?.profileImageUrl ?? null, basePath);
                const levelLabel = TARGET_LEVELS.find((l) => l.value === program.targetLevel)?.label ?? program.targetLevel;

                return (
                  <Link key={program.id} href={`/audition-prep/${program.id}`}>
                    <Card className="h-full hover-elevate transition-all border-border flex flex-col cursor-pointer overflow-hidden group">
                      <CardContent className="p-6 flex flex-col flex-1 gap-4">
                        {/* Teacher avatar + name */}
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-full bg-muted overflow-hidden shrink-0 border border-border">
                            {imgSrc ? (
                              <img src={imgSrc} alt="Teacher" className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <Users className="h-5 w-5 opacity-20" />
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {program.teacher?.firstName} {program.teacher?.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">{program.instrument}</p>
                          </div>
                        </div>

                        {/* Title */}
                        <div>
                          <h3 className="font-serif font-semibold text-lg text-foreground leading-snug mb-2 group-hover:text-primary transition-colors">
                            {program.title}
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            <Badge className={`text-xs font-medium ${LEVEL_COLORS[program.targetLevel] ?? ""}`}>
                              {levelLabel}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {program.sessionCount} sessions
                            </Badge>
                          </div>
                        </div>

                        {/* Syllabus snippet */}
                        {program.syllabusText && (
                          <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
                            {program.syllabusText}
                          </p>
                        )}

                        {/* Price + CTA */}
                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                          <div>
                            <p className="text-xl font-bold text-foreground">
                              ${(program.priceCents / 100).toFixed(0)}
                            </p>
                            <p className="text-xs text-muted-foreground">full package</p>
                          </div>
                          <Button size="sm">View Program</Button>
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
