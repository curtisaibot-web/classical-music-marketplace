import { useState } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, Building2, Users, CreditCard, Rocket, ChevronRight, ChevronLeft } from "lucide-react";
import { Show } from "@clerk/react";

const STEPS = [
  { label: "School details", icon: Building2 },
  { label: "Invite teachers", icon: Users },
  { label: "Billing", icon: CreditCard },
  { label: "Launch", icon: Rocket },
];

const SLUG_RE = /^[a-z0-9-]{3,64}$/;

export default function SchoolsJoin() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 0 — School details
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");

  // Step 1 — Invite teachers (email-based, non-binding at this stage)
  const [teacherEmails, setTeacherEmails] = useState("");

  // Step 2 — Billing (read-only summary)

  // Created org data
  const [createdOrg, setCreatedOrg] = useState<{ id: number; slug: string; name: string } | null>(null);

  function autoSlug(val: string) {
    return val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64);
  }

  async function handleCreateOrg() {
    if (!name.trim()) { toast.error("School name is required"); return; }
    if (!SLUG_RE.test(slug)) { toast.error("Slug must be 3–64 chars: lowercase letters, numbers and hyphens"); return; }

    setSaving(true);
    try {
      const base = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${base}/api/orgs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), slug, description: description.trim() || undefined, logoUrl: logoUrl.trim() || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" })) as { error: string };
        toast.error(err.error ?? "Failed to create organisation");
        return;
      }
      const data = await res.json() as { org: { id: number; slug: string; name: string } };
      setCreatedOrg(data.org);
      setStep(1);
    } catch {
      toast.error("Network error — please try again");
    } finally {
      setSaving(false);
    }
  }

  async function handleInviteTeachers() {
    setStep(2);
  }

  async function handleLaunch() {
    if (!createdOrg) return;
    setLocation(`/org-admin?org=${createdOrg.slug}`);
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-12 px-4">
        <div className="max-w-2xl mx-auto space-y-8">
          <div className="text-center space-y-3">
            <Badge variant="outline" className="text-xs font-medium">White Label</Badge>
            <h1 className="text-4xl font-serif font-bold text-foreground">Set up your music school</h1>
            <p className="text-muted-foreground">
              Run your entire school's booking and student management on Harmonia under your own brand.
              $10 per active student per month — plus the standard 15% on bookings.
            </p>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-between">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < step;
              const active = i === step;
              return (
                <div key={i} className="flex-1 flex items-center">
                  <div className={`flex flex-col items-center gap-1 flex-shrink-0 ${active ? "text-primary" : done ? "text-green-600" : "text-muted-foreground"}`}>
                    <div className={`h-9 w-9 rounded-full border-2 flex items-center justify-center transition-colors ${active ? "border-primary bg-primary/10" : done ? "border-green-600 bg-green-50" : "border-muted-foreground/30"}`}>
                      {done ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                    </div>
                    <span className="text-xs font-medium hidden sm:block">{s.label}</span>
                  </div>
                  {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-2 transition-colors ${done ? "bg-green-600" : "bg-border"}`} />}
                </div>
              );
            })}
          </div>

          {/* Step 0 — School Details */}
          {step === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">School details</CardTitle>
                <CardDescription>Tell us about your school or studio.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">School name <span className="text-destructive">*</span></label>
                  <Input
                    value={name}
                    onChange={(e) => { setName(e.target.value); if (!slug) setSlug(autoSlug(e.target.value)); }}
                    placeholder="Juilliard Preparatory"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Portal slug <span className="text-destructive">*</span></label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm shrink-0">harmonia.app/?org=</span>
                    <Input
                      value={slug}
                      onChange={(e) => setSlug(autoSlug(e.target.value))}
                      placeholder="juilliard-prep"
                      className="flex-1"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">3–64 characters, lowercase letters, numbers and hyphens only</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="A brief description of your school..."
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Logo URL</label>
                  <Input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://yourschool.edu/logo.png"
                  />
                  <p className="text-xs text-muted-foreground">Paste a direct link to your school logo (PNG or SVG, ideally on a light background).</p>
                </div>
                <Show when="signed-in">
                  <Button className="w-full" onClick={handleCreateOrg} disabled={saving}>
                    {saving ? "Creating…" : "Create school portal"}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </Show>
                <Show when="signed-out">
                  <p className="text-sm text-center text-muted-foreground">
                    <a href="/sign-in" className="text-primary underline">Sign in</a> or <a href="/sign-up" className="text-primary underline">create an account</a> to continue.
                  </p>
                </Show>
              </CardContent>
            </Card>
          )}

          {/* Step 1 — Invite Teachers */}
          {step === 1 && createdOrg && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Invite your teachers</CardTitle>
                <CardDescription>
                  You can add teachers now or skip and do it from your admin dashboard. Teachers need to already have a Harmonia account — you'll use their Harmonia user ID to invite them.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm text-muted-foreground">
                  <p>Your school portal is live at: <strong className="text-foreground">harmonia.app/?org={createdOrg.slug}</strong></p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Teacher note (optional)</label>
                  <Textarea
                    value={teacherEmails}
                    onChange={(e) => setTeacherEmails(e.target.value)}
                    placeholder="Any notes for your first teacher invite..."
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground">You'll be able to invite teachers by user ID from the admin dashboard after setup.</p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(0)} className="flex items-center gap-1">
                    <ChevronLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button className="flex-1" onClick={handleInviteTeachers}>
                    Continue to billing <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 2 — Billing */}
          {step === 2 && createdOrg && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif">Billing</CardTitle>
                <CardDescription>Per-seat pricing — $10/student/month, billed monthly via Stripe.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-lg bg-muted/40 border border-border p-4 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Per active student</span>
                    <span className="font-semibold">$10 / month</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Booking commission</span>
                    <span className="font-semibold">15%</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Contract / invoice tools</span>
                    <span className="font-semibold">Included</span>
                  </div>
                  <div className="h-px bg-border" />
                  <p className="text-xs text-muted-foreground">You'll be charged after your first student is added. You can manage billing and download invoices from your admin dashboard.</p>
                </div>
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
                  <strong>Billing is set up from your admin dashboard.</strong> After launching, go to Admin → Billing to connect your card and activate your subscription.
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setStep(1)} className="flex items-center gap-1">
                    <ChevronLeft className="h-4 w-4" /> Back
                  </Button>
                  <Button className="flex-1" onClick={() => setStep(3)}>
                    Continue <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Step 3 — Launch */}
          {step === 3 && createdOrg && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-center">You're ready to launch!</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 text-center">
                <div className="flex justify-center">
                  <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
                    <Rocket className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <p className="text-muted-foreground">
                  Your school portal <strong className="text-foreground">{createdOrg.name}</strong> is live. Head to your admin dashboard to invite teachers, add students, and manage billing.
                </p>
                <div className="rounded-lg bg-muted/40 border border-border p-4 text-sm text-left space-y-2">
                  <p className="font-medium text-foreground">Share your portal link:</p>
                  <p className="text-primary font-mono text-xs break-all">
                    {window.location.origin}{import.meta.env.BASE_URL.replace(/\/$/, "")}/?org={createdOrg.slug}
                  </p>
                </div>
                <Button className="w-full" size="lg" onClick={handleLaunch}>
                  Go to admin dashboard <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Value props */}
          {step === 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
              {[
                { icon: Building2, title: "Branded portal", desc: "Your logo and school name throughout the experience" },
                { icon: Users, title: "50–200 students", desc: "Instant student acquisition — no cold outreach needed" },
                { icon: CreditCard, title: "$10 / seat", desc: "Predictable monthly revenue. Cancel or pause any time." },
              ].map(({ icon: Icon, title, desc }) => (
                <div key={title} className="rounded-lg border border-border p-4 space-y-2">
                  <Icon className="h-6 w-6 text-primary mx-auto" />
                  <p className="font-semibold text-sm">{title}</p>
                  <p className="text-xs text-muted-foreground">{desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
