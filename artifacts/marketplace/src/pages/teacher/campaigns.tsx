import { useState } from "react";
import { Link, Redirect } from "wouter";
import { useUser } from "@clerk/react";
import { useGetMe, useGetCampaignTickets } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Music, Plus, Target, Users, DollarSign, Calendar, AlertCircle, CheckCircle2, XCircle, ChevronRight, ChevronDown, ChevronUp, Mail } from "lucide-react";
import { useGetMyCampaigns, useCreateCampaign, useCancelCampaign } from "@workspace/api-client-react";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { usePageMeta } from "@/hooks/use-page-meta";

const STATUS_BADGE: Record<string, { label: string; class: string }> = {
  active: { label: "Active", class: "bg-green-100 text-green-700 border-green-200" },
  succeeded: { label: "Goal Met!", class: "bg-blue-100 text-blue-700 border-blue-200" },
  failed: { label: "Not Funded", class: "bg-red-100 text-red-700 border-red-200" },
  cancelled: { label: "Cancelled", class: "bg-gray-100 text-gray-600 border-gray-200" },
};

const TICKET_STATUS_BADGE: Record<string, string> = {
  authorised: "bg-yellow-100 text-yellow-700 border-yellow-200",
  captured: "bg-green-100 text-green-700 border-green-200",
  cancelled: "bg-gray-100 text-gray-500 border-gray-200",
};

interface CreateFormData {
  title: string;
  description: string;
  coverImageUrl: string;
  venueName: string;
  scheduledDate: string;
  ticketPriceCents: string;
  goalCount: string;
  deadlineAt: string;
}

const EMPTY_FORM: CreateFormData = {
  title: "",
  description: "",
  coverImageUrl: "",
  venueName: "",
  scheduledDate: "",
  ticketPriceCents: "",
  goalCount: "",
  deadlineAt: "",
};

