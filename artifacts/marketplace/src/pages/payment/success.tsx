import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Calendar, ShoppingBag, ArrowRight, Music, BookOpen } from "lucide-react";

export default function PaymentSuccess() {
  const [location] = useLocation();
  const params = new URLSearchParams(location.split("?")[1] ?? "");
  const type = params.get("type");

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const isBooking = type === "booking";
  const isOrder = type === "order" || type === "masterclass_performer" || type === "masterclass_observer";
  const isCampaign = type === "campaign";
  const isProgramEnrollment = type === "program_enrollment";

  const heading = isCampaign ? "Pledge Received!" : "Payment Successful!";
  const subtext = isBooking
    ? "Your lesson has been booked and payment received. The teacher will confirm shortly."
    : isProgramEnrollment
      ? "You're enrolled! Your audition prep program is ready to begin."
      : isOrder
        ? "Your purchase is confirmed. You can access your items in your orders."
        : isCampaign
          ? "Your card has been authorized. If the campaign reaches its goal, your payment will be captured and you'll receive your tickets by email."
          : "Your payment was processed successfully.";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 flex items-center justify-center py-20 px-4">
        <div className="max-w-md w-full text-center space-y-8">
          <div className="flex justify-center">
            <div className="h-24 w-24 rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-14 w-14 text-primary" />
            </div>
          </div>

          <div className="space-y-3">
            <h1 className="text-4xl font-serif font-bold text-foreground">{heading}</h1>
            <p className="text-lg text-muted-foreground">{subtext}</p>
          </div>

          <div className="bg-card border border-border rounded-xl p-6 text-left space-y-3">
            <h3 className="font-semibold text-foreground">What happens next?</h3>
            {isCampaign ? (
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">1.</span>
                  Your card is authorized but <strong>not yet charged</strong>.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">2.</span>
                  If the campaign reaches its ticket goal, your payment is captured and you receive tickets with a QR code by email.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">3.</span>
                  If the goal is not met, your authorization is cancelled — no charge is ever made.
                </li>
              </ul>
            ) : isProgramEnrollment ? (
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">1.</span>
                  Your enrollment is now active and visible in your dashboard.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">2.</span>
                  Your teacher will schedule your first session and may send notes after each one.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">3.</span>
                  Once all sessions are complete, you'll receive a certificate of completion.
                </li>
              </ul>
            ) : isBooking ? (
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">1.</span>
                  The teacher will review your booking and confirm the session.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">2.</span>
                  You'll receive a meeting link before the lesson.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">3.</span>
                  After the lesson, you can leave a review.
                </li>
              </ul>
            ) : (
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">1.</span>
                  Your order is confirmed and available in your dashboard.
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary font-bold mt-0.5">2.</span>
                  Digital products are available for download immediately.
                </li>
              </ul>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {isCampaign ? (
              <Button asChild>
                <Link href="/concerts">
                  <Music className="h-4 w-4 mr-2" />
                  Browse Campaigns
                </Link>
              </Button>
            ) : isProgramEnrollment ? (
              <Button asChild>
                <Link href="/my-programs">
                  <BookOpen className="h-4 w-4 mr-2" />
                  View My Programs
                </Link>
              </Button>
            ) : isBooking ? (
              <Button asChild>
                <Link href="/bookings">
                  <Calendar className="h-4 w-4 mr-2" />
                  View My Bookings
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link href="/orders">
                  <ShoppingBag className="h-4 w-4 mr-2" />
                  View My Orders
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href="/">
                Back to Home
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
