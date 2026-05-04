import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListListings } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Music, MapPin, SlidersHorizontal, X, AlertCircle } from "lucide-react";
import { usePageMeta } from "@/hooks/use-page-meta";

const LISTING_TYPES = [
  { value: "all", label: "All Types" },
  { value: "lesson", label: "Lessons" },
  { value: "event", label: "Events" },
  { value: "masterclass", label: "Masterclasses" },
  { value: "digital_product", label: "Digital Products" },
];

const INSTRUMENTS = [
  "Piano", "Violin", "Viola", "Cello", "Double Bass",
  "Flute", "Oboe", "Clarinet", "Bassoon", "Saxophone",
  "Trumpet", "French Horn", "Trombone", "Tuba",
  "Harp", "Guitar", "Organ", "Voice",
];

const DAYS_OF_WEEK = [
  { label: "Sun", value: 0 },
  { label: "Mon", value: 1 },
  { label: "Tue", value: 2 },
  { label: "Wed", value: 3 },
  { label: "Thu", value: 4 },
  { label: "Fri", value: 5 },
  { label: "Sat", value: 6 },
];

const SKILL_LEVELS = [
  { value: "all", label: "Any level" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
];

const TYPE_COLORS: Record<string, string> = {
  lesson: "bg-blue-500/10 text-blue-700",
  event: "bg-purple-500/10 text-purple-700",
  masterclass: "bg-amber-500/10 text-amber-700",
  digital_product: "bg-green-500/10 text-green-700",
};

const PRICE_RANGES = [
  { label: "Any price", min: undefined, max: undefined },
  { label: "Under $25", min: undefined, max: 2500 },
  { label: "$25–$75", min: 2500, max: 7500 },
  { label: "$75–$150", min: 7500, max: 15000 },
  { label: "$150+", min: 15000, max: undefined },
];

export default function BrowseListings() {
  const [type, setType] = useState("all");
  const [instrument, setInstrument] = useState("all");
  const [skillLevel, setSkillLevel] = useState("all");
  const [priceRange, setPriceRange] = useState("0");
  const [city, setCity] = useState("");
  const [debouncedCity, setDebouncedCity] = useState("");
  const [dayOfWeek, setDayOfWeek] = useState<number | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  usePageMeta({
    title: "Browse Listings",
    description: "Discover lessons, events, masterclasses, and digital products from world-class classical music educators.",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCity(city), 500);
    return () => clearTimeout(timer);
  }, [city]);

  const selectedRange = PRICE_RANGES[Number(priceRange)];

  const { data, isLoading, isError, refetch } = useListListings({
    type: type === "all" ? undefined : type as "lesson" | "event" | "masterclass" | "digital_product",
    instrument: instrument === "all" ? undefined : instrument,
    skillLevel: skillLevel === "all" ? undefined : skillLevel as "beginner" | "intermediate" | "advanced" | "all",
    city: debouncedCity || undefined,
    minPrice: selectedRange?.min,
    maxPrice: selectedRange?.max,
    dayOfWeek,
    limit: 30,
  });

  const hasActiveFilters = type !== "all" || instrument !== "all" || skillLevel !== "all" || !!city || priceRange !== "0" || dayOfWeek !== undefined;

  const clearFilters = () => {
    setType("all");
    setInstrument("all");
    setSkillLevel("all");
    setPriceRange("0");
    setCity("");
    setDebouncedCity("");
    setDayOfWeek(undefined);
  };

  const listingHref = (listing: {
    type: string;
    id: number;
    teacherId: string;
    digitalProductId?: number | null;
    masterclassEventId?: number | null;
  }) => {
    if (listing.type === "digital_product" && listing.digitalProductId) {
      return `/store/${listing.digitalProductId}`;
    }
    if (listing.type === "masterclass" && listing.masterclassEventId) {
      return `/masterclasses/${listing.masterclassEventId}`;
    }
    return `/teachers/${listing.teacherId}`;
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2">Browse All Listings</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Lessons, events, masterclasses, and digital products from world-class classical music educators.
          </p>

          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by city..."
                  className="pl-10 bg-background"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                />
              </div>
              <Button
                variant={showFilters ? "default" : "outline"}
                onClick={() => setShowFilters(!showFilters)}
                className="shrink-0 gap-2"
              >
                <SlidersHorizontal className="h-4 w-4" />
                Filters
              </Button>
            </div>

            <div className="flex flex-wrap gap-2">
              {LISTING_TYPES.map((lt) => (
                <button
                  key={lt.value}
                  onClick={() => setType(lt.value)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    type === lt.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {lt.label}
                </button>
              ))}
            </div>

            {showFilters && (
              <div className="bg-background border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Instrument</Label>
                  <Select value={instrument} onValueChange={setInstrument}>
                    <SelectTrigger className="bg-background">
                      <SelectValue placeholder="Any instrument" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any instrument</SelectItem>
                      {INSTRUMENTS.map((inst) => (
                        <SelectItem key={inst} value={inst}>{inst}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Skill Level</Label>
                  <Select value={skillLevel} onValueChange={setSkillLevel}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SKILL_LEVELS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Price Range</Label>
                  <Select value={priceRange} onValueChange={setPriceRange}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICE_RANGES.map((range, i) => (
                        <SelectItem key={i} value={String(i)}>{range.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available on Day</Label>
                  <div className="flex flex-wrap gap-2">
                    {DAYS_OF_WEEK.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setDayOfWeek(dayOfWeek === d.value ? undefined : d.value)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          dayOfWeek === d.value
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {hasActiveFilters && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">Active filters:</span>
                {type !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {LISTING_TYPES.find(lt => lt.value === type)?.label}
                    <button onClick={() => setType("all")} className="hover:text-foreground"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
                {instrument !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {instrument}
                    <button onClick={() => setInstrument("all")} className="hover:text-foreground"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
                {skillLevel !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {SKILL_LEVELS.find(s => s.value === skillLevel)?.label}
                    <button onClick={() => setSkillLevel("all")} className="hover:text-foreground"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
                {city && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {city}
                    <button onClick={() => { setCity(""); setDebouncedCity(""); }} className="hover:text-foreground"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
                {priceRange !== "0" && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {PRICE_RANGES[Number(priceRange)]?.label}
                    <button onClick={() => setPriceRange("0")} className="hover:text-foreground"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
                {dayOfWeek !== undefined && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {DAYS_OF_WEEK.find(d => d.value === dayOfWeek)?.label}
                    <button onClick={() => setDayOfWeek(undefined)} className="hover:text-foreground"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
                <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground underline ml-1">
                  Clear all
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(9)].map((_, i) => (
              <div key={i} className="animate-pulse bg-muted rounded-xl h-44 border border-border" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4 opacity-70" />
            <h3 className="text-xl font-medium text-foreground mb-2">Something went wrong</h3>
            <p className="text-muted-foreground mb-6">We couldn't load listings. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : !data?.listings.length ? (
          <div className="text-center py-20 bg-muted/30 rounded-xl border border-border border-dashed">
            <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium text-foreground mb-2">No listings found</h3>
            <p className="text-muted-foreground mb-6">Try adjusting your filters to find more results.</p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>Clear all filters</Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">{data.total} listing{data.total !== 1 ? "s" : ""} found</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.listings.map((listing) => (
                <Link key={listing.id} href={listingHref(listing)}>
                  <Card className="h-full border-border hover:shadow-md transition-all cursor-pointer group">
                    <CardContent className="p-5 flex flex-col h-full">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <Badge
                          variant="secondary"
                          className={`text-xs uppercase tracking-wider shrink-0 ${TYPE_COLORS[listing.type] ?? ""}`}
                        >
                          {listing.type.replace("_", " ")}
                        </Badge>
                        {listing.skillLevel && listing.skillLevel !== "all" && (
                          <Badge variant="outline" className="text-xs capitalize">{listing.skillLevel}</Badge>
                        )}
                      </div>
                      <h3 className="font-serif font-semibold text-foreground text-lg leading-tight mb-2 group-hover:text-primary transition-colors line-clamp-2">
                        {listing.title}
                      </h3>
                      {listing.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mb-3 flex-1">{listing.description}</p>
                      )}
                      <div className="mt-auto pt-3 border-t border-border/60 flex items-center justify-between">
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {listing.instrument && (
                            <span className="flex items-center gap-1">
                              <Music className="h-3 w-3" />{listing.instrument}
                            </span>
                          )}
                          {listing.city && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />{listing.city}
                            </span>
                          )}
                        </div>
                        <span className="font-semibold text-foreground text-sm">
                          ${(listing.priceInCents / 100).toFixed(0)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