function BackerList({ campaignId }: { campaignId: number }) {
  const { data, isLoading, isError } = useGetCampaignTickets(campaignId);
  const tickets = data?.tickets ?? [];

  if (isLoading) {
    return <div className="text-xs text-muted-foreground py-3 px-4 animate-pulse">Loading backers…</div>;
  }

  if (isError) {
    return <div className="text-xs text-destructive py-3 px-4">Failed to load backer list.</div>;
  }

  if (tickets.length === 0) {
    return <div className="text-xs text-muted-foreground py-3 px-4 italic">No backers yet.</div>;
  }

  return (
    <div className="divide-y divide-border">
      {tickets.map((t) => (
        <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-sm">
          <div className="flex-1 min-w-0">
            <p className="font-medium text-foreground truncate">{t.buyerName || "Anonymous"}</p>
            {t.buyerEmail && (
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Mail className="h-3 w-3 shrink-0" />
                <span className="truncate">{t.buyerEmail}</span>
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="text-muted-foreground text-xs">{t.quantity} ticket{t.quantity !== 1 ? "s" : ""}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${TICKET_STATUS_BADGE[t.status] ?? ""}`}>
              {t.status}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function TeacherCampaigns() {
  usePageMeta({ title: "My Concert Campaigns" });

  const { isSignedIn, isLoaded: clerkLoaded } = useUser();
  const { data: me, isLoading: meLoading } = useGetMe();

  const { data, isLoading, isError, refetch } = useGetMyCampaigns();

  const createCampaign = useCreateCampaign();
  const cancelCampaign = useCancelCampaign();

  const [showCreate, setShowCreate] = useState(false);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [expandedBackers, setExpandedBackers] = useState<Set<number>>(new Set());
  const [form, setForm] = useState<CreateFormData>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);

  if (!clerkLoaded || meLoading) {
    return <div className="h-screen w-full bg-background" />;
  }

  if (!isSignedIn) {
    return <Redirect to="/sign-in" />;
  }

  if (me?.role !== "teacher") {
    return <Redirect to="/dashboard" />;
  }

  const campaigns = data?.campaigns ?? [];

  function setField(key: keyof CreateFormData, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleBackers(id: number) {
    setExpandedBackers((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function handleCreate() {
    if (!form.title || !form.ticketPriceCents || !form.goalCount || !form.deadlineAt) {
      toast.error("Please fill in all required fields");
      return;
    }
    const priceCents = Math.round(parseFloat(form.ticketPriceCents) * 100);
    const goal = parseInt(form.goalCount, 10);
    if (isNaN(priceCents) || priceCents < 100) { toast.error("Ticket price must be at least $1"); return; }
    if (isNaN(goal) || goal < 1) { toast.error("Goal must be at least 1 ticket"); return; }

    setSubmitting(true);
    try {
      await createCampaign.mutateAsync({
        data: {
          title: form.title,
          description: form.description || undefined,
          coverImageUrl: form.coverImageUrl || undefined,
          venueName: form.venueName || undefined,
          scheduledDate: form.scheduledDate || undefined,
          ticketPriceCents: priceCents,
          goalCount: goal,
          deadlineAt: new Date(form.deadlineAt).toISOString(),
        },
      });
      toast.success("Campaign created!");
      setForm(EMPTY_FORM);
      setShowCreate(false);
      refetch();
    } catch {
      toast.error("Failed to create campaign. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!cancelId) return;
    try {
      await cancelCampaign.mutateAsync({ id: cancelId });
      toast.success("Campaign cancelled. All backers have been notified.");
      setCancelId(null);
      refetch();
    } catch {
      toast.error("Failed to cancel campaign.");
    }
  }

  const minDeadline = new Date();
  minDeadline.setDate(minDeadline.getDate() + 1);
  const minDeadlineStr = minDeadline.toISOString().slice(0, 16);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-1">Concert Campaigns</h1>
              <p className="text-muted-foreground">Crowdfund your live performances. Fans back you, we handle the rest.</p>
            </div>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Campaign
            </Button>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-10">
        {isLoading ? (
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="animate-pulse border border-border rounded-xl p-6 h-32 bg-muted" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-center py-20">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3 opacity-70" />
            <p className="text-muted-foreground">Failed to load campaigns.</p>
            <Button variant="outline" className="mt-4" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-24 max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <Music className="h-10 w-10 text-muted-foreground opacity-40" />
            </div>
            <h2 className="text-xl font-serif font-semibold text-foreground mb-2">No campaigns yet</h2>
            <p className="text-muted-foreground mb-6">
              Create your first concert campaign and let fans back your performance.
            </p>
            <Button onClick={() => setShowCreate(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Create Campaign
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((c) => {
              const pct = Math.min(100, Math.round((c.ticketsSold / c.goalCount) * 100));
              const badge = STATUS_BADGE[c.status];
              const deadline = parseISO(c.deadlineAt);
              const isActive = c.status === "active";
              const showBackers = expandedBackers.has(c.id);

              return (
                <Card key={c.id} className="border-border overflow-hidden">
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row">
                      <div className="flex-1 p-6 space-y-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${badge?.class}`}>
                                {badge?.label}
                              </span>
                            </div>
                            <h2 className="text-lg font-serif font-semibold text-foreground">{c.title}</h2>
                            {(c.venueName || c.scheduledDate) && (
                              <p className="text-sm text-muted-foreground mt-0.5">
                                {[c.venueName, c.scheduledDate].filter(Boolean).join(" · ")}
                              </p>
                            )}
                          </div>
                          <Link href={`/concerts/${c.id}`} className="shrink-0">
                            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground hover:text-foreground">
                              View public page <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                          </Link>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">{c.ticketsSold} / {c.goalCount} tickets</span>
                            <span className="font-medium text-foreground">{pct}%</span>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-4 text-sm">
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <DollarSign className="h-4 w-4 text-primary" />
                            <span>${(c.grossRaisedCents / 100).toFixed(0)} raised</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Users className="h-4 w-4 text-primary" />
                            <span>{c.backerCount} {c.backerCount === 1 ? "backer" : "backers"}</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Target className="h-4 w-4 text-primary" />
                            <span>${(c.ticketPriceCents / 100).toFixed(0)}/ticket</span>
                          </div>
                          <div className="flex items-center gap-1.5 text-muted-foreground">
                            <Calendar className="h-4 w-4 text-primary" />
                            <span>Deadline {format(deadline, "MMM d, yyyy")}</span>
                          </div>
                        </div>

                        {/* Backer list toggle */}
                        <button
                          type="button"
                          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => toggleBackers(c.id)}
                        >
                          {showBackers ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {showBackers ? "Hide" : "Show"} backer list
                        </button>
                      </div>

                      {isActive && (
                        <div className="border-t md:border-t-0 md:border-l border-border p-6 flex flex-col justify-center gap-3 min-w-[160px]">
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive border-destructive/30 hover:bg-destructive/5"
                            onClick={() => setCancelId(c.id)}
                          >
                            Cancel Campaign
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Expandable backer roster */}
                    {showBackers && (
                      <div className="border-t border-border bg-muted/30">
                        <div className="px-4 py-2 flex items-center gap-2 border-b border-border/50">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Backers</span>
                        </div>
                        <BackerList campaignId={c.id} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">Create Concert Campaign</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="cc-title">Concert Title <span className="text-destructive">*</span></Label>
              <Input
                id="cc-title"
                placeholder="e.g. Beethoven Evening at Carnegie Hall"
                value={form.title}
                onChange={(e) => setField("title", e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="cc-desc">Description</Label>
              <Textarea
                id="cc-desc"
                placeholder="Tell fans about your concert…"
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                className="mt-1 min-h-[80px]"
              />
            </div>

            <div>
              <Label htmlFor="cc-cover">Cover Photo URL</Label>
              <Input
                id="cc-cover"
                type="url"
                placeholder="https://example.com/concert-cover.jpg"
                value={form.coverImageUrl}
                onChange={(e) => setField("coverImageUrl", e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Paste a public image URL to show on your campaign page</p>
              {form.coverImageUrl && (
                <img
                  src={form.coverImageUrl}
                  alt="Cover preview"
                  className="mt-2 w-full h-28 object-cover rounded-md border border-border"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cc-venue">Venue Name</Label>
                <Input
                  id="cc-venue"
                  placeholder="Carnegie Hall"
                  value={form.venueName}
                  onChange={(e) => setField("venueName", e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="cc-date">Concert Date</Label>
                <Input
                  id="cc-date"
                  placeholder="e.g. May 30, 2026"
                  value={form.scheduledDate}
                  onChange={(e) => setField("scheduledDate", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="cc-price">Ticket Price (USD) <span className="text-destructive">*</span></Label>
                <div className="relative mt-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="cc-price"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="25.00"
                    value={form.ticketPriceCents}
                    onChange={(e) => setField("ticketPriceCents", e.target.value)}
                    className="pl-7"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="cc-goal">Ticket Goal <span className="text-destructive">*</span></Label>
                <Input
                  id="cc-goal"
                  type="number"
                  min="1"
                  placeholder="100"
                  value={form.goalCount}
                  onChange={(e) => setField("goalCount", e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="cc-deadline">Campaign Deadline <span className="text-destructive">*</span></Label>
              <Input
                id="cc-deadline"
                type="datetime-local"
                min={minDeadlineStr}
                value={form.deadlineAt}
                onChange={(e) => setField("deadlineAt", e.target.value)}
                className="mt-1"
              />
              <p className="text-xs text-muted-foreground mt-1">Up to 60 days from today</p>
            </div>

            {form.ticketPriceCents && form.goalCount && (
              <Card className="bg-muted/50 border-border">
                <CardContent className="p-4 text-sm space-y-1">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Gross if goal met</span>
                    <span className="font-medium text-foreground">${((parseFloat(form.ticketPriceCents || "0") * parseInt(form.goalCount || "0"))).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>Platform fee (8%)</span>
                    <span>−${(parseFloat(form.ticketPriceCents || "0") * parseInt(form.goalCount || "0") * 0.08).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1 mt-1">
                    <span>Your earnings</span>
                    <span>${(parseFloat(form.ticketPriceCents || "0") * parseInt(form.goalCount || "0") * 0.92).toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting ? "Creating…" : "Launch Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={cancelId !== null} onOpenChange={(open) => { if (!open) setCancelId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              All backers will be notified and their payment authorisations will be cancelled immediately. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Campaign</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleCancel}
            >
              Cancel Campaign
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Footer />
    </div>
  );
}
