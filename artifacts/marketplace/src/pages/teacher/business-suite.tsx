import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Crown, FileText, Receipt, TrendingDown, Shield, Plus, Trash2, Edit2,
  Send, Download, ExternalLink, CheckCircle2, AlertCircle, BarChart2,
  Calendar, RefreshCw
} from "lucide-react";
import { toast } from "sonner";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { useGetMyTeacherProfile } from "@workspace/api-client-react";

const apiBase = import.meta.env.VITE_API_URL ?? "";

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await fetch(`${apiBase}/api${path}`, {
    ...opts,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error ?? "Request failed");
  }
  if (res.status === 204) return null;
  return res.json();
}

type Tab = "subscription" | "contracts" | "invoices" | "expenses" | "policy";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "subscription", label: "Subscription", icon: <Crown className="h-4 w-4" /> },
  { id: "contracts", label: "Contracts", icon: <FileText className="h-4 w-4" /> },
  { id: "invoices", label: "Invoices", icon: <Receipt className="h-4 w-4" /> },
  { id: "expenses", label: "Expenses", icon: <TrendingDown className="h-4 w-4" /> },
  { id: "policy", label: "Cancellation Policy", icon: <Shield className="h-4 w-4" /> },
];

const EXPENSE_CATEGORIES = [
  "Instrument Repair", "Music Scores & Books", "Travel", "Accommodation",
  "Equipment", "Recording", "Marketing", "Software", "Professional Development",
  "Studio Rental", "Insurance", "Other",
];

const CONTRACT_TEMPLATES = [
  { type: "lesson_package", title: "Lesson Package Agreement", description: "For recurring or package lesson arrangements" },
  { type: "single_event", title: "Performance Agreement", description: "For weddings, corporate events, concerts" },
  { type: "masterclass", title: "Masterclass Agreement", description: "For masterclass participation agreements" },
];

const CONTRACT_FIELDS: Record<string, { label: string; placeholder: string }[]> = {
  lesson_package: [
    { label: "Teacher Name", placeholder: "Your full name" },
    { label: "Client Name", placeholder: "Student / parent name" },
    { label: "Lesson Count", placeholder: "e.g. 10" },
    { label: "Duration Minutes", placeholder: "e.g. 60" },
    { label: "Instrument", placeholder: "e.g. Violin" },
    { label: "Fee", placeholder: "e.g. $800" },
    { label: "Payment Terms", placeholder: "e.g. due on signing" },
    { label: "Cancellation Hours", placeholder: "e.g. 24" },
    { label: "Cancellation Terms", placeholder: "e.g. No refund for late cancellations." },
    { label: "Date", placeholder: "e.g. 1 June 2026" },
  ],
  single_event: [
    { label: "Teacher Name", placeholder: "Your full name" },
    { label: "Client Name", placeholder: "Event organiser" },
    { label: "Event Name", placeholder: "e.g. Smith Wedding Reception" },
    { label: "Event Date", placeholder: "e.g. 15 July 2026" },
    { label: "Venue", placeholder: "Venue address" },
    { label: "Duration Minutes", placeholder: "e.g. 90" },
    { label: "Fee", placeholder: "e.g. $1,200" },
    { label: "Deposit Amount", placeholder: "e.g. $300" },
    { label: "Balance Due Date", placeholder: "e.g. 7 days before event" },
    { label: "Cancellation Hours", placeholder: "e.g. 48" },
    { label: "Cancellation Terms", placeholder: "e.g. Deposit non-refundable." },
    { label: "Travel Terms", placeholder: "e.g. Client covers travel within 30km." },
    { label: "Performer Equipment", placeholder: "e.g. own instrument" },
    { label: "Client Equipment", placeholder: "e.g. PA system, music stand" },
    { label: "Date", placeholder: "e.g. 1 June 2026" },
  ],
  masterclass: [
    { label: "Teacher Name", placeholder: "Your full name" },
    { label: "Client Name", placeholder: "Participant name" },
    { label: "Masterclass Title", placeholder: "e.g. Advanced Bow Technique" },
    { label: "Event Date", placeholder: "e.g. 20 August 2026" },
    { label: "Venue", placeholder: "Location or Zoom link" },
    { label: "Duration Minutes", placeholder: "e.g. 120" },
    { label: "Fee", placeholder: "e.g. $150" },
    { label: "Payment Due Date", placeholder: "e.g. 7 days before" },
    { label: "Participation Role", placeholder: "performer or observer" },
    { label: "Repertoire", placeholder: "e.g. one movement of a concerto" },
    { label: "Recording Consent", placeholder: "e.g. Session may be recorded for educational use." },
    { label: "Cancellation Hours", placeholder: "e.g. 72" },
    { label: "Cancellation Terms", placeholder: "e.g. No refund." },
    { label: "Date", placeholder: "e.g. 1 June 2026" },
  ],
};

