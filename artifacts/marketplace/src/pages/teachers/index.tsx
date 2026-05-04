import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useListTeachers } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Star, Music, MapPin } from "lucide-react";
import { resolveImageUrl } from "@/lib/image-url";

export default function Teachers() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading } = useListTeachers({ 
    instrument: debouncedSearch || undefined,
    limit: 20 
  });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-4">Find a Teacher</h1>
          <p className="text-lg text-muted-foreground max-w-2xl mb-8">
            Browse our curated selection of world-class classical musicians offering private instruction.
          </p>
          
          <div className="flex flex-col sm:flex-row gap-4 max-w-xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Search by instrument (e.g. Piano, Violin)" 
                className="pl-10 bg-background"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Button className="shrink-0">Search</Button>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse bg-muted rounded-xl h-96" />
            ))}
          </div>
        ) : !data?.teachers.length ? (
          <div className="text-center py-20">
            <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium text-foreground mb-2">No teachers found</h3>
            <p className="text-muted-foreground">Try adjusting your search criteria.</p>
          </div>
        ) : (
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
                      {(teacher.averageRating / 100).toFixed(1)}
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
                        {teacher.city || 'Online'}
                      </div>
                      <span className="font-medium text-foreground">
                        ${(teacher.hourlyRate! / 100).toFixed(2)}<span className="text-muted-foreground text-sm font-normal">/hr</span>
                      </span>
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
