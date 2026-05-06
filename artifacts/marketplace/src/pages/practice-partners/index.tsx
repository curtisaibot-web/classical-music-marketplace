import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Music2, Users, Sparkles, Calendar, Video, CheckCircle2, Clock, Send, X } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API = `${BASE}/api`;

function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${API}${path}`, { credentials: "include", ...opts });
}

const INSTRUMENTS = [
  "Piano", "Violin", "Viola", "Cello", "Double Bass", "Flute", "Oboe", "Clarinet",
  "Bassoon", "Saxophone", "French Horn", "Trumpet", "Trombone", "Tuba", "Harp",
  "Guitar", "Voice", "Percussion", "Harpsichord", "Organ",
];

const GOALS = [
  { value: "technique", label: "Technique" },
  { value: "repertoire", label: "Repertoire" },
  { value: "sight-reading", label: "Sight-reading" },
  { value: "chamber-music", label: "Chamber Music" },
  { value: "performance", label: "Performance Prep" },
  { value: "theory", label: "Music Theory" },
];

const SKILL_LEVELS = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "professional", label: "Professional" },
];

const SESSION_FORMATS = [
  { value: "video-call", label: "Video Call" },
  { value: "in-person", label: "In Person" },
  { value: "either", label: "Either" },
];

interface PracticeProfile {
  id: number;
  userId: string;
  instruments: string[];
  skillLevel: string;
  goals: string[];
  availabilitySlots: Array<{ day: string; time: string }>;
  sessionFormat: string;
  bio: string | null;
  isActive: boolean;
  user: { firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
  matchScore?: number;
  matchReason?: string | null;
}

function ProfileSetupCard({ onSaved }: { onSaved: () => void }) {
  const [instruments, setInstruments] = useState<string[]>([]);
  const [skillLevel, setSkillLevel] = useState("intermediate");
  const [goals, setGoals] = useState<string[]>([]);
  const [sessionFormat, setSessionFormat] = useState("either");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(arr: T[], val: T) =>
    arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];

  async function handleSave() {
    if (instruments.length === 0) { toast.error("Select at least one instrument"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/practice/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruments, skillLevel, goals, availabilitySlots: [], sessionFormat, bio: bio || null }),
      });
      if (!res.ok) throw new Error("Failed to save profile");
      toast.success("Practice profile saved!");
      onSaved();
    } catch {
      toast.error("Failed to save profile. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-2xl mx-auto border-border shadow-sm">
      <CardHeader>
        <CardTitle className="font-serif text-xl">Create Your Practice Profile</CardTitle>
        <p className="text-sm text-muted-foreground">Tell us about yourself so we can match you with compatible practice partners.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-sm font-medium mb-2 block">Instruments <span className="text-destructive">*</span></Label>
          <div className="flex flex-wrap gap-2">
            {INSTRUMENTS.map((inst) => (
              <button
                key={inst}
                onClick={() => setInstruments(toggle(instruments, inst))}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  instruments.includes(inst)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                }`}
              >
                {inst}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="skill" className="text-sm font-medium mb-2 block">Skill Level</Label>
          <div className="flex gap-2 flex-wrap">
            {SKILL_LEVELS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSkillLevel(s.value)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  skillLevel === s.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Practice Goals</Label>
          <div className="flex flex-wrap gap-2">
            {GOALS.map((g) => (
              <button
                key={g.value}
                onClick={() => setGoals(toggle(goals, g.value))}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  goals.includes(g.value)
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium mb-2 block">Session Format</Label>
          <div className="flex gap-2">
            {SESSION_FORMATS.map((f) => (
              <button
                key={f.value}
                onClick={() => setSessionFormat(f.value)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                  sessionFormat === f.value
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary"
                }`}
              >
                {f.value === "video-call" && <Video className="inline h-3.5 w-3.5 mr-1" />}
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="bio" className="text-sm font-medium mb-2 block">Short Bio (optional)</Label>
          <Textarea
            id="bio"
            placeholder="Tell potential partners about your musical background and what you're looking to work on…"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            className="resize-none"
          />
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save Profile & Find Partners"}
        </Button>
      </CardContent>
    </Card>
  );
}

function PartnerCard({
  profile,
  onRequest,
  requesting,
}: {
  profile: PracticeProfile;
  onRequest: (userId: string) => void;
  requesting: boolean;
}) {
  const name = [profile.user?.firstName, profile.user?.lastName].filter(Boolean).join(" ") || "Musician";

  return (
    <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 overflow-hidden shrink-0 flex items-center justify-center">
            {profile.user?.profileImageUrl ? (
              <img src={profile.user.profileImageUrl} alt={name} className="w-full h-full object-cover" />
            ) : (
              <Music2 className="h-5 w-5 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-foreground truncate">{name}</h3>
              {profile.matchScore !== undefined && (
                <Badge variant="secondary" className="shrink-0 text-xs font-medium">
                  {profile.matchScore}% match
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {profile.instruments.slice(0, 3).map((inst) => (
                <span key={inst} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{inst}</span>
              ))}
              {profile.instruments.length > 3 && (
                <span className="text-xs text-muted-foreground px-2 py-0.5">+{profile.instruments.length - 3} more</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground mb-2">
              <span className="capitalize">{profile.skillLevel}</span>
              <span>·</span>
              <span>{profile.sessionFormat === "video-call" ? "Video call" : profile.sessionFormat === "in-person" ? "In person" : "Flexible"}</span>
            </div>
            {profile.goals.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {profile.goals.slice(0, 3).map((g) => (
                  <span key={g} className="text-xs border border-border rounded px-1.5 py-0.5 text-muted-foreground capitalize">
                    {g.replace("-", " ")}
                  </span>
                ))}
              </div>
            )}
            {profile.matchReason && (
              <div className="flex items-start gap-1.5 mb-3 p-2 bg-amber-50 border border-amber-200 rounded-md">
                <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">Why you match: {profile.matchReason}</p>
              </div>
            )}
            {profile.bio && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{profile.bio}</p>
            )}
            <Button size="sm" onClick={() => onRequest(profile.userId)} disabled={requesting} className="w-full">
              <Send className="h-3.5 w-3.5 mr-1.5" />
              {requesting ? "Sending…" : "Send Practice Request"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PartnershipsSection() {
  const qc = useQueryClient();
  const [, setLocation] = useLocation();

  const { data, isLoading } = useQuery({
    queryKey: ["practice", "partnerships"],
    queryFn: async () => {
      const res = await apiFetch("/practice/partnerships");
      if (!res.ok) throw new Error("Failed to load partnerships");
      return res.json() as Promise<{ partnerships: Array<{
        id: number;
        requesterId: string;
        recipientId: string;
        status: string;
        matchScore: number;
        matchReason: string | null;
        isRequester: boolean;
        partner: { firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
        partnerProfile: { instruments: string[]; skillLevel: string; sessionFormat: string } | null;
      }> }>;
    },
  });

  const acceptMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/practice/partnerships/${id}/accept`, { method: "POST" });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["practice"] }); toast.success("Partnership accepted!"); },
    onError: () => toast.error("Failed to accept request"),
  });

  const declineMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/practice/partnerships/${id}/decline`, { method: "POST" });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["practice"] }); toast.success("Request declined."); },
    onError: () => toast.error("Failed to decline request"),
  });

  if (isLoading) return <div className="text-center text-muted-foreground py-6 text-sm">Loading partnerships…</div>;

  const partnerships = data?.partnerships ?? [];
  const pending = partnerships.filter((p) => p.status === "pending" && !p.isRequester);
  const active = partnerships.filter((p) => p.status === "active");
  const sent = partnerships.filter((p) => p.status === "pending" && p.isRequester);

  if (partnerships.length === 0) return null;

  return (
    <div className="space-y-6 mb-10">
      {pending.length > 0 && (
        <div>
          <h2 className="text-lg font-serif font-semibold text-foreground mb-3">Incoming Requests</h2>
          <div className="space-y-3">
            {pending.map((p) => {
              const name = [p.partner?.firstName, p.partner?.lastName].filter(Boolean).join(" ") || "Musician";
              return (
                <Card key={p.id} className="border-primary/30 bg-primary/5 shadow-sm">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="h-10 w-10 rounded-full bg-primary/20 overflow-hidden flex items-center justify-center shrink-0">
                      {p.partner?.profileImageUrl ? (
                        <img src={p.partner.profileImageUrl} alt={name} className="w-full h-full object-cover" />
                      ) : (
                        <Music2 className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground">{name} wants to practice with you</p>
                      <p className="text-xs text-muted-foreground capitalize">{p.partnerProfile?.instruments?.join(", ") || "—"} · {p.partnerProfile?.skillLevel}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button size="sm" onClick={() => acceptMutation.mutate(p.id)} disabled={acceptMutation.isPending}>
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => declineMutation.mutate(p.id)} disabled={declineMutation.isPending}>
                        <X className="h-3.5 w-3.5 mr-1" /> Decline
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {active.length > 0 && (
        <div>
          <h2 className="text-lg font-serif font-semibold text-foreground mb-3">Active Partners</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {active.map((p) => {
              const name = [p.partner?.firstName, p.partner?.lastName].filter(Boolean).join(" ") || "Musician";
              return (
                <Card key={p.id} className="border-border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center shrink-0">
                        {p.partner?.profileImageUrl ? (
                          <img src={p.partner.profileImageUrl} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <Music2 className="h-4 w-4 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{p.partnerProfile?.instruments?.slice(0, 2).join(", ")}</p>
                      </div>
                      <Badge className="bg-green-100 text-green-800 border-green-200 shrink-0">Active</Badge>
                    </div>
                    <PartnerSessionWidget partnershipId={p.id} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {sent.length > 0 && (
        <div>
          <h2 className="text-lg font-serif font-semibold text-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> Pending Requests Sent
          </h2>
          <div className="space-y-2">
            {sent.map((p) => {
              const name = [p.partner?.firstName, p.partner?.lastName].filter(Boolean).join(" ") || "Musician";
              return (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border text-sm">
                  <div className="h-8 w-8 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {p.partner?.profileImageUrl ? (
                      <img src={p.partner.profileImageUrl} alt={name} className="w-full h-full object-cover" />
                    ) : (
                      <Music2 className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  <span className="flex-1 text-foreground">{name}</span>
                  <Badge variant="secondary">Awaiting response</Badge>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PartnerSessionWidget({ partnershipId }: { partnershipId: number }) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [proposedAt, setProposedAt] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { data } = useQuery({
    queryKey: ["practice", "sessions", partnershipId],
    queryFn: async () => {
      const res = await apiFetch(`/practice/partnerships/${partnershipId}/sessions`);
      if (!res.ok) throw new Error();
      return res.json() as Promise<{ sessions: Array<{
        id: number;
        status: string;
        proposedAt: string;
        confirmedAt: string | null;
        joinLink: string | null;
        proposedById: string;
      }> }>;
    },
  });

  const { user } = useUser();
  const sessions = data?.sessions ?? [];
  const nextSession = sessions.find((s) => s.status === "proposed" || s.status === "confirmed");

  async function proposeSession() {
    if (!proposedAt) { toast.error("Pick a date and time"); return; }
    setSubmitting(true);
    try {
      const res = await apiFetch(`/practice/partnerships/${partnershipId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedAt: new Date(proposedAt).toISOString(), joinLink: joinLink || undefined }),
      });
      if (!res.ok) throw new Error();
      toast.success("Session proposed!");
      setShowForm(false);
      setProposedAt("");
      setJoinLink("");
      qc.invalidateQueries({ queryKey: ["practice", "sessions", partnershipId] });
    } catch {
      toast.error("Failed to propose session");
    } finally {
      setSubmitting(false);
    }
  }

  async function confirmSession(sessionId: number) {
    const res = await apiFetch(`/practice/sessions/${sessionId}/confirm`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    if (!res.ok) { toast.error("Failed to confirm"); return; }
    toast.success("Session confirmed!");
    qc.invalidateQueries({ queryKey: ["practice", "sessions", partnershipId] });
  }

  async function completeSession(sessionId: number) {
    const res = await apiFetch(`/practice/sessions/${sessionId}/complete`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    if (!res.ok) { toast.error("Failed to mark complete"); return; }
    toast.success("Session marked complete!");
    qc.invalidateQueries({ queryKey: ["practice", "sessions", partnershipId] });
  }

  return (
    <div className="space-y-2">
      {nextSession ? (
        <div className="rounded-md border border-border p-3 bg-muted/30 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{new Date(nextSession.proposedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            <Badge variant={nextSession.status === "confirmed" ? "default" : "secondary"} className="capitalize ml-auto text-xs">{nextSession.status}</Badge>
          </div>
          {nextSession.joinLink && nextSession.status === "confirmed" && (
            <a href={nextSession.joinLink} target="_blank" rel="noopener noreferrer" className="block">
              <Button size="sm" variant="outline" className="w-full h-7 text-xs">
                <Video className="h-3 w-3 mr-1" /> Join Session
              </Button>
            </a>
          )}
          <div className="flex gap-1.5">
            {nextSession.status === "proposed" && nextSession.proposedById !== user?.id && (
              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => confirmSession(nextSession.id)}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Confirm
              </Button>
            )}
            {nextSession.status === "confirmed" && (
              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => completeSession(nextSession.id)}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Done
              </Button>
            )}
          </div>
        </div>
      ) : showForm ? (
        <div className="space-y-2">
          <Input
            type="datetime-local"
            value={proposedAt}
            onChange={(e) => setProposedAt(e.target.value)}
            className="text-xs h-8"
          />
          <Input
            placeholder="Zoom / Meet link (optional)"
            value={joinLink}
            onChange={(e) => setJoinLink(e.target.value)}
            className="text-xs h-8"
          />
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={proposeSession} disabled={submitting}>
              {submitting ? "Proposing…" : "Propose"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => setShowForm(true)}>
          <Calendar className="h-3 w-3 mr-1" /> Schedule Session
        </Button>
      )}
    </div>
  );
}

