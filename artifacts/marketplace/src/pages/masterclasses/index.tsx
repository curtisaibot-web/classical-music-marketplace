import { useState } from "react";
import { Link } from "wouter";
import { useListMasterclasses } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar, Users, Star, Music } from "lucide-react";
import { format } from "date-fns";
import { resolveImageUrl } from "@/lib/image-url";

export default function Masterclasses() {
  const { data, isLoading } = useListMasterclasses({ limit: 20 });

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <div className="bg-muted py-12 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-4xl font-serif font-bold text-foreground mb-4">Masterclasses</h1>
          <p className="text-lg text-muted-foreground max-w-2xl">
            Watch or perform in live sessions with world-renowned master musicians. An invaluable opportunity for intensive learning.
          </p>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="animate-pulse bg-muted rounded-xl h-80" />
            ))}
          </div>
        ) : !data?.masterclasses.length ? (
          <div className="text-center py-20">
            <Star className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
            <h3 className="text-xl font-medium text-foreground mb-2">No masterclasses scheduled</h3>
            <p className="text-muted-foreground">Check back soon for upcoming sessions.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {data.masterclasses.map((mc) => {
              const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
              const imgSrc = resolveImageUrl(mc.imageUrl, basePath);
              return (
              <Link key={mc.id} href={`/masterclasses/${mc.id}`}>
                <Card className="h-full hover-elevate transition-all border-border flex flex-col cursor-pointer overflow-hidden group">
                  <div className="h-52 overflow-hidden bg-muted relative">
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-3 left-3">
                      <Badge className="bg-primary text-primary-foreground text-xs">
                        {mc.instrument || "All Instruments"}
                      </Badge>
                    </div>
                  </div>
                  <CardContent className="p-6 flex flex-col flex-1">
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-sm text-muted-foreground">
                        {format(new Date(mc.scheduledAt), "MMM d, yyyy")} · {format(new Date(mc.scheduledAt), "h:mm a")}
                      </div>
                    </div>
                    
                    <h3 className="font-serif font-semibold text-xl text-foreground mb-2">
                      {mc.title}
                    </h3>
                    
                    <p className="text-sm text-muted-foreground mb-6 line-clamp-2">
                      with {mc.teacher?.user?.firstName} {mc.teacher?.user?.lastName}
                    </p>
                    
                    <div className="mt-auto space-y-4">
                      <div className="flex items-center justify-between text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="h-4 w-4" />
                          {mc.durationMinutes} min
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Users className="h-4 w-4" />
                          {mc.registeredObservers} / {mc.maxObservers} observers
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t border-border flex items-center justify-between">
                        <div>
                          <div className="text-xs text-muted-foreground">Observer Ticket</div>
                          <div className="font-medium text-foreground">${(mc.observerPriceInCents / 100).toFixed(2)}</div>
                        </div>
                        <Button variant="outline" size="sm" className="group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                          Details
                        </Button>
                      </div>
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
