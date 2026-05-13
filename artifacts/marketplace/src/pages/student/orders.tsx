import { useState } from "react";
import { useListOrders, useCreateOrderCheckout, useRefreshOrderDownload, getListOrdersQueryKey } from "@workspace/api-client-react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreditCard, Download, Receipt, BookOpen, Star, Loader2, AlertCircle, Music, CheckCircle2, Clock, RefreshCw, Video, Ticket } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const LICENSE_LABELS: Record<string, string> = {
  personal: "Personal / Practice",
  performance: "Performance",
  sync: "Sync / Commercial",
};
const LICENSE_COLORS: Record<string, string> = {
  personal: "bg-blue-50 text-blue-700 border-blue-200",
  performance: "bg-purple-50 text-purple-700 border-purple-200",
  sync: "bg-amber-50 text-amber-700 border-amber-200",
};

interface PurchasedLicense {
  id: number;
  licenseType: string;
  priceCents: number;
  status: string;
  expiresAt?: string | null;
  downloadCount: number;
  createdAt: string;
  score?: { id: number; title: string; instrumentation: string; hasFullPdf: boolean } | null;
  composerName?: string | null;
}

export default function StudentOrders() {
  const { data: ordersData, isLoading: ordersLoading } = useListOrders();
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [usedDownloadIds, setUsedDownloadIds] = useState<Set<number>>(new Set());
  const [downloadingLicenseIds, setDownloadingLicenseIds] = useState<Set<number>>(new Set());
  const [checkoutingIds, setCheckoutingIds] = useState<Set<number>>(new Set());
  const [refreshingIds, setRefreshingIds] = useState<Set<number>>(new Set());
  const apiBase = import.meta.env.VITE_API_URL ?? "";
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const queryClient = useQueryClient();
  const createOrderCheckout = useCreateOrderCheckout();
  const refreshDownload = useRefreshOrderDownload();

  const handleCompletePayment = (orderId: number) => {
    setCheckoutingIds((s) => new Set(s).add(orderId));
    const successUrl = `${window.location.origin}${basePath}/payment/success?type=order&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${window.location.origin}${basePath}/payment/cancel`;
    createOrderCheckout.mutate(
      { data: { orderId, successUrl, cancelUrl } },
      {
        onSuccess: (data) => {
          if (data.checkoutUrl) {
            window.location.href = data.checkoutUrl;
          } else {
            toast.error("No checkout URL returned. Please try again.");
            setCheckoutingIds((s) => { const next = new Set(s); next.delete(orderId); return next; });
          }
        },
        onError: () => {
          toast.error("Failed to open payment. Please try again.");
          setCheckoutingIds((s) => { const next = new Set(s); next.delete(orderId); return next; });
        },
      },
    );
  };

  const { data: licensesData, isLoading: licensesLoading } = useQuery({
    queryKey: ["score-licenses", "purchased"],
    queryFn: () =>
      fetch(`${apiBase}/api/score-licenses/purchased`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : { licenses: [] })
        .then((d: { licenses: PurchasedLicense[] }) => d.licenses),
  });

  const activeLicenses = (licensesData ?? []).filter((l) => l.status === "active");

  const getIconForType = (type: string) => {
    switch(type) {
      case 'digital_product': return <BookOpen className="h-5 w-5" />;
      case 'masterclass_performer':
      case 'masterclass_observer': return <Star className="h-5 w-5" />;
      default: return <Receipt className="h-5 w-5" />;
    }
  };

  const formatType = (type: string) =>
    type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');

  const handleDownload = async (orderId: number) => {
    setDownloadingIds((s) => new Set(s).add(orderId));
    try {
      const resp = await fetch(`${apiBase}/api/orders/${orderId}/download`, { credentials: "include" });
      if (resp.status === 410) {
        toast.error("Download link has expired. Use the 'Request new link' button to get a fresh window.");
        return;
      }
      if (resp.status === 403) {
        const data = await resp.json().catch(() => ({}));
        const msg = (data as { error?: string }).error ?? "Download limit reached for this purchase.";
        toast.error(msg);
        if (msg.toLowerCase().includes("already been used") || msg.toLowerCase().includes("already used")) {
          setUsedDownloadIds((s) => new Set(s).add(orderId));
        }
        return;
      }
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? "Failed to get download link");
        return;
      }
      const { downloadUrl } = await resp.json() as { downloadUrl: string };
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      setUsedDownloadIds((s) => new Set(s).add(orderId));
    } catch {
      toast.error("Failed to get download link. Please try again.");
    } finally {
      setDownloadingIds((s) => { const next = new Set(s); next.delete(orderId); return next; });
    }
  };

  const handleRefreshDownload = (orderId: number) => {
    setRefreshingIds((s) => new Set(s).add(orderId));
    refreshDownload.mutate(
      { id: orderId },
      {
        onSuccess: () => {
          toast.success("New 24-hour download window opened!");
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          setUsedDownloadIds((s) => { const next = new Set(s); next.delete(orderId); return next; });
        },
        onError: () => {
          toast.error("Failed to refresh download link. Please try again.");
        },
        onSettled: () => {
          setRefreshingIds((s) => { const next = new Set(s); next.delete(orderId); return next; });
        },
      },
    );
  };

  const handleLicenseDownload = async (licenseId: number) => {
    setDownloadingLicenseIds((s) => new Set(s).add(licenseId));
    try {
      const resp = await fetch(`${apiBase}/api/score-licenses/${licenseId}/download`, { credentials: "include" });
      if (resp.status === 410) {
        toast.error("This sync license has expired. Please renew.");
        return;
      }
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({})) as { error?: string };
        toast.error(d.error ?? "Download failed");
        return;
      }
      const { downloadUrl } = await resp.json() as { downloadUrl: string };
      window.open(downloadUrl, "_blank", "noopener,noreferrer");
      toast.success("Download started");
    } catch {
      toast.error("Failed to download. Please try again.");
    } finally {
      setDownloadingLicenseIds((s) => { const next = new Set(s); next.delete(licenseId); return next; });
    }
  };

  const isDownloadAvailable = (order: {
    id: number; type: string; status: string; downloadExpiresAt?: string | Date | null;
  }) => {
    if (order.type !== "digital_product" || order.status !== "paid") return false;
    if (usedDownloadIds.has(order.id)) return false;
    if (order.downloadExpiresAt && new Date(order.downloadExpiresAt) < new Date()) return false;
    return true;
  };

  const isExpired = (order: { type: string; status: string; downloadExpiresAt?: string | Date | null; }) =>
    order.type === "digital_product" &&
    order.status === "paid" &&
    order.downloadExpiresAt &&
    new Date(order.downloadExpiresAt) < new Date();

  const isLicenseExpired = (l: PurchasedLicense) =>
    !!l.expiresAt && new Date(l.expiresAt) < new Date();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-serif font-bold text-foreground">Purchase History</h1>
          <p className="text-muted-foreground mt-1">Your orders and score licenses.</p>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto space-y-12">

          {/* ── Score Licenses ─────────────────────────────────────────────── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-serif font-semibold flex items-center gap-2">
                <Music className="h-5 w-5 text-primary" />
                Score Licenses
              </h2>
              <Button variant="outline" size="sm" asChild>
                <Link href="/scores">Browse Scores</Link>
              </Button>
            </div>

            {licensesLoading ? (
              <div className="space-y-3">
                {[...Array(2)].map((_, i) => <div key={i} className="animate-pulse bg-muted rounded-xl h-24 border border-border" />)}
              </div>
            ) : activeLicenses.length === 0 ? (
              <div className="text-center py-10 bg-muted/30 rounded-xl border border-border border-dashed">
                <Music className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">No score licenses yet.</p>
                <Button variant="link" asChild className="mt-1 h-auto p-0">
                  <Link href="/scores">Browse the Score Marketplace</Link>
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {activeLicenses.map((lic) => {
                  const expired = isLicenseExpired(lic);
                  const isDownloading = downloadingLicenseIds.has(lic.id);
                  return (
                    <Card key={lic.id} className="border-border hover:shadow-sm transition-all">
                      <CardContent className="p-5">
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Music className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <h3 className="font-semibold text-foreground truncate">
                                {lic.score?.title ?? "Unknown Score"}
                              </h3>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${LICENSE_COLORS[lic.licenseType] ?? "bg-muted text-muted-foreground border-border"}`}>
                                {LICENSE_LABELS[lic.licenseType] ?? lic.licenseType}
                              </span>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {lic.composerName ? `by ${lic.composerName}` : ""}
                              {lic.score?.instrumentation ? ` · ${lic.score.instrumentation}` : ""}
                            </p>
                            <div className="flex flex-wrap gap-3 mt-1 text-xs text-muted-foreground">
                              <span>Purchased {format(new Date(lic.createdAt), "MMM d, yyyy")}</span>
                              <span>{lic.downloadCount} download{lic.downloadCount !== 1 ? "s" : ""}</span>
                              {lic.expiresAt ? (
                                expired ? (
                                  <span className="text-destructive flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Sync license expired
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    Expires {format(new Date(lic.expiresAt), "MMM d, yyyy")}
                                  </span>
                                )
                              ) : (
                                <span className="flex items-center gap-1 text-green-600">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Perpetual
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <p className="font-bold text-foreground">${(lic.priceCents / 100).toFixed(2)}</p>
                            {!expired && lic.score?.hasFullPdf ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleLicenseDownload(lic.id)}
                                disabled={isDownloading}
                                className="gap-1.5"
                              >
                                {isDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                                Download PDF
                              </Button>
                            ) : expired ? (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                                License expired
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">PDF coming soon</span>
                            )}
                            <Button size="sm" variant="ghost" asChild className="text-xs h-7 px-2">
                              <Link href={`/scores/${lic.score?.id ?? ""}`}>View Score</Link>
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Live Concert Tickets ───────────────────────────────────────── */}
          {(() => {
            const liveTickets = (ordersData?.orders ?? []).filter(o => o.type === "live_concert" && o.status === "paid");
            if (liveTickets.length === 0) return null;
            return (
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-serif font-semibold flex items-center gap-2">
                    <Video className="h-5 w-5 text-primary" />
                    Live Concert Tickets
                  </h2>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/live">Browse Live</Link>
                  </Button>
                </div>
                <div className="space-y-3">
                  {liveTickets.map(order => (
                    <Card key={order.id} className="border-border hover:shadow-sm transition-all">
                      <CardContent className="p-5">
                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                          <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Video className="h-5 w-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-0.5">
                              <h3 className="font-semibold text-foreground">Live Concert Ticket</h3>
                              <Badge variant="default" className="uppercase text-[10px] tracking-wider px-2 py-0 h-5">Paid</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Order #{order.id.toString().padStart(6, "0")} · {format(new Date(order.createdAt), "MMM d, yyyy")}
                            </p>
                          </div>
                          <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-3">
                            <p className="font-bold text-foreground">${(order.priceInCents / 100).toFixed(2)}</p>
                            {order.liveConcertId && (
                              <Button size="sm" asChild className="gap-1.5">
                                <Link href={`/live/${order.liveConcertId}`}>
                                  <Ticket className="h-3.5 w-3.5" />
                                  Watch Concert
                                </Link>
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            );
          })()}

          {/* ── Digital Product Orders ─────────────────────────────────────── */}
          <section>
            <h2 className="text-xl font-serif font-semibold mb-4">Digital Product Orders</h2>
            <p className="text-xs text-muted-foreground mb-4">Download links are valid for 24 hours after purchase. If your link expires, you can request a new one at any time.</p>

            {ordersLoading ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />)}
              </div>
            ) : !ordersData?.orders.length ? (
              <div className="text-center py-10 bg-muted/30 rounded-xl border border-border border-dashed">
                <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-50" />
                <p className="text-muted-foreground">No orders yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {ordersData.orders.map((order) => (
                  <Card key={order.id} className="border-border hover-elevate transition-all">
                    <CardContent className="p-6">
                      <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          {getIconForType(order.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1">
                            <h3 className="font-semibold text-lg text-foreground truncate">
                              {formatType(order.type)}
                            </h3>
                            <Badge variant={order.status === 'paid' ? 'default' : 'secondary'} className="uppercase text-[10px] tracking-wider px-2 py-0 h-5">
                              {order.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Order #{order.id.toString().padStart(6, '0')} · {format(new Date(order.createdAt), 'MMM d, yyyy')}
                          </p>
                          {order.downloadExpiresAt && order.type === 'digital_product' && order.status === 'paid' && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {new Date(order.downloadExpiresAt) > new Date()
                                ? `Download available until ${format(new Date(order.downloadExpiresAt), 'MMM d, yyyy h:mm a')}`
                                : "Download link expired"}
                            </p>
                          )}
                        </div>
                        <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-4">
                          <div className="font-bold text-lg text-foreground">
                            ${(order.priceInCents / 100).toFixed(2)}
                          </div>
                          {order.status === "pending" ? (
                            <Button
                              size="sm"
                              onClick={() => handleCompletePayment(order.id)}
                              disabled={checkoutingIds.has(order.id)}
                              className="gap-1.5"
                            >
                              {checkoutingIds.has(order.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CreditCard className="h-3.5 w-3.5" />}
                              Complete Payment
                            </Button>
                          ) : isDownloadAvailable(order) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDownload(order.id)}
                              disabled={downloadingIds.has(order.id)}
                              className="gap-1.5"
                            >
                              {downloadingIds.has(order.id) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                              Download
                            </Button>
                          ) : isExpired(order) ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRefreshDownload(order.id)}
                              disabled={refreshingIds.has(order.id)}
                              className="gap-1.5"
                            >
                              {refreshingIds.has(order.id)
                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                : <RefreshCw className="h-3.5 w-3.5" />}
                              Request new link
                            </Button>
                          ) : usedDownloadIds.has(order.id) ? (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <AlertCircle className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>Downloaded</span>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
