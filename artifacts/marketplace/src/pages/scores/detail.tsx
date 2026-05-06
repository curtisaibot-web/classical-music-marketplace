import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Music, Clock, BarChart3, Download, Play, CheckCircle2, Loader2, AlertCircle, ArrowLeft, FileText } from "lucide-react";
import { toast } from "sonner";
import { usePageMeta } from "@/hooks/use-page-meta";

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

const LICENSE_TYPES = ["personal", "performance", "sync"] as const;
const LICENSE_LABELS: Record<string, string> = {
  personal: "Personal / Practice",
  performance: "Performance",
  sync: "Sync / Commercial",
};
const LICENSE_DESCRIPTIONS: Record<string, string> = {
  personal: "For private study and practice only. Cannot be performed publicly or used commercially.",
  performance: "Includes rights for public performances, concerts, and recitals. Perpetual license.",
  sync: "Includes synchronisation rights for film, TV, and commercial use. Valid for 1 year from purchase.",
};
const LICENSE_FEATURES: Record<string, string[]> = {
  personal: ["Private practice & study", "Personal digital copy", "Perpetual license"],
  performance: ["Public performance rights", "Concert & recital use", "Perpetual license", "All personal rights included"],
  sync: ["Film & TV synchronisation", "Commercial advertising", "Online video content", "All performance rights included", "1-year renewable license"],
};

interface ScoreLicense {
  id: number;
  licenseType: string;
  priceCents: number;
  isActive: boolean;
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
  audioDemoKey?: string | null;
  licenses: ScoreLicense[];
  composer?: { user?: { firstName?: string | null; lastName?: string | null } | null; bio?: string | null } | null;
}

