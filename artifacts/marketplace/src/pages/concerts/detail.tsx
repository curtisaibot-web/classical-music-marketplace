import { useParams, useLocation } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Calendar, MapPin, Users, Target, AlertCircle, CheckCircle2, XCircle, Clock, Share2 } from "lucide-react";
import { useGetCampaign, useCreateCampaignCheckout } from "@workspace/api-client-react";
import { useUser } from "@clerk/react";
import { formatDistanceToNow, parseISO } from "date-fns";
import { resolveImageUrl } from "@/lib/image-url";
import { toast } from "sonner";
import { useState } from "react";
import { usePageMeta } from "@/hooks/use-page-meta";

const STATUS_INFO: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  active: { label: "Active — accepting backers", color: "text-green-700", icon: <Clock className="h-4 w-4" /> },
  settling: { label: "Goal reached — processing payments", color: "text-blue-600", icon: <CheckCircle2 className="h-4 w-4" /> },
  succeeded: { label: "Goal reached!", color: "text-blue-700", icon: <CheckCircle2 className="h-4 w-4" /> },
  failed: { label: "Goal not reached", color: "text-red-700", icon: <XCircle className="h-4 w-4" /> },
  cancelled: { label: "Cancelled", color: "text-gray-600", icon: <XCircle className="h-4 w-4" /> },
};

