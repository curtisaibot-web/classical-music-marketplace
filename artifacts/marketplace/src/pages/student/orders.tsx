import { useState } from "react";
import { useListOrders } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Receipt, BookOpen, Star, Loader2, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";

export default function StudentOrders() {
  const { data: ordersData, isLoading } = useListOrders();
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [usedDownloadIds, setUsedDownloadIds] = useState<Set<number>>(new Set());
  const apiBase = import.meta.env.VITE_API_URL ?? "";

  const getIconForType = (type: string) => {
    switch(type) {
      case 'digital_product': return <BookOpen className="h-5 w-5" />;
      case 'masterclass_performer':
      case 'masterclass_observer': return <Star className="h-5 w-5" />;
      default: return <Receipt className="h-5 w-5" />;
    }
  };

  const formatType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  const handleDownload = async (orderId: number) => {
    setDownloadingIds((s) => new Set(s).add(orderId));
    try {
      const resp = await fetch(`${apiBase}/api/orders/${orderId}/download`, {
        credentials: "include",
      });
      if (resp.status === 410) {
        toast.error("Download link has expired. Please contact the seller.");
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
      setDownloadingIds((s) => {
        const next = new Set(s);
        next.delete(orderId);
        return next;
      });
    }
  };

  const isDownloadAvailable = (order: {
    id: number;
    type: string;
    status: string;
    downloadExpiresAt?: string | Date | null;
  }) => {
    if (order.type !== "digital_product" || order.status !== "paid") return false;
    if (usedDownloadIds.has(order.id)) return false;
    if (order.downloadExpiresAt && new Date(order.downloadExpiresAt) < new Date()) return false;
    return true;
  };

  const isExpired = (order: {
    type: string;
    status: string;
    downloadExpiresAt?: string | Date | null;
  }) =>
    order.type === "digital_product" &&
    order.status === "paid" &&
    order.downloadExpiresAt &&
    new Date(order.downloadExpiresAt) < new Date();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-serif font-bold text-foreground">Purchase History</h1>
          <p className="text-muted-foreground mt-1">Download links are valid for 24 hours after purchase.</p>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />
              ))}
            </div>
          ) : !ordersData?.orders.length ? (
            <div className="text-center py-20 bg-muted/30 rounded-xl border border-border border-dashed">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-medium text-foreground mb-2">No orders found</h3>
              <p className="text-muted-foreground">You haven't made any purchases yet.</p>
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
                          Order #{order.id.toString().padStart(6, '0')} • {format(new Date(order.createdAt), 'MMM d, yyyy')}
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
                        {isDownloadAvailable(order) ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDownload(order.id)}
                            disabled={downloadingIds.has(order.id)}
                            className="gap-1.5"
                          >
                            {downloadingIds.has(order.id) ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Download className="h-3.5 w-3.5" />
                            )}
                            Download
                          </Button>
                        ) : isExpired(order) ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
                            <span>Link expired</span>
                          </div>
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
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
