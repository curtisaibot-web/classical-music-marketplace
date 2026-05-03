import { useListOrders } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Download, Receipt, BookOpen, Star } from "lucide-react";
import { format } from "date-fns";

export default function StudentOrders() {
  const { data: ordersData, isLoading } = useListOrders();

  const getIconForType = (type: string) => {
    switch(type) {
      case 'digital_product': return <BookOpen className="h-5 w-5" />;
      case 'masterclass_performer':
      case 'masterclass_observer': return <Star className="h-5 w-5" />;
      default: return <Receipt className="h-5 w-5" />;
    }
  };

  const formatType = (type: string) => {
    return type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-serif font-bold text-foreground">Purchase History</h1>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />
              ))}
            </div>
          ) : !ordersData?.orders.length ? (
            <div className="text-center py-20 bg-muted/30 rounded-xl border border-border border-dashed">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-medium text-foreground mb-2">No orders found</h3>
              <p className="text-muted-foreground">You haven't made any purchases yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {ordersData.orders.map((order) => (
                <Card key={order.id} className="border-border hover-elevate transition-all">
                  <CardContent className="p-6">
                    <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center">
                      <div className="h-12 w-12 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        {getIconForType(order.type)}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1">
                          <h3 className="font-semibold text-lg text-foreground truncate">
                            {formatType(order.type)}
                          </h3>
                          <Badge variant={order.status === 'paid' ? 'default' : 'secondary'} className="uppercase text-[10px] tracking-wider px-2 py-0 h-5">
                            {order.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Order #{order.id.toString().padStart(6, '0')} • {format(new Date(order.createdAt), 'MMM d, yyyy')}
                        </p>
                      </div>
                      
                      <div className="flex sm:flex-col items-center sm:items-end justify-between w-full sm:w-auto gap-4">
                        <div className="font-bold text-lg text-foreground">
                          ${(order.priceInCents / 100).toFixed(2)}
                        </div>
                        {order.type === 'digital_product' && order.status === 'paid' && order.downloadUrl && (
                          <a 
                            href={order.downloadUrl} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </a>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
