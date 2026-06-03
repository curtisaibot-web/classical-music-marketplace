import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { usePageMeta } from "@/hooks/use-page-meta";
import { Search, MapPin, GraduationCap, CalendarDays, Store, Music } from "lucide-react";
import { useSearchMarketplace } from "@workspace/api-client-react";

export default function SearchPage() {
  const [location, setLocation] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const initialQ = params.get("q") ?? "";
  const initialInstrument = params.get("instrument") ?? "";
  const initialCity = params.get("city") ?? "";

  const [q, setQ] = useState(initialQ);
  const [instrument, setInstrument] = useState(initialInstrument);
  const [city, setCity] = useState(initialCity);

  usePageMeta({
    title: initialQ ? `Search results for "${initialQ}"` : "Search the Marketplace",
    description: "Search classical music teachers, lessons, masterclasses, events, and digital products.",
  });

  const { data, isLoading } = useSearchMarketplace(
    { q: initialQ || undefined, instrument: initialInstrument || undefined, city: initialCity || undefined },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (instrument) next.set("instrument", instrument);
    if (city) next.set("city", city);
    setLocation(`/search?${next.toString()}`);
  };

  const teachers = data?.teachers ?? [];
  const listings = data?.listings ?? [];
  const masterclasses = data?.masterclasses ?? [];
  const digitalProducts = data?.digitalProducts ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-10 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-serif font-bold mb-3">Search the Marketplace</h1>
          <p className="text-muted-foreground">Find teachers, lessons, masterclasses, events, and digital resources.</p>
        </div>

        <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_200px_200px_auto] mb-10">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Teachers, instruments, products…"
          />
          <Input
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            placeholder="Instrument"
          />
          <Input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="City or online"
          />
          <Button type="submit" className="gap-2">
            <Search className="h-4 w-4" /> Search
          </Button>
        </form>

        {isLoading ? (
          <p className="text-muted-foreground">Searching…</p>
        ) : (
          <div className="space-y-10">
            <ResultSection title="Teachers" icon={<GraduationCap className="h-5 w-5" />} count={teachers.length}>
              {teachers.map((teacher) => (
                <Card key={teacher.userId}>
                  <CardContent className="p-5 flex justify-between gap-4 items-start">
                    <div>
                      <Link href={`/teachers/${teacher.userId}`} className="font-semibold text-lg hover:text-primary">
                        {(teacher as { user?: { firstName?: string; lastName?: string } }).user?.firstName}{" "}
                        {(teacher as { user?: { firstName?: string; lastName?: string } }).user?.lastName}
                      </Link>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {teacher.instruments?.join(" · ")}
                      </p>
                      {teacher.city && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" /> {teacher.city}
                        </p>
                      )}
                    </div>
                    {teacher.verificationStatus === "verified" && (
                      <Badge className="bg-emerald-600 shrink-0">Verified</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </ResultSection>

            <ResultSection title="Listings" icon={<Music className="h-5 w-5" />} count={listings.length}>
              {listings.map((listing) => (
                <Card key={listing.id}>
                  <CardContent className="p-5">
                    <p className="font-semibold">{listing.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {listing.instrument} · ${((listing.priceInCents ?? 0) / 100).toFixed(0)}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </ResultSection>

            <ResultSection title="Masterclasses" icon={<CalendarDays className="h-5 w-5" />} count={masterclasses.length}>
              {masterclasses.map((event) => (
                <Card key={event.id}>
                  <CardContent className="p-5">
                    <Link href={`/masterclasses/${event.id}`} className="font-semibold hover:text-primary">
                      {event.title}
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </ResultSection>

            <ResultSection title="Digital Products" icon={<Store className="h-5 w-5" />} count={digitalProducts.length}>
              {digitalProducts.map((product) => (
                <Card key={product.id}>
                  <CardContent className="p-5">
                    <Link href={`/store/${product.id}`} className="font-semibold hover:text-primary">
                      {product.title}
                    </Link>
                    <p className="text-sm text-muted-foreground mt-0.5">{product.category}</p>
                  </CardContent>
                </Card>
              ))}
            </ResultSection>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}

function ResultSection({
  title,
  icon,
  count,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        {icon}
        <h2 className="text-2xl font-serif font-semibold">{title}</h2>
        <Badge variant="secondary">{count}</Badge>
      </div>
      {count === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-muted-foreground text-sm">
          No results found.
        </div>
      ) : (
        <div className="grid gap-3">{children}</div>
      )}
    </section>
  );
}
