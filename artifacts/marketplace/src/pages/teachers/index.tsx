import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListTeachers } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Star, Music, MapPin, SlidersHorizontal, X, AlertCircle } from "lucide-react";
import { resolveImageUrl } from "@/lib/image-url";
import { usePageMeta } from "@/hooks/use-page-meta";
import { Badge } from "@/components/ui/badge";

const INSTRUMENTS = [
  "Piano", "Violin", "Viola", "Cello", "Double Bass",
  "Flute", "Oboe", "Clarinet", "Bassoon", "Saxophone",
  "Trumpet", "French Horn", "Trombone", "Tuba",
  "Harp", "Guitar", "Organ", "Voice",
];

const PRICE_RANGES = [
  { label: "Any price", min: undefined, max: undefined },
  { label: "Under $50/hr", min: undefined, max: 5000 },
  { label: "$50–$100/hr", min: 5000, max: 10000 },
  { label: "$100–$150/hr", min: 10000, max: 15000 },
  { label: "$150+/hr", min: 15000, max: undefined },
];

const LISTING_TYPES = [
  { value: "all", label: "Any type" },
  { value: "lesson", label: "Lessons" },
  { value: "event", label: "Events" },
  { value: "masterclass", label: "Masterclasses" },
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

export default function Teachers() {
  const [instrument, setInstrument] = useState("");
  const [city, setCity] = useState("");
  const [debouncedCity, setDebouncedCity] = useState("");
  const [priceRange, setPriceRange] = useState("0");
  const [listingType, setListingType] = useState("all");
  const [dayOfWeek, setDayOfWeek] = useState<number | undefined>(undefined);
  const [showFilters, setShowFilters] = useState(false);

  usePageMeta({
    title: "Find a Teacher",
    description: "Browse world-class classical music instructors offering private lessons in piano, violin, cello, and more.",
  });

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedCity(city), 500);
    return () => clearTimeout(timer);
  }, [city]);

  const selectedRange = PRICE_RANGES[Number(priceRange)];

  const { data, isLoading, isError, refetch } = useListTeachers({
    instrument: instrument === "all" ? undefined : instrument || undefined,
    city: debouncedCity || undefined,
    minRate: selectedRange?.min,
    maxRate: selectedRange?.max,
    listingType: listingType === "all" ? undefined : listingType as "lesson" | "event" | "masterclass" | "digital_product" | undefined,
    dayOfWeek: dayOfWeek,
    limit: 20,
  });

  const hasActiveFilters = (instrument && instrument !== "all") || city || priceRange !== "0" || listingType !== "all" || dayOfWeek !== undefined;

  const clearFilters = () => {
    setInstrument("");
    setCity("");
    setDebouncedCity("");
    setPriceRange("0");
    setListingType("all");
    setDayOfWeek(undefined);
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-2">Find a Teacher</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Browse our curated selection of world-class classical musicians offering private instruction.
          </p>

          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by city (e.g. New York, London)"
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
                {hasActiveFilters && (
                  <Badge className="bg-white text-primary ml-1 px-1.5 py-0 text-xs">
                    {[instrument, city, priceRange !== "0" ? "price" : ""].filter(Boolean).length}
                  </Badge>
                )}
              </Button>
            </div>

            {showFilters && (
              <div className="bg-background border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Instrument</Label>
                  <Select value={instrument || "all"} onValueChange={(v) => setInstrument(v === "all" ? "" : v)}>
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
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Listing Type</Label>
                  <Select value={listingType} onValueChange={setListingType}>
                    <SelectTrigger className="bg-background">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LISTING_TYPES.map((lt) => (
                        <SelectItem key={lt.value} value={lt.value}>{lt.label}</SelectItem>
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
                <div className="space-y-1.5 sm:col-span-3">
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
                {instrument && instrument !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {instrument}
                    <button onClick={() => setInstrument("")} className="hover:text-foreground"><X className="h-3 w-3" /></button>
                  </Badge>
                )}
                {listingType && listingType !== "all" && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    {LISTING_TYPES.find(lt => lt.value === listingType)?.label}
                    <button onClick={() => setListingType("all")} className="hover:text-foreground"><X className="h-3 w-3" /></button>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse space-y-0 rounded-xl overflow-hidden border border-border">
                <div className="bg-muted h-72" />
                <div className="p-6 space-y-3">
                  <div className="h-5 bg-muted rounded w-3/4" />
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-12 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-full" />
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4 opacity-70" />
            <h3 className="text-xl font-medium text-foreground mb-2">Something went wrong</h3>
            <p className="text-muted-foreground mb-6">We couldn't load the teachers list. Please try again.</p>
            <Button variant="outline" onClick={() => refetch()}>Try again</Button>
          </div>
        ) : !data?.teachers.length ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Music className="h-10 w-10 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No teachers found</h3>
            <p className="text-muted-foreground mb-6">
              {hasActiveFilters
                ? "No teachers match your current filters. Try broadening your search."
                : "There are no teachers listed yet. Check back soon!"}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
            )}
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-6">
              {data.total} {data.total === 1 ? "teacher" : "teachers"} found
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {data.teachers.map((teacher) => {
                const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
                const imgSrc = resolveImageUrl(teacher.profileImageUrl, basePath);
                return (
                  <Link key={teacher.id} href={`/teachers/${teacher.userId}`}>
                    <Card className="h-full hover-elevate transition-all border-border overflow-hidden group cursor-pointer flex flex-col">
                      <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                        {imgSrc ? (
                          <img
                            src={imgSrc}
                            alt={`${teacher.user?.firstName} ${teacher.user?.lastName}`}
                            className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-secondary text-secondary-foreground">
                            <Music className="h-16 w-16 opacity-20" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                        <div className="absolute top-4 right-4 bg-black/60 backdrop-blur-sm text-white px-2.5 py-1.5 rounded-md text-sm font-medium flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                          {teacher.reviewCount > 0 ? (teacher.averageRating / 100).toFixed(1) : "New"}
                        </div>
                      </div>
                      <CardContent className="p-6 flex flex-col flex-1">
                        <h3 className="font-serif font-semibold text-xl text-foreground mb-1">
                          {teacher.user?.firstName} {teacher.user?.lastName}
                        </h3>
                        <p className="text-primary font-medium mb-4">
                          {teacher.instruments.join(", ")}
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-3 mb-6 flex-1">
                          {teacher.bio || "Classical musician and instructor."}
                        </p>
                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                          <div className="flex items-center text-sm text-muted-foreground">
                            <MapPin className="h-4 w-4 mr-1" />
                            {teacher.city || "Online"}
                          </div>
                          <span className="font-medium text-foreground">
                            {teacher.hourlyRate
                              ? <>${(teacher.hourlyRate / 100).toFixed(0)}<span className="text-muted-foreground text-sm font-normal">/hr</span></>
                              : <span className="text-muted-foreground text-sm">Contact for rate</span>
                            }
                          </span>
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
