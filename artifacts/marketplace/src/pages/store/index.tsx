import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListDigitalProducts } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BookOpen, Search, Download } from "lucide-react";
import { resolveImageUrl } from "@/lib/image-url";

export default function Store() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useListDigitalProducts({ 
    instrument: debouncedSearch || undefined,
    limit: 20 
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-4">Digital Store</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Premium sheet music, exercises, and lesson plans crafted by our master instructors.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by instrument..." 
                className="pl-10 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="animate-pulse bg-muted rounded-xl h-64" />
            ))}
          </div>
        ) : !data?.products.length ? (
          <div className="text-center py-20">
            <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium text-foreground mb-2">No products found</h3>
            <p className="text-muted-foreground">Try adjusting your search criteria.</p>
          </div>
        ) : (
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
                      <Badge variant="outline" className="font-normal text-xs">{product.category}</Badge>
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
        )}
      </main>
      
      <Footer />
    </div>
  );
}