export default function PracticePartners() {
  const { isSignedIn } = useUser();
  const qc = useQueryClient();

  const { data: profileData, isLoading: profileLoading, refetch: refetchProfile } = useQuery({
    queryKey: ["practice", "profile", "me"],
    queryFn: async () => {
      const res = await apiFetch("/practice/profile/me");
      if (res.status === 404) return null;
      if (!res.ok) throw new Error();
      return res.json() as Promise<PracticeProfile | null>;
    },
    enabled: !!isSignedIn,
  });

  const { data: matchData, isLoading: matchLoading } = useQuery({
    queryKey: ["practice", "matches"],
    queryFn: async () => {
      const res = await apiFetch("/practice/matches");
      if (!res.ok) throw new Error();
      return res.json() as Promise<{ matches: PracticeProfile[]; hasProfile: boolean; isPremium: boolean }>;
    },
    enabled: !!isSignedIn && !!profileData,
  });

  const [requesting, setRequesting] = useState<string | null>(null);

  async function sendRequest(recipientId: string) {
    setRequesting(recipientId);
    try {
      const res = await apiFetch(`/practice/request/${recipientId}`, { method: "POST" });
      if (res.status === 409) { toast.error("A request already exists with this musician"); return; }
      if (!res.ok) throw new Error();
      toast.success("Practice request sent!");
      qc.invalidateQueries({ queryKey: ["practice", "matches"] });
      qc.invalidateQueries({ queryKey: ["practice", "partnerships"] });
    } catch {
      toast.error("Failed to send request");
    } finally {
      setRequesting(null);
    }
  }

  if (!isSignedIn) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-md px-4">
            <Users className="h-12 w-12 text-primary mx-auto mb-4" />
            <h1 className="text-2xl font-serif font-bold text-foreground mb-3">Practice Partner Matching</h1>
            <p className="text-muted-foreground mb-6">Connect with compatible musicians for regular practice sessions.</p>
            <Button asChild><Link href="/sign-up">Get Started</Link></Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      <main className="flex-1 container mx-auto px-4 py-10">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-start justify-between mb-8 gap-4">
            <div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-2">Practice Partner Matching</h1>
              <p className="text-muted-foreground">Find compatible musicians for regular practice sessions based on instrument, skill level, and goals.</p>
            </div>
            {profileData && (
              <Badge variant="outline" className="shrink-0 mt-1 gap-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Profile Active
              </Badge>
            )}
          </div>

          {profileLoading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : !profileData ? (
            <ProfileSetupCard onSaved={() => refetchProfile()} />
          ) : (
            <>
              <PartnershipsSection />

              <div className="flex items-center justify-between mb-6 gap-4">
                <h2 className="text-xl font-serif font-semibold text-foreground">Suggested Partners</h2>
                {matchData?.isPremium && (
                  <div className="flex items-center gap-1.5 text-amber-600 text-sm font-medium">
                    <Sparkles className="h-4 w-4" /> AI Matched
                  </div>
                )}
              </div>

              {matchLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map((i) => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
                </div>
              ) : (matchData?.matches ?? []).length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border rounded-xl">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No matches found yet</h3>
                  <p className="text-sm text-muted-foreground">As more musicians join, compatible partners will appear here.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {(matchData?.matches ?? []).map((profile) => (
                    <PartnerCard
                      key={profile.userId}
                      profile={profile}
                      onRequest={sendRequest}
                      requesting={requesting === profile.userId}
                    />
                  ))}
                </div>
              )}

              {!matchData?.isPremium && (
                <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
                  <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-900 mb-1">Unlock AI-Powered Matching</h3>
                    <p className="text-sm text-amber-800 mb-3">Business Suite subscribers get personalized "Why we matched" explanations and priority match rankings powered by AI.</p>
                    <Button size="sm" asChild className="bg-amber-600 hover:bg-amber-700 text-white border-0">
                      <Link href="/business-suite">Upgrade to Business Suite</Link>
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
