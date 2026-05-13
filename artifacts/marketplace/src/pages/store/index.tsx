import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Music, FileText, Search, Download, X, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { resolveImageUrl } from "@/lib/image-url";
import { usePageMeta } from "@/hooks/use-page-meta";
import { useUser } from "@clerk/react";
import { useCreateOrder, useCreateOrderCheckout, useListDigitalProducts } from "@workspace/api-client-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";

const CATEGORIES = ["sheet_music", "lesson_plan", "backing_track", "arrangement", "other"];
const CATEGORY_LABELS: Record<string, string> = {
  sheet_music: "Sheet Music",
  lesson_plan: "Lesson Plans",
  backing_track: "Backing Tracks",
  arrangement: "Arrangements",
  other: "Other",
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "backing_track": return <Music className="h-10 w-10 text-primary opacity-40" />;
    case "sheet_music":
    case "arrangement": return <FileText className="h-10 w-10 text-primary opacity-40" />;
    default: return <BookOpen className="h-10 w-10 text-primary opacity-40" />;
  }
};

interface StoreProduct {
  id: number;
  title: string;
  category: string;
  instrument?: string | null;
  difficulty?: string | null;
  priceInCents: number;
  downloadCount: number;
  previewUrl?: string | null;
  teacher?: {
    user?: { firstName?: string | null; lastName?: string | null } | null;
    profileImageUrl?: string | null;
  } | null;
}

export default function Store() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [checkoutingId, setCheckoutingId] = useState<number | null>(null);

  const debouncedSearch = useDebounce(search, 400);

  usePageMeta({
    title: "Digital Store",
    description: "Premium sheet music, lesson plans, backing tracks, and arrangements from master classical music instructors.",
  });

  const { user, isLoaded } = useUser();
  const [, navigate] = useLocation();
  const createOrder = useCreateOrder();
  const createCheckout = useCreateOrderCheckout();

  const { data, isLoading, isError, refetch } = useListDigitalProducts({
    q: debouncedSearch || undefined,
    category: activeCategory || undefined,
    limit: 40,
  } as Parameters<typeof useListDigitalProducts>[0]);

  const hasActiveFilters = search || activeCategory;

  const clearFilters = () => {
    setSearch("");
    setActiveCategory("");
  };

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleBuy = (e: React.MouseEvent, product: StoreProduct) => {
    e.preventDefault();
    e.stopPropagation();

    if (!isLoaded || !user) {
      toast.error("Please sign in to purchase.");
      navigate("/sign-in");
      return;
    }

    if (checkoutingId === product.id) return;
    setCheckoutingId(product.id);

    createOrder.mutate(
      { data: { type: "digital_product", digitalProductId: product.id } },
      {
        onSuccess: (order) => {
          const successUrl = `${window.location.origin}${basePath}/payment/success?type=order&session_id={CHECKOUT_SESSION_ID}`;
          const cancelUrl = `${window.location.origin}${basePath}/payment/cancel`;
          createCheckout.mutate(
            { data: { orderId: order.id, successUrl, cancelUrl } },
            {
              onSuccess: (data) => {
                if (data.checkoutUrl) window.location.href = data.checkoutUrl;
              },
              onError: () => {
                toast.error("Failed to open payment. Please try again.");
                setCheckoutingId(null);
              },
            },
          );
        },
        onError: () => {
          toast.error("Failed to initiate purchase. Please try again.");
          setCheckoutingId(null);
        },
      },
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2">Digital Store</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Premium sheet music, backing tracks, and lesson plans crafted by our master instructors.
          </p>

          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by title or instrument (e.g. Piano Sonata, Violin)..."
                className="pl-10 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setActiveCategory("")}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  !activeCategory
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                }`}
              >
                All Categories
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(activeCategory === cat ? "" : cat)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    activeCategory === cat
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-foreground/30"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
            </div>

            {hasActiveFilters && (
              <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-fit">
                <X className="h-3.5 w-3.5" /> Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse rounded-xl overflow-hidden border border-border">
                <div className="h-40 bg-muted" />
                <div className="p-5 space-y-3">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-5 bg-muted rounded w-4/5" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                  <div className="h-8 bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4 opacity-70" />
            <h3 className="text-xl font-medium text-foreground mb-2">Something went wrong</h3>
            <p className="text-muted-foreground mb-6">We couldn't load the digital store. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : !data?.products.length ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <BookOpen className="h-10 w-10 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No products found</h3>
            <p className="text-muted-foreground mb-6">
              {hasActiveFilters
                ? "No products match your current filters. Try a different search."
                : "No digital products are available yet. Check back soon!"}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              {data.total} {data.total === 1 ? "product" : "products"} found
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {(data.products as StoreProduct[]).map((product) => {
                const imgSrc = resolveImageUrl(product.previewUrl ?? null, basePath);
                const isBuying = checkoutingId === product.id;
                return (
                  <Link key={product.id} href={`/store/${product.id}`}>
                    <Card className="h-full hover-elevate transition-all border-border flex flex-col cursor-pointer group overflow-hidden">
                      <div className="h-40 bg-secondary/30 relative border-b border-border overflow-hidden">
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={product.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            {getCategoryIcon(product.category)}
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-white/90 bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                          <Download className="h-3 w-3" />
                          {product.downloadCount}
                        </div>
                      </div>
                      <CardContent className="p-5 flex flex-col flex-1">
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <Badge variant="outline" className="font-normal text-xs shrink-0">
                            {CATEGORY_LABELS[product.category] ?? product.category}
                          </Badge>
                          <span className="font-semibold text-foreground shrink-0">
                            ${(product.priceInCents / 100).toFixed(2)}
                          </span>
                        </div>
                        <h3 className="font-medium text-foreground mb-1 line-clamp-2">{product.title}</h3>
                        <p className="text-sm text-muted-foreground mb-3">
                          by {product.teacher?.user?.firstName} {product.teacher?.user?.lastName}
                        </p>
                        {product.instrument && (
                          <p className="text-xs text-muted-foreground mb-3">{product.instrument}{product.difficulty ? ` · ${product.difficulty}` : ""}</p>
                        )}
                        <div className="mt-auto">
                          <Button
                            size="sm"
                            className="w-full gap-1.5"
                            onClick={(e) => handleBuy(e, product)}
                            disabled={isBuying}
                          >
                            {isBuying ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Opening checkout…
                              </>
                            ) : (
                              <>
                                <ShieldCheck className="h-3.5 w-3.5" />
                                Buy · ${(product.priceInCents / 100).toFixed(2)}
                              </>
                            )}
                          </Button>
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
