import { useState, useEffect } from "react";
import { useLocation, Link } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Users, BookOpen, DollarSign, TrendingUp, UserPlus, Trash2, ExternalLink, Building2, Settings } from "lucide-react";

interface OrgDashboard {
  totalStudents: number;
  totalTeachers: number;
  monthlyBookingVolume: number;
  monthlyRevenueCents: number;
  monthlyPlatformFeesCents: number;
  subscriptionStatus: string;
  perSeatCents: number;
}

interface OrgMember {
  memberId: number;
  role: string;
  joinedAt: string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface Organisation {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  description: string | null;
  isPublicMarketplace: boolean;
  subscriptionStatus: string;
  perSeatCents: number;
  allowedListingTypes: string[];
  defaultLessonRateCents: number | null;
}

function useOrgSlug(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get("org");
}

function statusVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
  if (status === "active") return "default";
  if (status === "trialing") return "outline";
  if (status === "cancelled") return "destructive";
  return "secondary";
}

export default function OrgAdmin() {
  const orgSlug = useOrgSlug();
  const [, setLocation] = useLocation();

  const [org, setOrg] = useState<Organisation | null>(null);
  const [dashboard, setDashboard] = useState<OrgDashboard | null>(null);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"overview" | "members" | "settings">("overview");

  // Invite form
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteRole, setInviteRole] = useState<"teacher" | "student" | "admin">("teacher");
  const [inviting, setSaving] = useState(false);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  useEffect(() => {
    if (!orgSlug) { setLoading(false); return; }

    Promise.all([
      fetch(`${base}/api/orgs/${orgSlug}`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
      fetch(`${base}/api/orgs/${orgSlug}/dashboard`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
      fetch(`${base}/api/orgs/${orgSlug}/members`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
    ]).then(([orgData, dashData, membersData]) => {
      if (orgData?.org) setOrg(orgData.org);
      if (dashData) setDashboard(dashData);
      if (membersData?.members) setMembers(membersData.members);
    }).catch(() => {
      toast.error("Failed to load organisation data");
    }).finally(() => setLoading(false));
  }, [orgSlug, base]);

  async function handleInvite() {
    if (!orgSlug || !inviteUserId.trim()) { toast.error("User ID is required"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${base}/api/orgs/${orgSlug}/invite`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ userId: inviteUserId.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" })) as { error: string };
        toast.error(err.error ?? "Failed to invite member");
        return;
      }
      toast.success("Member added successfully");
      setInviteUserId("");
      const membersData = await fetch(`${base}/api/orgs/${orgSlug}/members`, { credentials: "include" }).then((r) => r.ok ? r.json() : null) as { members: OrgMember[] } | null;
      if (membersData?.members) setMembers(membersData.members);
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!orgSlug) return;
    if (!confirm("Remove this member from the organisation?")) return;
    try {
      const res = await fetch(`${base}/api/orgs/${orgSlug}/members/${userId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) { toast.error("Failed to remove member"); return; }
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      toast.success("Member removed");
    } catch {
      toast.error("Network error");
    }
  }

  async function handleBillingPortal() {
    if (!orgSlug) return;
    try {
      const returnUrl = window.location.href;
      const res = await fetch(`${base}/api/orgs/${orgSlug}/billing-portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ returnUrl }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Billing not set up" })) as { error: string };
        toast.error(err.error);
        return;
      }
      const data = await res.json() as { url: string };
      window.location.href = data.url;
    } catch {
      toast.error("Network error");
    }
  }

  async function handleSubscribe() {
    if (!orgSlug) return;
    try {
      const res = await fetch(`${base}/api/orgs/${orgSlug}/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" })) as { error: string };
        toast.error(err.error ?? "Failed to create subscription");
        return;
      }
      toast.success("Subscription created — complete payment in the billing portal");
    } catch {
      toast.error("Network error");
    }
  }

  if (!orgSlug) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <Building2 className="h-12 w-12 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground">No organisation selected. Add <code>?org=your-slug</code> to the URL.</p>
            <Button asChild><Link href="/schools/join">Create a school</Link></Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground font-serif">Loading admin dashboard…</div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <p className="text-muted-foreground">Organisation "{orgSlug}" not found or you don't have admin access.</p>
            <Button asChild><Link href="/schools/join">Create a school</Link></Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const students = members.filter((m) => m.role === "student");
  const teachers = members.filter((m) => m.role === "teacher");
  const admins = members.filter((m) => m.role === "admin");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 py-8 px-4">
        <div className="max-w-5xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {org.logoUrl ? (
                <img src={org.logoUrl} alt={org.name} className="h-10 w-10 rounded-lg object-contain border border-border" />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-serif font-bold text-foreground">{org.name}</h1>
                <p className="text-xs text-muted-foreground">harmonia.app/?org={org.slug}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusVariant(org.subscriptionStatus)}>
                {org.subscriptionStatus.charAt(0).toUpperCase() + org.subscriptionStatus.slice(1)}
              </Badge>
              <Button variant="outline" size="sm" asChild>
                <a href={`/?org=${org.slug}`} target="_blank" rel="noopener noreferrer">
                  View portal <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            {(["overview", "members", "settings"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {tab}
              </button>
            ))}
          </div>

          {/* Overview tab */}
          {activeTab === "overview" && dashboard && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { icon: Users, label: "Students", value: dashboard.totalStudents },
                  { icon: BookOpen, label: "Teachers", value: dashboard.totalTeachers },
                  { icon: TrendingUp, label: "Bookings this month", value: dashboard.monthlyBookingVolume },
                  { icon: DollarSign, label: "Revenue this month", value: `$${(dashboard.monthlyRevenueCents / 100).toFixed(0)}` },
                ].map(({ icon: Icon, label, value }) => (
                  <Card key={label}>
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{label}</span>
                      </div>
                      <p className="text-2xl font-bold font-serif">{value}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="font-serif text-lg">Billing</CardTitle>
                  <CardDescription>
                    Per-seat plan — ${(org.perSeatCents / 100).toFixed(0)} per active student per month
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Active students</span>
                    <span className="font-medium">{dashboard.totalStudents}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Monthly seat cost</span>
                    <span className="font-medium">${(dashboard.totalStudents * org.perSeatCents / 100).toFixed(0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Platform fees this month</span>
                    <span className="font-medium">${(dashboard.monthlyPlatformFeesCents / 100).toFixed(0)}</span>
                  </div>
                  <div className="pt-2 flex gap-2">
                    {org.subscriptionStatus === "inactive" || org.subscriptionStatus === "cancelled" ? (
                      <Button size="sm" onClick={handleSubscribe}>Activate subscription</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={handleBillingPortal}>
                        Manage billing <ExternalLink className="h-3 w-3 ml-1" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Members tab */}
          {activeTab === "members" && (
            <div className="space-y-6">
              {/* Invite form */}
              <Card>
                <CardHeader>
                  <CardTitle className="font-serif text-lg flex items-center gap-2">
                    <UserPlus className="h-5 w-5" /> Invite a member
                  </CardTitle>
                  <CardDescription>Add teachers, students, or additional admins by their Harmonia user ID.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={inviteUserId}
                      onChange={(e) => setInviteUserId(e.target.value)}
                      placeholder="Harmonia user ID (e.g. user_2abc...)"
                      className="flex-1"
                    />
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as typeof inviteRole)}
                      className="border border-input rounded-md px-3 py-2 text-sm bg-background"
                    >
                      <option value="teacher">Teacher</option>
                      <option value="student">Student</option>
                      <option value="admin">Admin</option>
                    </select>
                    <Button onClick={handleInvite} disabled={inviting}>
                      {inviting ? "Adding…" : "Add"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Users must already have a Harmonia account. Ask them to sign up first, then share their user ID from their profile settings.</p>
                </CardContent>
              </Card>

              {/* Member lists */}
              {[
                { label: "Admins", items: admins, variant: "default" as const },
                { label: "Teachers", items: teachers, variant: "outline" as const },
                { label: "Students", items: students, variant: "secondary" as const },
              ].map(({ label, items, variant }) => (
                <Card key={label}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="font-serif text-lg">{label}</CardTitle>
                      <Badge variant={variant}>{items.length}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No {label.toLowerCase()} yet.</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {items.map((m) => (
                          <div key={m.memberId} className="flex items-center justify-between py-3">
                            <div>
                              <p className="text-sm font-medium">
                                {m.firstName || m.lastName ? `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim() : "Unnamed user"}
                              </p>
                              <p className="text-xs text-muted-foreground">{m.email ?? m.userId}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">
                                Joined {new Date(m.joinedAt).toLocaleDateString()}
                              </span>
                              {m.userId && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => m.userId && handleRemoveMember(m.userId)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Settings tab */}
          {activeTab === "settings" && (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-lg flex items-center gap-2">
                  <Settings className="h-5 w-5" /> Organisation settings
                </CardTitle>
                <CardDescription>Manage your school portal configuration.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <OrgSettingsForm org={org} orgSlug={orgSlug} onSave={(updated) => setOrg(updated)} />
              </CardContent>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}

function OrgSettingsForm({ org, orgSlug, onSave }: { org: Organisation; orgSlug: string; onSave: (org: Organisation) => void }) {
  const [name, setName] = useState(org.name);
  const [description, setDescription] = useState(org.description ?? "");
  const [logoUrl, setLogoUrl] = useState(org.logoUrl ?? "");
  const [defaultRate, setDefaultRate] = useState(org.defaultLessonRateCents ? String(Math.round(org.defaultLessonRateCents / 100)) : "");
  const [isPublic, setIsPublic] = useState(org.isPublicMarketplace);
  const [saving, setSaving] = useState(false);

  const base = import.meta.env.BASE_URL.replace(/\/$/, "");

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`${base}/api/orgs/${orgSlug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: name.trim() || undefined,
          description: description.trim() || undefined,
          logoUrl: logoUrl.trim() || undefined,
          defaultLessonRateCents: defaultRate ? Math.round(parseFloat(defaultRate) * 100) : undefined,
          isPublicMarketplace: isPublic,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" })) as { error: string };
        toast.error(err.error ?? "Failed to save settings");
        return;
      }
      const data = await res.json() as { org: Organisation };
      onSave(data.org);
      toast.success("Settings saved");
    } catch {
      toast.error("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">School name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Description</label>
        <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Brief school description" />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Logo URL</label>
        <Input value={logoUrl} onChange={(e) => setLogoUrl(e.target.value)} placeholder="https://..." />
        {logoUrl && <img src={logoUrl} alt="Logo preview" className="h-10 object-contain rounded border border-border" />}
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium">Default lesson rate ($ / hour)</label>
        <Input type="number" value={defaultRate} onChange={(e) => setDefaultRate(e.target.value)} placeholder="e.g. 75" min="0" />
        <p className="text-xs text-muted-foreground">Suggested hourly rate for all teachers in your school.</p>
      </div>
      <div className="flex items-center gap-3">
        <input
          type="checkbox"
          id="publicMarketplace"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="h-4 w-4 rounded border-input"
        />
        <label htmlFor="publicMarketplace" className="text-sm">
          Allow teachers to appear on the public Harmonia marketplace
        </label>
      </div>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </Button>
    </div>
  );
}
