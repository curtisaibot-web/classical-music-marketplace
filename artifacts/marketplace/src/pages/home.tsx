import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Star, ArrowRight, Music, Calendar, BookOpen } from "lucide-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { 
  useListTeachers, 
  useListMasterclasses, 
  useListDigitalProducts 
} from "@workspace/api-client-react";
import { format } from "date-fns";

export default function Home() {
  const { data: teachersData, isLoading: isLoadingTeachers } = useListTeachers({ limit: 4 });
  const { data: masterclassesData, isLoading: isLoadingMasterclasses } = useListMasterclasses({ limit: 3 });
  const { data: productsData, isLoading: isLoadingProducts } = useListDigitalProducts({ limit: 4 });

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="relative bg-muted py-24 lg:py-32 overflow-hidden">
          <div className="absolute inset-0">
            <img 
              src={`${basePath}/hero.png`} 
              alt="Classical Music" 
              className="w-full h-full object-cover opacity-20"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/90 to-transparent" />
          </div>
          
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-2xl">
              <h1 className="text-4xl md:text-6xl font-serif font-bold text-foreground leading-tight mb-6">
                Master Your Craft with World-Class Musicians
              </h1>
              <p className="text-xl text-muted-foreground mb-8">
                Connect with elite instructors for private lessons, attend exclusive masterclasses, and discover premium sheet music.
              </p>
              <div className="flex flex-wrap gap-4">
                <Button asChild size="lg" className="font-medium">
                  <Link href="/teachers">Find a Teacher</Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="font-medium bg-background/50 backdrop-blur-sm">
                  <Link href="/sign-up">Teach with Us</Link>
                </Button>
              </div>
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
                {teachersData?.teachers.map((teacher) => (
                  <Link key={teacher.id} href={`/teachers/${teacher.userId}`}>
                    <Card className="h-full hover-elevate transition-all border-border overflow-hidden group cursor-pointer">
                      <div className="aspect-square bg-muted relative overflow-hidden">
                        {teacher.profileImageUrl ? (
                          <img 
                            src={teacher.profileImageUrl} 
                            alt={`${teacher.user?.firstName} ${teacher.user?.lastName}`}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-secondary text-secondary-foreground">
                            <Music className="h-12 w-12 opacity-20" />
                          </div>
                        )}
                        <div className="absolute top-3 right-3 bg-background/90 backdrop-blur-sm px-2 py-1 rounded-md text-xs font-medium flex items-center shadow-sm">
                          <Star className="h-3 w-3 text-primary fill-primary mr-1" />
                          {teacher.averageRating.toFixed(1)}
                        </div>
                      </div>
                      <CardContent className="p-5">
                        <h3 className="font-semibold text-lg text-foreground truncate">
                          {teacher.user?.firstName} {teacher.user?.lastName}
                        </h3>
                        <p className="text-sm text-muted-foreground mb-3 truncate">
                          {teacher.instruments.join(", ")}
                        </p>
                        <div className="flex items-center justify-between mt-auto pt-2">
                          <span className="font-medium text-foreground">
                            ${(teacher.hourlyRate! / 100).toFixed(2)}<span className="text-muted-foreground text-sm font-normal">/hr</span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {teacher.city || 'Online'}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
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
        <section className="py-20 bg-muted/50 border-y border-border">
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
                  <div key={i} className="animate-pulse bg-muted rounded-xl h-64" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {masterclassesData?.masterclasses.map((mc) => (
                  <Link key={mc.id} href={`/masterclasses/${mc.id}`}>
                    <Card className="h-full hover-elevate transition-all border-border flex flex-col cursor-pointer overflow-hidden">
                      <div className="p-6 flex flex-col h-full">
                        <div className="flex justify-between items-start mb-4">
                          <Badge variant="secondary" className="bg-primary/10 text-primary hover:bg-primary/20 font-medium">
                            {mc.instrument || 'All Instruments'}
                          </Badge>
                          <div className="text-right text-sm">
                            <div className="font-medium text-foreground">{format(new Date(mc.scheduledAt), 'MMM d, yyyy')}</div>
                            <div className="text-muted-foreground">{format(new Date(mc.scheduledAt), 'h:mm a')}</div>
                          </div>
                        </div>
                        
                        <h3 className="font-serif font-semibold text-xl text-foreground mb-2 line-clamp-2">
                          {mc.title}
                        </h3>
                        
                        <p className="text-sm text-muted-foreground mb-6 line-clamp-2 flex-1">
                          with {mc.teacher?.user?.firstName} {mc.teacher?.user?.lastName}
                        </p>
                        
                        <div className="flex items-center justify-between pt-4 border-t border-border mt-auto">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-4 w-4" />
                            {mc.durationMinutes} min
                          </div>
                          <div className="font-medium text-foreground">
                            From ${(mc.observerPriceInCents / 100).toFixed(2)}
                          </div>
                        </div>
                      </div>
                    </Card>
                  </Link>
                ))}
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
                <p className="text-muted-foreground">Premium sheet music, lesson plans, and exercises.</p>
              </div>
              <Button asChild variant="ghost" className="hidden sm:flex">
                <Link href="/store">Browse store <ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>

            {isLoadingProducts ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="animate-pulse bg-muted rounded-xl h-48" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {productsData?.products.map((product) => (
                  <Link key={product.id} href={`/store/${product.id}`}>
                    <Card className="h-full hover-elevate transition-all border-border cursor-pointer">
                      <CardContent className="p-5 flex flex-col h-full">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                          <BookOpen className="h-6 w-6" />
                        </div>
                        <h3 className="font-medium text-foreground mb-1 truncate">{product.title}</h3>
                        <p className="text-sm text-muted-foreground mb-4 truncate">
                          {product.teacher?.user?.firstName} {product.teacher?.user?.lastName}
                        </p>
                        <div className="flex items-center justify-between mt-auto pt-4 border-t border-border/50">
                          <Badge variant="outline" className="font-normal text-xs">{product.category}</Badge>
                          <span className="font-semibold text-foreground">
                            ${(product.priceInCents / 100).toFixed(2)}
                          </span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
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
