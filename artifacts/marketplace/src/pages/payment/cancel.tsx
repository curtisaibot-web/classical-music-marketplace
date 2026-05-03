import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { XCircle, ArrowLeft, RefreshCw } from "lucide-react";

export default function PaymentCancel() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-20 px-4">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="flex justify-center">
            <div className="h-24 w-24 rounded-full bg-muted flex items-center justify-center">
              <XCircle className="h-14 w-14 text-muted-foreground" />
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-serif font-bold text-foreground">
              Payment Cancelled
            </h1>
            <p className="text-lg text-muted-foreground">
              Your payment was cancelled and you have not been charged. Your booking or order has been saved as pending — you can complete payment at any time.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Home
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