export default function ConcertDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { isSignedIn } = useUser();
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);

  const { data: campaign, isLoading, isError } = useGetCampaign(Number(id));
  const checkout = useCreateCampaignCheckout();

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  usePageMeta({
    title: campaign?.title ?? "Concert Campaign",
    description: campaign?.description ?? "Back this fan-funded concert campaign.",
  });

  async function handleShare() {
    const url = window.location.href;
    const title = campaign?.title ?? "Concert Campaign";
    const text = `Back "${title}" — a fan-funded live classical music concert on Harmonia!`;

    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return;
      } catch {
        // User dismissed — fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard!");
    } catch {
      toast.error("Could not copy link");
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-16">
          <div className="animate-pulse max-w-3xl mx-auto space-y-6">
            <div className="h-64 bg-muted rounded-2xl" />
            <div className="h-8 bg-muted rounded w-2/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-20 bg-muted rounded" />
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (isError || !campaign) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 container mx-auto px-4 py-24 text-center">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4 opacity-70" />
          <h2 className="text-2xl font-serif font-semibold mb-2">Campaign not found</h2>
          <p className="text-muted-foreground">This campaign may have been removed or doesn't exist.</p>
        </main>
        <Footer />
      </div>
    );
  }

  const pct = Math.min(100, Math.round((campaign.ticketsSold / campaign.goalCount) * 100));
  const deadline = parseISO(campaign.deadlineAt);
  const timeLeft = formatDistanceToNow(deadline, { addSuffix: true });
  const imgSrc = resolveImageUrl(campaign.coverImageUrl ?? null, basePath);
  const statusInfo = STATUS_INFO[campaign.status];
  const isActive = campaign.status === "active" && deadline > new Date();
  const totalCents = campaign.ticketPriceCents * quantity;
  const platformFeeCents = Math.round(totalCents * 0.08);

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`Back "${campaign.title}" — a fan-funded live classical music concert! ${window.location.href}`)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`Back "${campaign.title}" on Harmonia — a fan-funded live classical music concert! ${window.location.href}`)}`;

  async function handleCheckout() {
    if (!isSignedIn) {
      navigate("/sign-in");
      return;
    }
    setLoading(true);
    try {
      const origin = window.location.origin;
      const result = await checkout.mutateAsync({
        id: Number(id),
        data: {
          quantity,
          successUrl: `${origin}${basePath}/payment/success?type=campaign&id=${id}`,
          cancelUrl: `${origin}${basePath}/concerts/${id}`,
        },
      });
      if (result.checkoutUrl) {
        window.location.href = result.checkoutUrl;
      } else {
        toast.error("Could not create checkout session");
      }
    } catch {
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {imgSrc && (
          <div className="w-full h-72 md:h-96 overflow-hidden">
            <img src={imgSrc} alt={campaign.title} className="w-full h-full object-cover" />
          </div>
        )}

        <div className="container mx-auto px-4 py-12 max-w-5xl">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
            <div className="lg:col-span-2 space-y-6">
              <div>
                <div className={`flex items-center gap-2 text-sm font-medium mb-3 ${statusInfo?.color}`}>
                  {statusInfo?.icon}
                  {statusInfo?.label}
                </div>
                <h1 className="text-4xl font-serif font-bold text-foreground mb-2">{campaign.title}</h1>
                {(campaign.teacherFirstName || campaign.teacherLastName) && (
                  <p className="text-muted-foreground">
                    by {campaign.teacherFirstName} {campaign.teacherLastName}
                  </p>
                )}
              </div>

              {campaign.description && (
                <div className="prose prose-sm max-w-none text-foreground">
                  <p className="text-base leading-relaxed text-muted-foreground whitespace-pre-wrap">{campaign.description}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {campaign.scheduledDate && (
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-primary" />
                    <span>{campaign.scheduledDate}</span>
                  </div>
                )}
                {campaign.venueName && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    <span>{campaign.venueName}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <span>{campaign.backerCount} {campaign.backerCount === 1 ? "backer" : "backers"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="h-4 w-4 text-primary" />
                  <span>{campaign.ticketsSold} / {campaign.goalCount} tickets sold</span>
                </div>
              </div>

              {/* Share section */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <span className="text-sm font-medium text-muted-foreground">Share this campaign:</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={handleShare}
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Copy link
                </Button>
                <a
                  href={twitterUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  𝕏 Twitter
                </a>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border border-border text-muted-foreground hover:bg-muted transition-colors"
                >
                  WhatsApp
                </a>
              </div>

              <Card className="border-border">
                <CardContent className="p-6 space-y-3">
                  <h3 className="font-semibold text-foreground">How crowdfunding works</h3>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      Your card is <strong className="text-foreground">only charged</strong> if the campaign reaches {campaign.goalCount} tickets by the deadline.
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      If the goal isn't met, your payment authorisation is <strong className="text-foreground">fully cancelled</strong> — no charge.
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      On success, you receive an email with your <strong className="text-foreground">QR access code</strong>.
                    </li>
                  </ul>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-1">
              <div className="sticky top-8 space-y-4">
                <Card className="border-border overflow-hidden">
                  <CardContent className="p-6 space-y-5">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm text-muted-foreground font-medium">Progress</span>
                        <span className="text-sm font-semibold text-foreground">{pct}%</span>
                      </div>
                      <div className="h-3 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                        <span>{campaign.ticketsSold} sold</span>
                        <span>goal: {campaign.goalCount}</span>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <div className="text-3xl font-bold text-foreground font-serif">
                        ${(campaign.ticketPriceCents / 100).toFixed(0)}
                        <span className="text-base font-normal text-muted-foreground ml-1">/ ticket</span>
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="h-3.5 w-3.5" />
                        <span>Deadline {timeLeft}</span>
                      </div>
                    </div>

                    {isActive && (
                      <div className="space-y-3">
                        <div>
                          <label className="text-sm font-medium text-foreground block mb-1">Quantity</label>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-9 h-9 p-0"
                              onClick={() => setQuantity(Math.max(1, quantity - 1))}
                              disabled={quantity <= 1}
                            >
                              −
                            </Button>
                            <span className="w-8 text-center font-medium text-foreground">{quantity}</span>
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-9 h-9 p-0"
                              onClick={() => setQuantity(Math.min(10, quantity + 1))}
                              disabled={quantity >= 10}
                            >
                              +
                            </Button>
                          </div>
                        </div>

                        <div className="text-sm text-muted-foreground space-y-1 py-2 border-t border-b border-border">
                          <div className="flex justify-between">
                            <span>{quantity} × ${(campaign.ticketPriceCents / 100).toFixed(0)}</span>
                            <span>${(totalCents / 100).toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span>Platform fee (8%)</span>
                            <span>${(platformFeeCents / 100).toFixed(2)}</span>
                          </div>
                        </div>

                        <Button
                          className="w-full font-semibold"
                          onClick={handleCheckout}
                          disabled={loading}
                        >
                          {loading ? "Redirecting…" : `Back this concert — $${(totalCents / 100).toFixed(2)}`}
                        </Button>

                        <p className="text-xs text-muted-foreground text-center">
                          Authorised now · charged only on success
                        </p>
                      </div>
                    )}

                    {!isActive && campaign.status === "succeeded" && (
                      <div className="flex items-center gap-2 text-green-700 bg-green-50 rounded-lg p-3 text-sm font-medium">
                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                        This campaign reached its goal! Payments have been captured.
                      </div>
                    )}

                    {!isActive && campaign.status === "failed" && (
                      <div className="flex items-center gap-2 text-red-700 bg-red-50 rounded-lg p-3 text-sm font-medium">
                        <XCircle className="h-4 w-4 shrink-0" />
                        This campaign did not reach its goal. No charges were made.
                      </div>
                    )}

                    {!isActive && campaign.status === "cancelled" && (
                      <div className="flex items-center gap-2 text-gray-600 bg-gray-50 rounded-lg p-3 text-sm font-medium">
                        <XCircle className="h-4 w-4 shrink-0" />
                        This campaign was cancelled. No charges were made.
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
