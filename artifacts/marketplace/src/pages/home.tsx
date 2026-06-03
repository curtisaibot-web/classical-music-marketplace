import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, ArrowRight, Music, Calendar, BookOpen, Download } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import {
  useListTeachers,
  useListMasterclasses,
  useListDigitalProducts,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { resolveImageUrl } from "@/lib/image-url";

export default function Home() {
  const { data: teachersData, isLoading: isLoadingTeachers } = useListTeachers({ limit: 4 });
  const { data: masterclassesData, isLoading: isLoadingMasterclasses } = useListMasterclasses({ limit: 3 });
  const { data: productsData, isLoading: isLoadingProducts } = useListDigitalProducts({ limit: 4 });
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchCity, setSearchCity] = useState("");

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const p = new URLSearchParams();
    if (searchQuery.trim()) p.set("q", searchQuery.trim());
    if (searchCity.trim()) p.set("city", searchCity.trim());
    setLocation(`/search?${p.toString()}`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative bg-muted py-24 lg:py-36 overflow-hidden">
          <div className="absolute inset-0">
            <img
              src={`${basePath}/images/hero_concert_hall.png`}
              alt="Grand concert hall"
              className="w-full h-full object-cover opacity-40"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/30" />
          </div>

          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-2xl">
              <p className="text-sm font-medium tracking-widest text-primary uppercase mb-4">
                Classical Music Marketplace
              </p>
              <h1 className="text-4xl md:text-6xl font-serif font-bold text-foreground leading-tight mb-6">
                Master Your Craft with World-Class Musicians
              </h1>
              <p className="text-xl text-muted-foreground mb-10">
                Private lessons, exclusive masterclasses, weddings &amp; events, and premium sheet music — all in one place.
              </p>
              <form onSubmit={handleSearch} className="flex flex-wrap gap-3 mb-6 max-w-2xl">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search violin teachers, piano lessons…"
                  className="flex-1 min-w-[200px] bg-background/80 backdrop-blur-sm"
                />
                <Input
                  value={searchCity}
                  onChange={(e) => setSearchCity(e.target.value)}
                  placeholder="City or online"
                  className="w-40 bg-background/80 backdrop-blur-sm"
                />
                <Button type="submit" className="font-medium">Search</Button>
              </form>
              <div className="flex flex-wrap gap-4">
                <Button asChild size="lg" className="font-medium px-8">
                  <Link href="/teachers">Find a Teacher</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="font-medium bg-background/50 backdrop-blur-sm px-8">
                  <Link href="/sign-up">Teach with Us</Link>
                </Button>
              </div>

              <div className="mt-14 flex flex-wrap gap-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-lg">8</span> Expert Instructors
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-lg">50+</span> Students Taught
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground text-lg">4.9</span>
                  <Star className="h-4 w-4 fill-primary text-primary" /> Average Rating
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section className="py-16 bg-background border-b border-border">
          <div className="container mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
              {[
                { icon: "🎹", label: "Private Lessons", desc: "1-on-1 instruction with world-class teachers" },
                { icon: "🎻", label: "Events & Weddings", desc: "Hire professional musicians for any occasion" },
                { icon: "🎤", label: "Masterclasses", desc: "Watch or perform in exclusive live sessions" },
                { icon: "📄", label: "Digital Store", desc: "Premium sheet music & lesson plans" },
              ].map((item) => (
                <div key={item.label} className="flex flex-col items-center gap-3 p-4">
                  <div className="text-4xl">{item.icon}</div>
                  <h3 className="font-semibold text-foreground">{item.label}</h3>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Featured Teachers */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h2 className="text-3xl font-serif font-semibold text-foreground mb-2">Featured Instructors</h2>
                <p className="text-muted-foreground">Learn from accomplished professionals around the globe.</p>
              </div>
              <Button asChild variant="ghost" className="hidden sm:flex">
                <Link href="/teachers">View all <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>

            {isLoadingTeachers ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-muted rounded-xl h-80" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {teachersData?.teachers.map((teacher) => {
                  const imgSrc = resolveImageUrl(teacher.profileImageUrl, basePath);
                  return (
                    <Link key={teacher.id} href={teacher.profileSlug ? `/musicians/${teacher.profileSlug}` : `/teachers/${teacher.userId}`}>
                      <Card className="h-full hover-elevate transition-all border-border overflow-hidden group cursor-pointer">
                        <div className="aspect-[3/4] bg-muted relative overflow-hidden">
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={`${teacher.user?.firstName} ${teacher.user?.lastName}`}
                              className="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-secondary text-secondary-foreground">
                              <Music className="h-12 w-12 opacity-20" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                            <h3 className="font-semibold text-base leading-tight">
                              {teacher.user?.firstName} {teacher.user?.lastName}
                            </h3>
                            <p className="text-xs text-white/80 mt-0.5 truncate">
                              {teacher.instruments.join(", ")}
                            </p>
                          </div>
                          <div className="absolute top-3 right-3 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1">
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                            {(teacher.averageRating / 100).toFixed(1)}
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-foreground">
                              ${(teacher.hourlyRate! / 100).toFixed(0)}<span className="text-muted-foreground text-sm font-normal">/hr</span>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {teacher.city || "Online"}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="mt-8 text-center sm:hidden">
              <Button asChild variant="outline" className="w-full">
                <Link href="/teachers">View all teachers</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Upcoming Masterclasses */}
        <section className="py-20 bg-muted/40 border-y border-border">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h2 className="text-3xl font-serif font-semibold text-foreground mb-2">Upcoming Masterclasses</h2>
                <p className="text-muted-foreground">Watch or perform in live sessions with master musicians.</p>
              </div>
              <Button asChild variant="ghost" className="hidden sm:flex">
                <Link href="/masterclasses">View all <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>

            {isLoadingMasterclasses ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-muted rounded-xl h-72" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {masterclassesData?.masterclasses.map((mc) => {
                  const imgSrc = resolveImageUrl(mc.imageUrl, basePath);
                  return (
                    <Link key={mc.id} href={`/masterclasses/${mc.id}`}>
                      <Card className="h-full hover-elevate transition-all border-border flex flex-col cursor-pointer overflow-hidden group">
                        <div className="h-48 bg-muted relative overflow-hidden">
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={mc.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <Music className="h-12 w-12 opacity-20" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                          <div className="absolute bottom-3 left-3">
                            <Badge className="bg-primary text-primary-foreground text-xs">
                              {mc.instrument || "All Instruments"}
                            </Badge>
                          </div>
                        </div>
                        <CardContent className="p-6 flex flex-col flex-1">
                          <div className="flex justify-between items-start mb-3">
                            <div className="text-sm text-muted-foreground">
                              {format(new Date(mc.scheduledAt), "MMM d, yyyy")} · {format(new Date(mc.scheduledAt), "h:mm a")}
                            </div>
                          </div>

                          <h3 className="font-serif font-semibold text-lg text-foreground mb-1 line-clamp-2">
                            {mc.title}
                          </h3>

                          <p className="text-sm text-muted-foreground mb-4">
                            with {mc.teacher?.user?.firstName} {mc.teacher?.user?.lastName}
                          </p>

                          <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Calendar className="h-4 w-4" />
                              {mc.durationMinutes} min
                            </div>
                            <div className="font-medium text-foreground">
                              From ${(mc.observerPriceInCents / 100).toFixed(2)}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="mt-8 text-center sm:hidden">
              <Button asChild variant="outline" className="w-full">
                <Link href="/masterclasses">View all masterclasses</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Digital Store */}
        <section className="py-20 bg-background">
          <div className="container mx-auto px-4">
            <div className="flex justify-between items-end mb-10">
              <div>
                <h2 className="text-3xl font-serif font-semibold text-foreground mb-2">Digital Store</h2>
                <p className="text-muted-foreground">Premium sheet music, lesson plans, and exercises from master instructors.</p>
              </div>
              <Button asChild variant="ghost" className="hidden sm:flex">
                <Link href="/store">Browse store <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>

            {isLoadingProducts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-muted rounded-xl h-64" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {productsData?.products.map((product) => {
                  const imgSrc = resolveImageUrl(product.previewUrl, basePath);
                  return (
                    <Link key={product.id} href={`/store/${product.id}`}>
                      <Card className="h-full hover-elevate transition-all border-border cursor-pointer overflow-hidden group flex flex-col">
                        <div className="h-40 bg-muted relative overflow-hidden border-b border-border">
                          {imgSrc ? (
                            <img
                              src={imgSrc}
                              alt={product.title}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-secondary/30">
                              <BookOpen className="h-10 w-10 text-primary opacity-40" />
                            </div>
                          )}
                          {product.downloadCount !== undefined && (
                            <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded backdrop-blur-sm">
                              <Download className="h-3 w-3" />
                              {product.downloadCount}
                            </div>
                          )}
                        </div>
                        <CardContent className="p-5 flex flex-col flex-1">
                          <Badge variant="outline" className="font-normal text-xs w-fit mb-2">{product.category}</Badge>
                          <h3 className="font-medium text-foreground mb-1 line-clamp-2 text-sm flex-1">{product.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1 mb-3">
                            by {product.teacher?.user?.firstName} {product.teacher?.user?.lastName}
                          </p>
                          <div className="flex items-center justify-between pt-3 border-t border-border/50 mt-auto">
                            <span className="text-xs text-muted-foreground capitalize">{product.instrument || "General"}</span>
                            <span className="font-semibold text-foreground">
                              ${(product.priceInCents / 100).toFixed(2)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  );
                })}
              </div>
            )}

            <div className="mt-8 text-center sm:hidden">
              <Button asChild variant="outline" className="w-full">
                <Link href="/store">Browse store</Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
