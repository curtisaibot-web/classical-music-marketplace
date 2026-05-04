import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListDigitalProducts } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Download, X, AlertCircle } from "lucide-react";
import { resolveImageUrl } from "@/lib/image-url";
import { usePageMeta } from "@/hooks/use-page-meta";

const CATEGORIES = ["sheet_music", "lesson_plan", "exercise", "theory", "recording", "other"];
const CATEGORY_LABELS: Record<string, string> = {
  sheet_music: "Sheet Music",
  lesson_plan: "Lesson Plans",
  exercise: "Exercises",
  theory: "Music Theory",
  recording: "Recordings",
  other: "Other",
};

export default function Store() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("");

  usePageMeta({
    title: "Digital Store",
    description: "Premium sheet music, lesson plans, exercises, and recordings from master classical music instructors.",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, isError, refetch } = useListDigitalProducts({
    instrument: debouncedSearch || undefined,
    category: activeCategory || undefined,
    limit: 20,
  });

  const hasActiveFilters = search || activeCategory;

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setActiveCategory("");
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2">Digital Store</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Premium sheet music, exercises, and lesson plans crafted by our master instructors.
          </p>

          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by instrument (e.g. Piano, Violin)..."
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
              {data.products.map((product) => {
                const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
                const imgSrc = resolveImageUrl(product.previewUrl, basePath);
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
                            <BookOpen className="h-12 w-12 text-primary opacity-40 group-hover:scale-110 transition-transform" />
                          </div>
                        )}
                        <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-white/90 bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
                          <Download className="h-3 w-3" />
                          {product.downloadCount}
                        </div>
                      </div>
                      <CardContent className="p-5 flex flex-col flex-1">
                        <div className="flex justify-between items-start mb-2 gap-2">
                          <Badge variant="outline" className="font-normal text-xs">
                            {CATEGORY_LABELS[product.category] ?? product.category}
                          </Badge>
                          <span className="font-semibold text-foreground shrink-0">
                            ${(product.priceInCents / 100).toFixed(2)}
                          </span>
                        </div>
                        <h3 className="font-medium text-foreground mb-1 line-clamp-2">{product.title}</h3>
                        <p className="text-sm text-muted-foreground mb-4">
                          by {product.teacher?.user?.firstName} {product.teacher?.user?.lastName}
                        </p>
                        <div className="mt-auto flex items-center justify-between text-xs text-muted-foreground">
                          <span>{product.instrument || "General"}</span>
                          {product.difficulty && <span className="capitalize">{product.difficulty}</span>}
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
