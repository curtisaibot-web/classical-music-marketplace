import { useParams } from "wouter";
import { useGetMasterclass, useCreateOrder, getGetMasterclassQueryKey } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, Clock, Users, Music, CheckCircle2 } from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function MasterclassDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoaded } = useUser();

  const { data: mc, isLoading } = useGetMasterclass(Number(id), { 
    query: { enabled: !!id, queryKey: getGetMasterclassQueryKey(Number(id)) } 
  });

  const createOrder = useCreateOrder();

  const handlePurchase = (type: "masterclass_performer" | "masterclass_observer") => {
    if (!isLoaded || !user) {
      toast.error("Please sign in to register");
      return;
    }

    createOrder.mutate({
      data: {
        type,
        masterclassEventId: Number(id),
      }
    }, {
      onSuccess: () => {
        toast.success("Payment coming soon! Registration recorded.");
      },
      onError: () => {
        toast.error("Failed to register. Please try again.");
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-12 flex justify-center">
          <div className="animate-pulse w-full max-w-5xl space-y-8">
            <div className="h-64 bg-muted rounded-xl" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!mc) return <div className="p-8 text-center">Masterclass not found</div>;

  const performAvailable = mc.maxPerformers > mc.registeredPerformers;
  const observeAvailable = mc.maxObservers > mc.registeredObservers;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 bg-muted/30">
        {/* Header Hero */}
        <div className="bg-foreground text-background py-16 lg:py-24 relative overflow-hidden">
          {mc.imageUrl && (
            <>
              <div className="absolute inset-0">
                <img src={mc.imageUrl} alt="" className="w-full h-full object-cover opacity-20" />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-foreground via-foreground/80 to-transparent" />
            </>
          )}
          <div className="container mx-auto px-4 relative z-10">
            <div className="max-w-3xl">
              <Badge variant="outline" className="mb-6 border-primary/50 text-primary bg-primary/10">
                {mc.instrument || 'All Instruments'} Masterclass
              </Badge>
              <h1 className="text-4xl md:text-5xl font-serif font-bold mb-6 leading-tight">
                {mc.title}
              </h1>
              <div className="flex flex-wrap gap-6 text-background/80">
                <div className="flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  <span>{format(new Date(mc.scheduledAt), 'MMMM d, yyyy')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-primary" />
                  <span>{format(new Date(mc.scheduledAt), 'h:mm a')} ({mc.durationMinutes} min)</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 items-start">
            
            {/* Left Column */}
            <div className="lg:col-span-2 space-y-10">
              <section>
                <h2 className="text-2xl font-serif font-semibold mb-4 text-foreground">About This Masterclass</h2>
                <div className="prose prose-slate dark:prose-invert max-w-none text-muted-foreground whitespace-pre-wrap">
                  {mc.description}
                </div>
              </section>

              <section className="bg-card border border-border rounded-xl p-8 shadow-sm">
                <h3 className="text-xl font-serif font-semibold mb-6 text-foreground flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-muted overflow-hidden">
                    {mc.teacher?.profileImageUrl ? (
                      <img src={mc.teacher.profileImageUrl} alt="Teacher" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex justify-center items-center"><Music className="h-6 w-6 opacity-20" /></div>
                    )}
                  </div>
                  Instructed by {mc.teacher?.user?.firstName} {mc.teacher?.user?.lastName}
                </h3>
                <p className="text-muted-foreground mb-4 line-clamp-4">
                  {mc.teacher?.bio}
                </p>
              </section>
            </div>
            
            {/* Right Column - Registration */}
            <div className="space-y-6 sticky top-24">
              <Card className="border-border shadow-lg">
                <CardHeader className="bg-muted/50 border-b border-border pb-4">
                  <CardTitle className="font-serif text-xl">Registration</CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  {/* Performer Option */}
                  <div className="p-6 border-b border-border">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold text-lg text-foreground">Performer Ticket</h4>
                        <p className="text-sm text-muted-foreground mt-1">Play and receive direct feedback.</p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-xl">${(mc.performerPriceInCents / 100).toFixed(2)}</div>
                        <div className="text-xs text-muted-foreground mt-1">{mc.maxPerformers - mc.registeredPerformers} spots left</div>
                      </div>
                    </div>
                    <Button 
                      className="w-full mt-6" 
                      disabled={!performAvailable || createOrder.isPending}
                      onClick={() => handlePurchase("masterclass_performer")}
                    >
                      {performAvailable ? "Register as Performer" : "Sold Out"}
                    </Button>
                  </div>

                  {/* Observer Option */}
                  <div className="p-6 bg-muted/20">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold text-lg text-foreground">Observer Ticket</h4>
                        <p className="text-sm text-muted-foreground mt-1">Watch and learn from the session.</p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-xl">${(mc.observerPriceInCents / 100).toFixed(2)}</div>
                      </div>
                    </div>
                    <Button 
                      variant="outline"
                      className="w-full mt-6" 
                      disabled={!observeAvailable || createOrder.isPending}
                      onClick={() => handlePurchase("masterclass_observer")}
                    >
                      {observeAvailable ? "Register as Observer" : "Sold Out"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
              
              <div className="bg-card border border-border rounded-xl p-6 flex gap-4 text-sm text-muted-foreground shadow-sm">
                <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
                <p>A recording of the session will be provided to all registered attendees after the event.</p>
              </div>
            </div>
            
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