function formatDuration(seconds?: number | null): string {
  if (!seconds) return "";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function ScoreDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { user, isLoaded: isUserLoaded } = useUser();
  const [score, setScore] = useState<Score | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedLicense, setSelectedLicense] = useState<ScoreLicense | null>(null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchasedLicenseTypes, setPurchasedLicenseTypes] = useState<Set<string>>(new Set());
  const [isLoadingPurchased, setIsLoadingPurchased] = useState(false);
  const apiBase = import.meta.env.VITE_API_URL ?? "";

  usePageMeta({ title: score?.title ?? "Score Detail" });

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    fetch(`${apiBase}/api/scores/${id}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r))
      .then((data: Score) => {
        setScore(data);
        const orderedLicenses = LICENSE_TYPES
          .map((lt) => data.licenses.find((l) => l.licenseType === lt))
          .filter(Boolean) as ScoreLicense[];
        if (orderedLicenses.length > 0) setSelectedLicense(orderedLicenses[0]);
      })
      .catch(() => toast.error("Failed to load score"))
      .finally(() => setIsLoading(false));
  }, [id, apiBase]);

  useEffect(() => {
    if (!user) return;
    setIsLoadingPurchased(true);
    fetch(`${apiBase}/api/score-licenses/purchased`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { licenses: Array<{ scoreId: number; licenseType: string; status: string }> } | null) => {
        if (!data) return;
        const myLicenses = data.licenses.filter((l) => l.scoreId === Number(id) && l.status === "active");
        setPurchasedLicenseTypes(new Set(myLicenses.map((l) => l.licenseType)));
      })
      .catch(() => null)
      .finally(() => setIsLoadingPurchased(false));
  }, [user, id, apiBase]);

  const handlePurchase = async () => {
    if (!selectedLicense) return;
    if (!user) { navigate("/sign-in"); return; }

    setIsPurchasing(true);
    try {
      const baseUrl = window.location.origin + import.meta.env.BASE_URL.replace(/\/$/, "");
      const resp = await fetch(`${apiBase}/api/stripe/checkout/score-license`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          licenseId: selectedLicense.id,
          successUrl: `${baseUrl}/payment/success`,
          cancelUrl: `${baseUrl}/scores/${id}`,
        }),
      });
      const data = await resp.json() as { checkoutUrl?: string; error?: string };
      if (!resp.ok) { toast.error(data.error ?? "Failed to start checkout"); return; }
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch {
      toast.error("Failed to start checkout. Please try again.");
    } finally {
      setIsPurchasing(false);
    }
  };

  const composerName = score?.composer?.user
    ? [score.composer.user.firstName, score.composer.user.lastName].filter(Boolean).join(" ")
    : "Unknown Composer";

  const orderedLicenses = score
    ? LICENSE_TYPES.map((lt) => score.licenses.find((l) => l.licenseType === lt)).filter(Boolean) as ScoreLicense[]
    : [];

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
        <Footer />
      </div>
    );
  }

  if (!score) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-lg font-serif">Score not found</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const alreadyOwned = selectedLicense ? purchasedLicenseTypes.has(selectedLicense.licenseType) : false;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="container mx-auto px-4 max-w-5xl py-8 flex-1">
        <button
          onClick={() => navigate("/scores")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Score Marketplace
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="flex items-start gap-3 mb-2">
                <Music className="h-8 w-8 text-primary mt-1 shrink-0" />
                <div>
                  <h1 className="text-3xl font-serif font-bold text-foreground">{score.title}</h1>
                  <p className="text-lg text-muted-foreground mt-1">by {composerName}</p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge className={DIFFICULTY_COLORS[score.difficulty] ?? "bg-muted text-foreground"}>
                {DIFFICULTY_LABELS[score.difficulty] ?? score.difficulty}
              </Badge>
              <Badge variant="outline">{score.instrumentation}</Badge>
              <Badge variant="outline">{score.genre}</Badge>
              {score.durationSeconds && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {formatDuration(score.durationSeconds)}
                </Badge>
              )}
            </div>

            {score.description && (
              <div>
                <h2 className="text-lg font-semibold mb-2">About this Score</h2>
                <p className="text-muted-foreground whitespace-pre-line">{score.description}</p>
              </div>
            )}

            {score.previewPdfKey && (
              <Card className="bg-muted/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <FileText className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Preview Score</p>
                    <p className="text-xs text-muted-foreground">View the first few pages</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toast.info("Preview available after upload")}>
                    <Download className="h-3 w-3 mr-1" />
                    Preview
                  </Button>
                </CardContent>
              </Card>
            )}

            {score.audioDemoKey && (
              <Card className="bg-muted/30">
                <CardContent className="p-4 flex items-center gap-3">
                  <Play className="h-5 w-5 text-primary" />
                  <div className="flex-1">
                    <p className="font-medium text-sm">Audio Demo</p>
                    <p className="text-xs text-muted-foreground">Listen to a performance excerpt</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => toast.info("Audio player coming soon")}>
                    <Play className="h-3 w-3 mr-1" />
                    Play
                  </Button>
                </CardContent>
              </Card>
            )}

            <div>
              <h2 className="text-lg font-semibold mb-1">About the Composer</h2>
              <p className="text-muted-foreground">
                {(score.composer as { bio?: string | null } | null)?.bio ?? `${composerName} is a composer on Harmonia.`}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <Card className="border-border">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-serif">Choose a License</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {orderedLicenses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No license tiers available.</p>
                ) : orderedLicenses.map((lic) => {
                  const isOwned = purchasedLicenseTypes.has(lic.licenseType);
                  const isSelected = selectedLicense?.id === lic.id;
                  return (
                    <button
                      key={lic.id}
                      onClick={() => setSelectedLicense(lic)}
                      className={`w-full text-left p-3 rounded-lg border-2 transition-all ${
                        isSelected ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-sm">{LICENSE_LABELS[lic.licenseType] ?? lic.licenseType}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {LICENSE_DESCRIPTIONS[lic.licenseType] ?? ""}
                          </p>
                        </div>
                        <div className="text-right ml-3 shrink-0">
                          {isOwned ? (
                            <span className="flex items-center gap-1 text-xs text-green-600 font-medium">
                              <CheckCircle2 className="h-3 w-3" />
                              Owned
                            </span>
                          ) : (
                            <span className="font-semibold text-sm">${(lic.priceCents / 100).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}

                {selectedLicense && (
                  <div className="pt-2">
                    <Separator className="mb-3" />
                    <div className="space-y-1 mb-4">
                      {(LICENSE_FEATURES[selectedLicense.licenseType] ?? []).map((f) => (
                        <div key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                          {f}
                        </div>
                      ))}
                    </div>

                    {alreadyOwned ? (
                      <div className="flex items-center gap-2 text-sm text-green-600 font-medium p-3 bg-green-50 rounded-lg">
                        <CheckCircle2 className="h-4 w-4" />
                        You already own this license
                      </div>
                    ) : (
                      <Button
                        className="w-full"
                        onClick={handlePurchase}
                        disabled={isPurchasing || isLoadingPurchased}
                      >
                        {isPurchasing ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                        ) : !isUserLoaded || isLoadingPurchased ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Loading…</>
                        ) : !user ? (
                          "Sign In to Purchase"
                        ) : (
                          `Buy ${LICENSE_LABELS[selectedLicense.licenseType] ?? "License"} — $${(selectedLicense.priceCents / 100).toFixed(2)}`
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-muted/40 border-0">
              <CardContent className="p-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What you get</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                  Full score PDF download
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                  Rights as specified by license tier
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Music className="h-3.5 w-3.5 shrink-0" />
                  Direct composer royalty
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
