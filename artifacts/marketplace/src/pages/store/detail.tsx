import { useParams } from "wouter";
import { useGetDigitalProduct, useCreateOrder, getGetDigitalProductQueryKey } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen, Download, Music, ShieldCheck } from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";

export default function StoreDetail() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoaded } = useUser();

  const { data: product, isLoading } = useGetDigitalProduct(Number(id), { 
    query: { enabled: !!id, queryKey: getGetDigitalProductQueryKey(Number(id)) } 
  });

  const createOrder = useCreateOrder();

  const handlePurchase = () => {
    if (!isLoaded || !user) {
      toast.error("Please sign in to purchase");
      return;
    }

    createOrder.mutate({
      data: {
        type: "digital_product",
        digitalProductId: Number(id),
      }
    }, {
      onSuccess: () => {
        toast.success("Payment coming soon! Order recorded.");
      },
      onError: () => {
        toast.error("Failed to initiate purchase. Please try again.");
      }
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-12 flex justify-center">
          <div className="animate-pulse w-full max-w-4xl space-y-8">
            <div className="h-64 bg-muted rounded-xl" />
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!product) return <div className="p-8 text-center">Product not found</div>;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-12 lg:py-20">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-start">
            
            {/* Left - Preview/Image */}
            <div className="bg-muted rounded-2xl aspect-[4/5] flex items-center justify-center border border-border shadow-sm relative overflow-hidden">
              <BookOpen className="h-32 w-32 text-primary opacity-20" />
              <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
              <div className="absolute bottom-6 left-6 right-6">
                <div className="bg-background/90 backdrop-blur-md p-4 rounded-xl shadow-sm border border-border">
                  <h3 className="font-serif font-semibold truncate mb-1">{product.title}</h3>
                  <p className="text-sm text-muted-foreground truncate">{product.teacher?.user?.firstName} {product.teacher?.user?.lastName}</p>
                </div>
              </div>
            </div>

            {/* Right - Info & Purchase */}
            <div className="space-y-8">
              <div>
                <div className="flex gap-2 mb-4">
                  <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">{product.category}</Badge>
                  {product.instrument && <Badge variant="secondary">{product.instrument}</Badge>}
                  {product.difficulty && <Badge variant="secondary" className="capitalize">{product.difficulty}</Badge>}
                </div>
                <h1 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-4">
                  {product.title}
                </h1>
                <p className="text-2xl font-bold text-foreground mb-6">
                  ${(product.priceInCents / 100).toFixed(2)}
                </p>
                
                <div className="prose prose-slate dark:prose-invert text-muted-foreground whitespace-pre-wrap mb-8">
                  {product.description || "No description provided."}
                </div>

                <div className="space-y-4">
                  <Button 
                    size="lg" 
                    className="w-full text-lg h-14" 
                    onClick={handlePurchase}
                    disabled={createOrder.isPending}
                  >
                    {createOrder.isPending ? "Processing..." : "Purchase & Download"}
                  </Button>
                  <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                    <ShieldCheck className="h-4 w-4" /> Secure payment
                  </div>
                </div>
              </div>

              <div className="border-t border-border pt-8">
                <h3 className="font-medium text-foreground mb-4">About the Creator</h3>
                <div className="flex items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-muted overflow-hidden shrink-0">
                    {product.teacher?.profileImageUrl ? (
                      <img src={product.teacher.profileImageUrl} alt="Teacher" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex justify-center items-center"><Music className="h-6 w-6 opacity-20" /></div>
                    )}
                  </div>
                  <div>
                    <h4 className="font-semibold text-foreground text-lg">
                      {product.teacher?.user?.firstName} {product.teacher?.user?.lastName}
                    </h4>
                    <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                      {product.teacher?.bio || "Classical instructor."}
                    </p>
                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
