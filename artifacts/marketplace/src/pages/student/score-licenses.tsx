import { useState, useEffect } from "react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Music, Download, CheckCircle2, AlertCircle, Loader2, Clock } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { usePageMeta } from "@/hooks/use-page-meta";

const LICENSE_LABELS: Record<string, string> = {
  personal: "Personal / Practice",
  performance: "Performance",
  sync: "Sync / Commercial",
};

interface PurchasedLicense {
  id: number;
  licenseType: string;
  status: string;
  priceCents: number;
  expiresAt?: string | null;
  paidAt?: string | null;
  downloadCount: number;
  score?: {
    id: number;
    title: string;
    instrumentation: string;
    genre: string;
    difficulty: string;
  } | null;
  composer?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
}

export default function StudentScoreLicenses() {
  const [licenses, setLicenses] = useState<PurchasedLicense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const apiBase = import.meta.env.VITE_API_URL ?? "";

  usePageMeta({ title: "My Score Licenses" });

  useEffect(() => {
    fetch(`${apiBase}/api/score-licenses/purchased`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((data: { licenses: PurchasedLicense[] } | null) => {
        if (data) setLicenses(data.licenses);
      })
      .catch(() => null)
      .finally(() => setIsLoading(false));
  }, [apiBase]);

  const handleDownload = async (licenseId: number) => {
    setDownloadingIds((s) => new Set(s).add(licenseId));
    try {
      const resp = await fetch(`${apiBase}/api/score-licenses/${licenseId}/download`, {
        credentials: "include",
      });
      const data = await resp.json() as { downloadUrl?: string; error?: string };
      if (resp.status === 410) { toast.error("This sync license has expired. Please renew to download."); return; }
      if (!resp.ok) { toast.error(data.error ?? "Failed to get download link"); return; }
      if (data.downloadUrl) window.open(data.downloadUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Failed to download. Please try again.");
    } finally {
      setDownloadingIds((s) => { const n = new Set(s); n.delete(licenseId); return n; });
    }
  };

  const isExpired = (lic: PurchasedLicense) =>
    lic.licenseType === "sync" && lic.expiresAt && new Date(lic.expiresAt) < new Date();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center gap-3">
            <Music className="h-7 w-7 text-primary" />
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground">My Score Licenses</h1>
              <p className="text-muted-foreground mt-1">Download and manage your licensed compositions.</p>
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />
              ))}
            </div>
          ) : licenses.length === 0 ? (
            <div className="text-center py-20 bg-muted/30 rounded-xl border border-border border-dashed">
              <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-medium text-foreground mb-2">No score licenses yet</h3>
              <p className="text-muted-foreground mb-4">Browse the Score Marketplace to find original compositions to license.</p>
              <Button asChild>
                <a href="/scores">Browse Scores</a>
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {licenses.map((lic) => {
                const expired = isExpired(lic);
                const composerName = lic.composer
                  ? [lic.composer.firstName, lic.composer.lastName].filter(Boolean).join(" ")
                  : "Unknown Composer";
                return (
                  <Card key={lic.id} className="border-border">
                    <CardContent className="p-6">
                      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Music className="h-5 w-5" />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <h3 className="font-semibold text-lg text-foreground truncate">
                              {lic.score?.title ?? "Unknown Score"}
                            </h3>
                            <Badge variant={lic.status === "active" ? "default" : "secondary"} className="uppercase text-[10px] tracking-wider px-2 py-0 h-5">
                              {lic.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {composerName} · {lic.score?.instrumentation} · {LICENSE_LABELS[lic.licenseType] ?? lic.licenseType}
                          </p>
                          {lic.paidAt && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Purchased {format(new Date(lic.paidAt), "MMM d, yyyy")}
                            </p>
                          )}
                          {lic.licenseType === "sync" && lic.expiresAt && (
                            <p className={`text-xs mt-0.5 flex items-center gap-1 ${expired ? "text-destructive" : "text-muted-foreground"}`}>
                              <Clock className="h-3 w-3" />
                              {expired
                                ? "License expired"
                                : `Valid until ${format(new Date(lic.expiresAt), "MMM d, yyyy")}`}
                            </p>
                          )}
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3">
                          <div className="font-bold text-foreground">${(lic.priceCents / 100).toFixed(2)}</div>
                          {lic.status === "active" && !expired ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(lic.id)}
                              disabled={downloadingIds.has(lic.id)}
                              className="gap-1.5"
                            >
                              {downloadingIds.has(lic.id) ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="h-3.5 w-3.5" />
                              )}
                              Download Score
                            </Button>
                          ) : expired ? (
                            <div className="flex items-center gap-1 text-xs text-destructive">
                              <AlertCircle className="h-3.5 w-3.5" />
                              <span>Expired</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>Pending</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