function fieldKey(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1).replace(/\s+(.)/g, (_, c) => c.toUpperCase());
}

type SubResponse = {
  subscription: {
    id: number; status: string; currentPeriodEnd: string | null;
    stripeCustomerId: string | null; stripeSubscriptionId: string | null;
    createdAt: string; updatedAt: string;
  } | null;
  isProSubscriber: boolean;
};

function SubscriptionTab() {
  const [sub, setSub] = useState<SubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [checkoutLoading, setCheckoutLoading] = useState<"monthly" | "annual" | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    apiFetch("/subscriptions/me").then(setSub).catch(() => setSub({ subscription: null, isProSubscriber: false })).finally(() => setLoading(false));
  }, []);

  const handleSubscribe = async (plan: "monthly" | "annual") => {
    setCheckoutLoading(plan);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const data = await apiFetch("/subscriptions/checkout", {
        method: "POST",
        body: JSON.stringify({
          plan,
          successUrl: `${window.location.origin}${basePath}/business-suite`,
          cancelUrl: `${window.location.origin}${basePath}/business-suite`,
        }),
      });
      if (data?.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch (e) {
      toast.error((e as Error).message || "Failed to start checkout");
    } finally {
      setCheckoutLoading(null);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
      const data = await apiFetch("/subscriptions/portal", {
        method: "POST",
        body: JSON.stringify({ returnUrl: `${window.location.origin}${basePath}/business-suite` }),
      });
      if (data?.portalUrl) window.location.href = data.portalUrl;
    } catch (e) {
      toast.error((e as Error).message || "Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  if (loading) return <div className="animate-pulse space-y-4"><div className="h-32 bg-muted rounded-xl" /></div>;

  if (sub?.isProSubscriber) {
    return (
      <div className="space-y-6">
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-6 flex items-start gap-4">
            <Crown className="h-8 w-8 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-serif font-semibold text-lg">Business Suite — Active</h3>
                <Badge className="bg-amber-500 text-white text-xs">PRO</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {sub.subscription?.currentPeriodEnd
                  ? `Your subscription renews on ${format(new Date(sub.subscription.currentPeriodEnd), "MMMM d, yyyy")}.`
                  : "Your subscription is active."}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6 space-y-3">
            <h4 className="font-medium">What's included</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {["Digital contracts with e-signature", "Professional PDF invoices", "Expense tracker with monthly summaries", "Cancellation policy enforcement", "Pro badge on your public profile"].map(f => (
                <li key={f} className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />{f}</li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={handlePortal} disabled={portalLoading}>
              <ExternalLink className="h-4 w-4 mr-2" />
              {portalLoading ? "Loading..." : "Manage Billing"}
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-serif font-semibold mb-2">Upgrade to Business Suite</h2>
        <p className="text-muted-foreground text-sm">Professional business tools built specifically for classical musicians. Spend less time on admin, more time making music.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-2 border-border hover:border-primary/40 transition-colors">
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="font-serif font-semibold text-lg">Monthly</h3>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-bold">$29</span>
                <span className="text-muted-foreground">/month</span>
              </div>
            </div>
            <Button className="w-full" onClick={() => handleSubscribe("monthly")} disabled={checkoutLoading !== null}>
              {checkoutLoading === "monthly" ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Loading…</> : "Subscribe Monthly"}
            </Button>
          </CardContent>
        </Card>

        <Card className="border-2 border-amber-400 relative">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <Badge className="bg-amber-500 text-white px-3">Best value — save 20%</Badge>
          </div>
          <CardContent className="p-6 space-y-4">
            <div>
              <h3 className="font-serif font-semibold text-lg">Annual</h3>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-3xl font-bold">$279</span>
                <span className="text-muted-foreground">/year</span>
                <span className="text-sm text-muted-foreground ml-1">($23.25/mo)</span>
              </div>
            </div>
            <Button className="w-full bg-amber-500 hover:bg-amber-600 text-white" onClick={() => handleSubscribe("annual")} disabled={checkoutLoading !== null}>
              {checkoutLoading === "annual" ? <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Loading…</> : "Subscribe Annually"}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="p-6">
          <h4 className="font-medium mb-3">Everything included</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              "Digital contracts with e-signature",
              "Customisable invoice PDFs",
              "Expense tracker & tax summary",
              "Cancellation policy enforcement",
              "Pro badge on your public profile",
              "Priority support",
            ].map(f => (
              <div key={f} className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface Contract {
  id: number;
  templateType: string;
  title: string;
  clientEmail?: string;
  clientName?: string;
  status: "draft" | "sent" | "signed";
  signedAt?: string;
  signerName?: string;
  createdAt: string;
  fields: Record<string, string>;
}

function ContractsTab({ isPro }: { isPro: boolean }) {
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [clientEmail, setClientEmail] = useState("");
  const [clientName, setClientName] = useState("");
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<number | null>(null);

  const load = () => {
    if (!isPro) { setLoading(false); return; }
    apiFetch("/contracts").then(d => setContracts(d.contracts ?? [])).catch(() => toast.error("Failed to load contracts")).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [isPro]);

  const handleCreate = async () => {
    if (!selectedTemplate) return;
    setSaving(true);
    try {
      const mappedFields: Record<string, string> = {};
      (CONTRACT_FIELDS[selectedTemplate] ?? []).forEach(f => {
        mappedFields[fieldKey(f.label)] = fields[f.label] ?? "";
      });
      await apiFetch("/contracts", {
        method: "POST",
        body: JSON.stringify({ templateType: selectedTemplate, fields: mappedFields, clientEmail, clientName }),
      });
      toast.success("Contract created");
      setCreateOpen(false);
      setSelectedTemplate(null);
      setFields({});
      setClientEmail("");
      setClientName("");
      load();
    } catch (e) {
      toast.error((e as Error).message || "Failed to create contract");
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (id: number) => {
    setSending(id);
    try {
      const data = await apiFetch(`/contracts/${id}/send`, { method: "POST" });
      toast.success(`Contract sent! Signing link: ${data.signUrl}`);
      load();
    } catch (e) {
      toast.error((e as Error).message || "Failed to send contract");
    } finally {
      setSending(null);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this contract?")) return;
    try {
      await apiFetch(`/contracts/${id}`, { method: "DELETE" });
      toast.success("Contract deleted");
      load();
    } catch {
      toast.error("Failed to delete contract");
    }
  };

  if (!isPro) return <ProGate />;

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-100 text-blue-700",
    signed: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-serif font-semibold">Contracts</h2>
          <p className="text-sm text-muted-foreground">Create, send, and track digital contracts with clients.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />New Contract
        </Button>
      </div>

      {loading ? <div className="animate-pulse space-y-3">{[0,1].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>
        : contracts.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="p-10 text-center">
              <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No contracts yet. Create one to get started.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {contracts.map(c => (
              <Card key={c.id} className="border-border">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{c.title}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[c.status]}`}>{c.status}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {c.clientName ?? "No client"} · {format(new Date(c.createdAt), "MMM d, yyyy")}
                      {c.status === "signed" && c.signerName ? ` · Signed by ${c.signerName}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`${apiBase}/api/contracts/${c.id}/pdf`} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5 mr-1" />View
                      </a>
                    </Button>
                    {c.status === "draft" && (
                      <Button size="sm" onClick={() => handleSend(c.id)} disabled={sending === c.id}>
                        <Send className="h-3.5 w-3.5 mr-1" />{sending === c.id ? "Sending…" : "Send"}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">Create Contract</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {!selectedTemplate ? (
              <>
                <p className="text-sm text-muted-foreground">Choose a template to get started:</p>
                <div className="space-y-3">
                  {CONTRACT_TEMPLATES.map(t => (
                    <Card key={t.type} className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setSelectedTemplate(t.type)}>
                      <CardContent className="p-4">
                        <div className="font-medium text-sm">{t.title}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">{CONTRACT_TEMPLATES.find(t => t.type === selectedTemplate)?.title}</h4>
                  <Button variant="ghost" size="sm" onClick={() => { setSelectedTemplate(null); setFields({}); }}>Change template</Button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1 space-y-1.5">
                    <Label className="text-xs">Client Email</Label>
                    <Input placeholder="client@example.com" value={clientEmail} onChange={e => setClientEmail(e.target.value)} />
                  </div>
                  <div className="col-span-2 sm:col-span-1 space-y-1.5">
                    <Label className="text-xs">Client Name</Label>
                    <Input placeholder="Full name" value={clientName} onChange={e => setClientName(e.target.value)} />
                  </div>
                  {(CONTRACT_FIELDS[selectedTemplate] ?? []).map(f => (
                    <div key={f.label} className="space-y-1.5">
                      <Label className="text-xs">{f.label}</Label>
                      <Input placeholder={f.placeholder} value={fields[f.label] ?? ""} onChange={e => setFields(prev => ({ ...prev, [f.label]: e.target.value }))} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
          {selectedTemplate && (
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? "Creating…" : "Create Contract"}
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface Invoice {
  id: number;
  clientEmail: string;
  clientName: string;
  amountInCents: number;
  currency: string;
  status: "draft" | "sent" | "paid";
  notes?: string;
  dueDate?: string;
  sentAt?: string;
  createdAt: string;
}

function InvoicesTab({ isPro }: { isPro: boolean }) {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [form, setForm] = useState({
    clientEmail: "", clientName: "", amountInCents: "", notes: "", paymentNote: "",
    dueDate: "", lineItemDesc: "", lineItemAmount: "",
  });
  const [lineItems, setLineItems] = useState<{ description: string; amountInCents: number }[]>([]);

  const load = () => {
    if (!isPro) { setLoading(false); return; }
    apiFetch("/invoices").then(d => setInvoices(d.invoices ?? [])).catch(() => toast.error("Failed to load invoices")).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [isPro]);

  const addLineItem = () => {
    const amount = parseFloat(form.lineItemAmount);
    if (!form.lineItemDesc || isNaN(amount) || amount <= 0) return;
    setLineItems(prev => [...prev, { description: form.lineItemDesc, amountInCents: Math.round(amount * 100) }]);
    setForm(prev => ({ ...prev, lineItemDesc: "", lineItemAmount: "" }));
  };

  const handleCreate = async () => {
    if (!form.clientEmail || !form.clientName) { toast.error("Client email and name are required"); return; }
    const total = lineItems.length > 0 ? lineItems.reduce((s, i) => s + i.amountInCents, 0) : Math.round(parseFloat(form.amountInCents) * 100);
    if (!total || total <= 0) { toast.error("Enter an amount or add line items"); return; }
    setSaving(true);
    try {
      await apiFetch("/invoices", {
        method: "POST",
        body: JSON.stringify({
          clientEmail: form.clientEmail,
          clientName: form.clientName,
          amountInCents: total,
          notes: form.notes || undefined,
          paymentNote: form.paymentNote || undefined,
          lineItems: lineItems.length > 0 ? lineItems : undefined,
          dueDate: form.dueDate || undefined,
        }),
      });
      toast.success("Invoice created");
      setCreateOpen(false);
      setForm({ clientEmail: "", clientName: "", amountInCents: "", notes: "", paymentNote: "", dueDate: "", lineItemDesc: "", lineItemAmount: "" });
      setLineItems([]);
      load();
    } catch (e) {
      toast.error((e as Error).message || "Failed to create invoice");
    } finally {
      setSaving(false);
    }
  };

  const handleSend = async (id: number) => {
    setSending(id);
    try {
      await apiFetch(`/invoices/${id}/send`, { method: "POST" });
      toast.success("Invoice marked as sent");
      load();
    } catch (e) {
      toast.error((e as Error).message || "Failed to send invoice");
    } finally {
      setSending(null);
    }
  };

  const handleMarkPaid = async (id: number) => {
    try {
      await apiFetch(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify({ status: "paid" }) });
      toast.success("Invoice marked as paid");
      load();
    } catch { toast.error("Failed to update invoice"); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this invoice?")) return;
    try {
      await apiFetch(`/invoices/${id}`, { method: "DELETE" });
      toast.success("Invoice deleted");
      load();
    } catch { toast.error("Failed to delete invoice"); }
  };

  if (!isPro) return <ProGate />;

  const statusColors: Record<string, string> = {
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-serif font-semibold">Invoices</h2>
          <p className="text-sm text-muted-foreground">Generate professional invoices and track payments.</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />New Invoice
        </Button>
      </div>

      {loading ? <div className="animate-pulse space-y-3">{[0,1].map(i => <div key={i} className="h-16 bg-muted rounded-lg" />)}</div>
        : invoices.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="p-10 text-center">
              <Receipt className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No invoices yet. Create your first invoice.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {invoices.map(inv => (
              <Card key={inv.id} className="border-border">
                <CardContent className="p-4 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{inv.clientName}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[inv.status]}`}>{inv.status}</span>
                      <span className="font-medium text-sm text-foreground">${(inv.amountInCents / 100).toFixed(2)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inv.clientEmail} · #{String(inv.id).padStart(4, "0")} · {format(new Date(inv.createdAt), "MMM d, yyyy")}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap">
                    <Button variant="outline" size="sm" asChild>
                      <a href={`${apiBase}/api/invoices/${inv.id}/pdf`} target="_blank" rel="noreferrer">
                        <Download className="h-3.5 w-3.5 mr-1" />PDF
                      </a>
                    </Button>
                    {inv.status === "draft" && (
                      <Button size="sm" variant="outline" onClick={() => handleSend(inv.id)} disabled={sending === inv.id}>
                        <Send className="h-3.5 w-3.5 mr-1" />{sending === inv.id ? "…" : "Send"}
                      </Button>
                    )}
                    {inv.status === "sent" && (
                      <Button size="sm" variant="outline" onClick={() => handleMarkPaid(inv.id)}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Mark Paid
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => handleDelete(inv.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">Create Invoice</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Client Name *</Label>
                <Input placeholder="Full name" value={form.clientName} onChange={e => setForm(p => ({ ...p, clientName: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Client Email *</Label>
                <Input placeholder="client@example.com" value={form.clientEmail} onChange={e => setForm(p => ({ ...p, clientEmail: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Due Date</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Total Amount (if no line items)</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amountInCents} onChange={e => setForm(p => ({ ...p, amountInCents: e.target.value }))} disabled={lineItems.length > 0} />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs">Line Items</Label>
              {lineItems.map((li, i) => (
                <div key={i} className="flex items-center justify-between text-sm bg-muted/40 px-3 py-2 rounded">
                  <span>{li.description}</span>
                  <div className="flex items-center gap-2">
                    <span>${(li.amountInCents / 100).toFixed(2)}</span>
                    <button onClick={() => setLineItems(prev => prev.filter((_, j) => j !== i))}><Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" /></button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="Description" value={form.lineItemDesc} onChange={e => setForm(p => ({ ...p, lineItemDesc: e.target.value }))} className="flex-1" />
                <Input type="number" min="0" step="0.01" placeholder="Amount $" value={form.lineItemAmount} onChange={e => setForm(p => ({ ...p, lineItemAmount: e.target.value }))} className="w-28" />
                <Button variant="outline" size="sm" onClick={addLineItem}>Add</Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Payment Instructions</Label>
              <Textarea placeholder="e.g. PayPal: teacher@example.com or Bank transfer details" value={form.paymentNote} onChange={e => setForm(p => ({ ...p, paymentNote: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Notes</Label>
              <Textarea placeholder="Additional notes" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving ? "Creating…" : "Create Invoice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface Expense {
  id: number;
  amountInCents: number;
  category: string;
  description?: string;
  date: string;
  createdAt: string;
}

function ExpensesTab({ isPro }: { isPro: boolean }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [byCategory, setByCategory] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editExpense, setEditExpense] = useState<Expense | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ amountInCents: "", category: "", description: "", date: format(new Date(), "yyyy-MM-dd") });

  const load = () => {
    if (!isPro) { setLoading(false); return; }
    apiFetch(`/expenses?month=${month}&year=${year}`)
      .then(d => { setExpenses(d.expenses ?? []); setTotal(d.totalInCents ?? 0); setByCategory(d.byCategory ?? {}); })
      .catch(() => toast.error("Failed to load expenses"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [isPro, month, year]);

  const openEdit = (e: Expense) => {
    setEditExpense(e);
    setForm({ amountInCents: (e.amountInCents / 100).toFixed(2), category: e.category, description: e.description ?? "", date: format(new Date(e.date), "yyyy-MM-dd") });
    setAddOpen(true);
  };

  const handleSave = async () => {
    const amount = Math.round(parseFloat(form.amountInCents) * 100);
    if (!amount || amount <= 0) { toast.error("Enter a valid amount"); return; }
    if (!form.category) { toast.error("Category is required"); return; }
    setSaving(true);
    try {
      if (editExpense) {
        await apiFetch(`/expenses/${editExpense.id}`, {
          method: "PUT",
          body: JSON.stringify({ amountInCents: amount, category: form.category, description: form.description || undefined, date: form.date }),
        });
        toast.success("Expense updated");
      } else {
        await apiFetch("/expenses", {
          method: "POST",
          body: JSON.stringify({ amountInCents: amount, category: form.category, description: form.description || undefined, date: form.date }),
        });
        toast.success("Expense added");
      }
      setAddOpen(false);
      setEditExpense(null);
      setForm({ amountInCents: "", category: "", description: "", date: format(new Date(), "yyyy-MM-dd") });
      load();
    } catch (e) {
      toast.error((e as Error).message || "Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this expense?")) return;
    try {
      await apiFetch(`/expenses/${id}`, { method: "DELETE" });
      toast.success("Expense deleted");
      load();
    } catch { toast.error("Failed to delete expense"); }
  };

  if (!isPro) return <ProGate />;

  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-serif font-semibold">Expense Tracker</h2>
          <p className="text-sm text-muted-foreground">Track expenses by category for tax preparation.</p>
        </div>
        <Button onClick={() => { setEditExpense(null); setForm({ amountInCents: "", category: "", description: "", date: format(new Date(), "yyyy-MM-dd") }); setAddOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />Add Expense
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[year - 1, year, year + 1].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto font-semibold">Total: ${(total / 100).toFixed(2)}</div>
      </div>

      {Object.keys(byCategory).length > 0 && (
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-3">By Category</h4>
            <div className="space-y-2">
              {Object.entries(byCategory).sort(([,a],[,b]) => b - a).map(([cat, amt]) => (
                <div key={cat} className="flex items-center gap-3">
                  <div className="text-sm flex-1">{cat}</div>
                  <div className="h-2 bg-primary/20 rounded-full flex-[3] overflow-hidden">
                    <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (amt / total) * 100)}%` }} />
                  </div>
                  <div className="text-sm font-medium w-20 text-right">${(amt / 100).toFixed(2)}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loading ? <div className="animate-pulse space-y-3">{[0,1,2].map(i => <div key={i} className="h-14 bg-muted rounded-lg" />)}</div>
        : expenses.length === 0 ? (
          <Card className="bg-muted/30">
            <CardContent className="p-10 text-center">
              <TrendingDown className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-muted-foreground text-sm">No expenses for {months[month - 1]} {year}.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {expenses.map(e => (
              <div key={e.id} className="flex items-center justify-between px-4 py-3 border border-border rounded-lg bg-background hover:bg-muted/20 transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{e.category}</span>
                    {e.description && <span className="text-xs text-muted-foreground truncate">— {e.description}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">{format(new Date(e.date), "MMM d, yyyy")}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-medium text-sm">${(e.amountInCents / 100).toFixed(2)}</span>
                  <button onClick={() => openEdit(e)} className="text-muted-foreground hover:text-foreground"><Edit2 className="h-3.5 w-3.5" /></button>
                  <button onClick={() => handleDelete(e.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

      <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) setEditExpense(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif">{editExpense ? "Edit Expense" : "Add Expense"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Amount ($) *</Label>
                <Input type="number" min="0" step="0.01" placeholder="0.00" value={form.amountInCents} onChange={e => setForm(p => ({ ...p, amountInCents: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Date *</Label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Category *</Label>
              <Select value={form.category} onValueChange={v => setForm(p => ({ ...p, category: v }))}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Description</Label>
              <Input placeholder="e.g. Bow rehair — local luthier" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type CancellationRecord = {
  id: number;
  studentName: string;
  studentEmail: string | null;
  scheduledAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  priceInCents: number;
  currency: string;
  instrument: string | null;
  cancellationPolicyHoursSnapshot: number | null;
  cancellationFeePercentSnapshot: number | null;
  cancellationFeeOwedInCents: number | null;
};

function PolicyTab({ isPro }: { isPro: boolean }) {
  const { data: profile, isLoading } = useGetMyTeacherProfile();
  const [hours, setHours] = useState(24);
  const [feePercent, setFeePercent] = useState(50);
  const [saving, setSaving] = useState(false);
  const [cancellations, setCancellations] = useState<CancellationRecord[]>([]);
  const [cancelStats, setCancelStats] = useState<{ totalFeeOwedInCents: number; lateCancellationCount: number } | null>(null);
  const [cancelLoading, setCancelLoading] = useState(true);

  useEffect(() => {
    if (profile) {
      setHours((profile as { cancellationPolicyHours?: number }).cancellationPolicyHours ?? 24);
      setFeePercent((profile as { cancellationFeePercent?: number }).cancellationFeePercent ?? 50);
    }
  }, [profile]);

  useEffect(() => {
    if (!isPro) return;
    apiFetch("/bookings/cancellations")
      .then((d: { cancellations: CancellationRecord[]; totalFeeOwedInCents: number; lateCancellationCount: number }) => {
        setCancellations(d.cancellations ?? []);
        setCancelStats({ totalFeeOwedInCents: d.totalFeeOwedInCents, lateCancellationCount: d.lateCancellationCount });
      })
      .catch(() => setCancellations([]))
      .finally(() => setCancelLoading(false));
  }, [isPro]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await apiFetch("/teachers/me", {
        method: "PUT",
        body: JSON.stringify({ cancellationPolicyHours: hours, cancellationFeePercent: feePercent }),
      });
      toast.success("Cancellation policy saved");
    } catch (e) {
      toast.error((e as Error).message || "Failed to save policy");
    } finally {
      setSaving(false);
    }
  };

  if (!isPro) return <ProGate />;
  if (isLoading) return <div className="animate-pulse h-40 bg-muted rounded-xl" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-serif font-semibold">Cancellation Policy</h2>
        <p className="text-sm text-muted-foreground">Set your cancellation terms. This policy is shown to students before they book.</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="cancel-hours">Notice required (hours)</Label>
            <Input
              id="cancel-hours"
              type="number"
              min="1"
              max="336"
              value={hours}
              onChange={e => setHours(Number(e.target.value))}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground">Students must cancel at least this many hours in advance to avoid a fee.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cancel-fee">Cancellation fee (%)</Label>
            <Input
              id="cancel-fee"
              type="number"
              min="0"
              max="100"
              value={feePercent}
              onChange={e => setFeePercent(Number(e.target.value))}
              className="w-40"
            />
            <p className="text-xs text-muted-foreground">Percentage of the booking fee charged for late cancellations. Set to 0 for no fee.</p>
          </div>

          <div className="bg-muted/40 rounded-lg px-4 py-3 text-sm">
            <span className="font-medium">Policy preview: </span>
            {feePercent > 0
              ? `Cancellations within ${hours} hours of the booking will incur a ${feePercent}% cancellation fee.`
              : `Free cancellation up to ${hours} hours before the booking.`}
          </div>

          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save Policy"}
          </Button>
        </CardContent>
      </Card>

      {/* Cancellation tracking dashboard */}
      <div>
        <h3 className="text-base font-serif font-semibold mb-1">Cancellation History</h3>
        <p className="text-sm text-muted-foreground mb-4">Track cancelled bookings and any fees owed by students.</p>

        {cancelStats && (cancelStats.lateCancellationCount > 0 || cancelStats.totalFeeOwedInCents > 0) && (
          <div className="grid grid-cols-2 gap-4 mb-4">
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Late Cancellations</p>
                <p className="text-2xl font-bold text-amber-800 mt-1">{cancelStats.lateCancellationCount}</p>
              </CardContent>
            </Card>
            <Card className="border-amber-200 bg-amber-50">
              <CardContent className="p-4">
                <p className="text-xs text-amber-700 font-medium uppercase tracking-wide">Total Fees Owed</p>
                <p className="text-2xl font-bold text-amber-800 mt-1">${(cancelStats.totalFeeOwedInCents / 100).toFixed(2)}</p>
              </CardContent>
            </Card>
          </div>
        )}

        {cancelLoading ? (
          <div className="animate-pulse h-32 bg-muted rounded-xl" />
        ) : cancellations.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="p-8 text-center text-muted-foreground text-sm">
              <Shield className="h-8 w-8 mx-auto mb-2 opacity-30" />
              No cancelled bookings yet.
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {cancellations.map(c => {
                  const feeOwed = c.cancellationFeeOwedInCents ?? 0;
                  const isLate = feeOwed > 0;
                  return (
                    <div key={c.id} className="px-5 py-4 flex items-start justify-between gap-4">
                      <div className="space-y-0.5 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{c.studentName}</span>
                          {isLate && (
                            <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 bg-amber-50">Late cancel</Badge>
                          )}
                        </div>
                        {c.scheduledAt && (
                          <p className="text-xs text-muted-foreground">
                            Lesson: {format(new Date(c.scheduledAt), "MMM d, yyyy 'at' h:mm a")}
                          </p>
                        )}
                        {c.cancelledAt && (
                          <p className="text-xs text-muted-foreground">
                            Cancelled: {format(new Date(c.cancelledAt), "MMM d, yyyy")}
                          </p>
                        )}
                        {c.cancelReason && (
                          <p className="text-xs text-muted-foreground italic">"{c.cancelReason}"</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium">${(c.priceInCents / 100).toFixed(2)}</p>
                        {isLate ? (
                          <p className="text-xs text-amber-700 font-medium">Fee owed: ${(feeOwed / 100).toFixed(2)}</p>
                        ) : (
                          <p className="text-xs text-green-700">No fee</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function ProGate() {
  return (
    <Card className="bg-muted/30 border-dashed">
      <CardContent className="p-10 text-center space-y-3">
        <Crown className="h-10 w-10 text-amber-400 mx-auto" />
        <h3 className="font-serif font-semibold">Business Suite Required</h3>
        <p className="text-sm text-muted-foreground">Subscribe to the Business Suite to access this feature.</p>
        <Button onClick={() => window.location.hash = "subscription"} variant="outline" size="sm">
          View Plans
        </Button>
      </CardContent>
    </Card>
  );
}

export default function BusinessSuite() {
  const [tab, setTab] = useState<Tab>("subscription");
  const [isPro, setIsPro] = useState(false);

  useEffect(() => {
    apiFetch("/subscriptions/me")
      .then((d: SubResponse) => setIsPro(d?.isProSubscriber ?? false))
      .catch(() => setIsPro(false));
  }, []);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "") as Tab;
    if (TABS.some(t => t.id === hash)) setTab(hash);
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-5xl">
        <div className="flex items-center gap-3 mb-8">
          <Crown className="h-7 w-7 text-amber-500" />
          <div>
            <h1 className="text-3xl font-serif font-bold">Business Suite</h1>
            <p className="text-muted-foreground text-sm">Professional tools for your music business</p>
          </div>
          {isPro && <Badge className="bg-amber-500 text-white ml-2">PRO</Badge>}
        </div>

        <div className="flex gap-1 mb-8 border-b border-border overflow-x-auto pb-px">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        <div>
          {tab === "subscription" && <SubscriptionTab />}
          {tab === "contracts" && <ContractsTab isPro={isPro} />}
          {tab === "invoices" && <InvoicesTab isPro={isPro} />}
          {tab === "expenses" && <ExpensesTab isPro={isPro} />}
          {tab === "policy" && <PolicyTab isPro={isPro} />}
        </div>
      </main>
      <Footer />
    </div>
  );
}
