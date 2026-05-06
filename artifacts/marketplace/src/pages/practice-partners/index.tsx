import { useState, useMemo } from "react";
import { Link } from "wouter";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Music2, Users, Sparkles, Calendar, Video, CheckCircle2, Clock,
  Send, X, Download, RefreshCw, Search, UserMinus, History,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function apiFetch(path: string, opts?: RequestInit) {
  return fetch(`${BASE}/api${path}`, { credentials: "include", ...opts });
}

function isSafeUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch { return false; }
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

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const TIMES = [
  "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM",
  "5:00 PM", "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM",
];

interface AvailabilitySlot { day: string; time: string; }
interface PracticeProfile {
  id: number; userId: string; instruments: string[]; skillLevel: string; goals: string[];
  availabilitySlots: AvailabilitySlot[]; sessionFormat: string; bio: string | null; isActive: boolean;
  user: { firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
  matchScore?: number; matchReason?: string | null;
}
interface SessionCompletion { id: number; sessionId: number; userId: string; notes: string | null; completedAt: string; }
interface SessionData {
  id: number; status: string; proposedAt: string; confirmedAt: string | null; completedAt: string | null;
  joinLink: string | null; proposedById: string;
  myCompletion?: SessionCompletion | null;
}
interface Partnership {
  id: number; requesterId: string; recipientId: string; status: string;
  matchScore: number; matchReason: string | null; isRequester: boolean;
  partner: { firstName: string | null; lastName: string | null; profileImageUrl: string | null } | null;
  partnerProfile: { userId: string; instruments: string[]; skillLevel: string; sessionFormat: string } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function avatarName(p: Partnership["partner"]) {
  return [p?.firstName, p?.lastName].filter(Boolean).join(" ") || "Musician";
}

function AvatarIcon({ partner }: { partner: Partnership["partner"] }) {
  const name = avatarName(partner);
  return (
    <div className="h-10 w-10 rounded-full bg-primary/10 overflow-hidden flex items-center justify-center shrink-0">
      {partner?.profileImageUrl
        ? <img src={partner.profileImageUrl} alt={name} className="w-full h-full object-cover" />
        : <Music2 className="h-4 w-4 text-primary" />}
    </div>
  );
}

function Countdown({ date }: { date: string }) {
  const target = new Date(date).getTime();
  const now = Date.now();
  const diff = target - now;
  if (diff <= 0) return <span className="text-xs text-muted-foreground">Now</span>;
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor((diff % 86_400_000) / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (days === 0) parts.push(`${mins}m`);
  return <span className="text-xs font-medium text-primary">in {parts.join(" ")}</span>;
}

// ── ICS Calendar ───────────────────────────────────────────────────────────────

function makeICS(title: string, start: Date, mins = 60): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  const end = new Date(start.getTime() + mins * 60_000);
  return ["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Harmonia//Practice Partner//EN",
    "BEGIN:VEVENT",`UID:${Date.now()}@harmonia`,`DTSTART:${fmt(start)}`,`DTEND:${fmt(end)}`,
    `SUMMARY:${title}`,"END:VEVENT","END:VCALENDAR"].join("\r\n");
}

function downloadICS(title: string, start: Date) {
  const blob = new Blob([makeICS(title, start)], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: "practice-session.ics" });
  a.click();
  URL.revokeObjectURL(url);
}

// ── Availability Editor ────────────────────────────────────────────────────────

function AvailabilityEditor({ slots, onChange }: { slots: AvailabilitySlot[]; onChange: (s: AvailabilitySlot[]) => void }) {
  const [day, setDay] = useState(DAYS[0]);
  const [time, setTime] = useState(TIMES[2]);
  const add = () => {
    if (slots.some(s => `${s.day}:${s.time}` === `${day}:${time}`)) return;
    onChange([...slots, { day, time }]);
  };
  return (
    <div className="space-y-3">
      <div className="flex gap-2 flex-wrap">
        <Select value={day} onValueChange={setDay}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={time} onValueChange={setTime}>
          <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>{TIMES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={add}>+ Add</Button>
      </div>
      {slots.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {slots.map((s, i) => (
            <span key={i} className="flex items-center gap-1 bg-primary/10 text-primary text-xs px-2 py-1 rounded-full">
              {s.day} {s.time}
              <button onClick={() => onChange(slots.filter((_, j) => j !== i))} className="hover:text-destructive ml-0.5">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Profile Setup ──────────────────────────────────────────────────────────────

function ProfileSetupCard({ existing, onSaved }: { existing?: PracticeProfile | null; onSaved: () => void }) {
  const [instruments, setInstruments] = useState<string[]>(existing?.instruments ?? []);
  const [skillLevel, setSkillLevel] = useState(existing?.skillLevel ?? "intermediate");
  const [goals, setGoals] = useState<string[]>(existing?.goals ?? []);
  const [availabilitySlots, setAvailabilitySlots] = useState<AvailabilitySlot[]>(existing?.availabilitySlots ?? []);
  const [sessionFormat, setSessionFormat] = useState(existing?.sessionFormat ?? "either");
  const [bio, setBio] = useState(existing?.bio ?? "");
  const [saving, setSaving] = useState(false);

  const toggle = <T,>(arr: T[], val: T) => arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val];

  async function handleSave() {
    if (instruments.length === 0) { toast.error("Select at least one instrument"); return; }
    setSaving(true);
    try {
      const res = await apiFetch("/practice/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruments, skillLevel, goals, availabilitySlots, sessionFormat, bio: bio || null }),
      });
      if (!res.ok) throw new Error();
      toast.success("Practice profile saved!");
      onSaved();
    } catch { toast.error("Failed to save profile. Please try again."); }
    finally { setSaving(false); }
  }

  return (
    <Card className="max-w-2xl mx-auto border-border shadow-sm">
      <CardHeader>
        <CardTitle className="font-serif text-xl">{existing ? "Edit Practice Profile" : "Create Your Practice Profile"}</CardTitle>
        <p className="text-sm text-muted-foreground">Tell us about yourself so we can match you with compatible practice partners.</p>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-sm font-medium mb-2 block">Instruments <span className="text-destructive">*</span></Label>
          <div className="flex flex-wrap gap-2">
            {INSTRUMENTS.map(inst => (
              <button key={inst} onClick={() => setInstruments(toggle(instruments, inst))}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${instruments.includes(inst)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-foreground"}`}>{inst}</button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium mb-2 block">Skill Level</Label>
          <div className="flex gap-2 flex-wrap">
            {SKILL_LEVELS.map(s => (
              <button key={s.value} onClick={() => setSkillLevel(s.value)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${skillLevel === s.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary"}`}>{s.label}</button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium mb-2 block">Practice Goals</Label>
          <div className="flex flex-wrap gap-2">
            {GOALS.map(g => (
              <button key={g.value} onClick={() => setGoals(toggle(goals, g.value))}
                className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${goals.includes(g.value)
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary hover:text-foreground"}`}>{g.label}</button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium mb-2 block">Session Format</Label>
          <div className="flex gap-2">
            {SESSION_FORMATS.map(f => (
              <button key={f.value} onClick={() => setSessionFormat(f.value)}
                className={`px-4 py-2 rounded-lg text-sm border transition-colors ${sessionFormat === f.value
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:border-primary"}`}>
                {f.value === "video-call" && <Video className="inline h-3.5 w-3.5 mr-1" />}{f.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <Label className="text-sm font-medium mb-2 block">
            Weekly Availability <span className="text-muted-foreground font-normal">(helps find matching windows)</span>
          </Label>
          <AvailabilityEditor slots={availabilitySlots} onChange={setAvailabilitySlots} />
        </div>
        <div>
          <Label htmlFor="bio" className="text-sm font-medium mb-2 block">Short Bio (optional)</Label>
          <Textarea id="bio" placeholder="Tell potential partners about your musical background…"
            value={bio} onChange={e => setBio(e.target.value)} rows={3} className="resize-none" />
        </div>
        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Saving…" : "Save Profile & Find Partners"}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Partner match card ─────────────────────────────────────────────────────────

function PartnerCard({ profile, onRequest, requesting }: {
  profile: PracticeProfile; onRequest: (uid: string) => void; requesting: boolean;
}) {
  const name = [profile.user?.firstName, profile.user?.lastName].filter(Boolean).join(" ") || "Musician";
  return (
    <Card className="border-border shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-5">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-full bg-primary/10 overflow-hidden shrink-0 flex items-center justify-center">
            {profile.user?.profileImageUrl
              ? <img src={profile.user.profileImageUrl} alt={name} className="w-full h-full object-cover" />
              : <Music2 className="h-5 w-5 text-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <h3 className="font-semibold text-foreground truncate">{name}</h3>
              {profile.matchScore !== undefined && (
                <Badge variant="secondary" className="shrink-0 text-xs font-medium">{profile.matchScore}% match</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {profile.instruments.slice(0, 3).map(i => (
                <span key={i} className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full">{i}</span>
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
                {profile.goals.slice(0, 3).map(g => (
                  <span key={g} className="text-xs border border-border rounded px-1.5 py-0.5 text-muted-foreground capitalize">{g.replace("-", " ")}</span>
                ))}
              </div>
            )}
            {profile.matchReason && (
              <div className="flex items-start gap-1.5 mb-3 p-2 bg-amber-50 border border-amber-200 rounded-md">
                <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">Why you match: {profile.matchReason}</p>
              </div>
            )}
            {profile.bio && <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{profile.bio}</p>}
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

// ── Session Widget (per active partner) ────────────────────────────────────────

function PartnerSessionWidget({ partnershipId, partnerName }: { partnershipId: number; partnerName: string }) {
  const qc = useQueryClient();
  const { user } = useUser();
  const [showForm, setShowForm] = useState<"propose" | "counter" | null>(null);
  const [proposedAt, setProposedAt] = useState("");
  const [joinLink, setJoinLink] = useState("");
  const [joinLinkError, setJoinLinkError] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotesFor, setShowNotesFor] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const { data } = useQuery({
    queryKey: ["practice", "sessions", partnershipId],
    queryFn: async () => {
      const res = await apiFetch(`/practice/partnerships/${partnershipId}/sessions`);
      if (!res.ok) throw new Error();
      return res.json() as Promise<{ sessions: SessionData[] }>;
    },
  });

  const sessions = data?.sessions ?? [];
  const nextSession = sessions.find(s => s.status === "proposed" || s.status === "confirmed");
  const pastSessions = sessions.filter(s => s.status === "completed" || s.status === "cancelled");

  const validateLink = (v: string) => {
    if (!v) { setJoinLinkError(""); return true; }
    if (!isSafeUrl(v)) { setJoinLinkError("Must be a valid https:// or http:// URL"); return false; }
    setJoinLinkError(""); return true;
  };

  async function proposeSession(isCounter: boolean) {
    if (!proposedAt) { toast.error("Pick a date and time"); return; }
    if (joinLink && !validateLink(joinLink)) return;
    setSubmitting(true);
    try {
      const res = await apiFetch(`/practice/partnerships/${partnershipId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposedAt: new Date(proposedAt).toISOString(), joinLink: joinLink || undefined }),
      });
      if (!res.ok) throw new Error();
      toast.success(isCounter ? "Counter-proposal sent!" : "Session proposed!");
      setShowForm(null); setProposedAt(""); setJoinLink("");
      qc.invalidateQueries({ queryKey: ["practice", "sessions", partnershipId] });
      qc.invalidateQueries({ queryKey: ["practice", "notifications"] });
    } catch { toast.error("Failed to propose session"); }
    finally { setSubmitting(false); }
  }

  async function confirmSession(sessionId: number) {
    const res = await apiFetch(`/practice/sessions/${sessionId}/confirm`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}),
    });
    if (!res.ok) { toast.error("Failed to confirm"); return; }
    toast.success("Session confirmed!");
    qc.invalidateQueries({ queryKey: ["practice", "sessions", partnershipId] });
    qc.invalidateQueries({ queryKey: ["practice", "notifications"] });
  }

  async function markMyComplete(sessionId: number) {
    const res = await apiFetch(`/practice/sessions/${sessionId}/complete`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: notes || undefined }),
    });
    if (!res.ok) { toast.error("Failed to mark complete"); return; }
    const d = await res.json();
    toast.success(d.bothCompleted
      ? "Both partners marked done — session complete!"
      : "Marked done. Waiting for partner to confirm.");
    setShowNotesFor(null); setNotes("");
    qc.invalidateQueries({ queryKey: ["practice", "sessions", partnershipId] });
  }

  return (
    <div className="space-y-2">
      {/* Next / current session */}
      {nextSession && (
        <div className="rounded-md border border-border p-3 bg-muted/30 space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" />
            <span>{new Date(nextSession.proposedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
            {nextSession.status === "confirmed" && <Countdown date={nextSession.proposedAt} />}
            <Badge variant={nextSession.status === "confirmed" ? "default" : "secondary"} className="capitalize ml-auto text-xs">
              {nextSession.status === "proposed" && nextSession.proposedById === user?.id ? "Awaiting reply" : nextSession.status}
            </Badge>
          </div>

          {nextSession.status === "confirmed" && (
            <div className="flex gap-1.5">
              {nextSession.joinLink && (
                <a href={nextSession.joinLink} target="_blank" rel="noopener noreferrer" className="flex-1">
                  <Button size="sm" variant="outline" className="w-full h-7 text-xs">
                    <Video className="h-3 w-3 mr-1" /> Join Session
                  </Button>
                </a>
              )}
              <Button size="sm" variant="ghost" className="h-7 text-xs" title="Add to Calendar"
                onClick={() => downloadICS(`Practice Session with ${partnerName}`, new Date(nextSession.proposedAt))}>
                <Download className="h-3 w-3 mr-1" /> .ics
              </Button>
            </div>
          )}

          <div className="flex gap-1.5">
            {nextSession.status === "proposed" && nextSession.proposedById !== user?.id && (
              <>
                <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => confirmSession(nextSession.id)}>
                  <CheckCircle2 className="h-3 w-3 mr-1" /> Accept
                </Button>
                <Button size="sm" variant="ghost" className="flex-1 h-7 text-xs" onClick={() => setShowForm("counter")}>
                  <RefreshCw className="h-3 w-3 mr-1" /> Counter
                </Button>
              </>
            )}
            {nextSession.status === "confirmed" && !nextSession.myCompletion && showNotesFor !== nextSession.id && (
              <Button size="sm" variant="outline" className="flex-1 h-7 text-xs" onClick={() => setShowNotesFor(nextSession.id)}>
                <CheckCircle2 className="h-3 w-3 mr-1" /> Mark Done
              </Button>
            )}
            {nextSession.myCompletion && nextSession.status === "confirmed" && (
              <span className="text-xs text-green-600 flex items-center gap-1 flex-1">
                <CheckCircle2 className="h-3 w-3" /> You marked done
              </span>
            )}
          </div>

          {showNotesFor === nextSession.id && (
            <div className="space-y-1.5">
              <Textarea placeholder="Private notes (only you see these)…" value={notes}
                onChange={e => setNotes(e.target.value)} rows={2} className="text-xs resize-none" />
              <div className="flex gap-1.5">
                <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => markMyComplete(nextSession.id)}>Save</Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowNotesFor(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Propose / counter-propose form */}
      {showForm && (
        <div className="space-y-2 p-2 rounded-md border border-border bg-muted/20">
          <p className="text-xs font-medium text-foreground">{showForm === "counter" ? "Suggest a different time" : "Propose a session"}</p>
          <Input type="datetime-local" value={proposedAt} onChange={e => setProposedAt(e.target.value)} className="text-xs h-8" />
          <div>
            <Input placeholder="Zoom / Meet link (https://…)" value={joinLink}
              onChange={e => { setJoinLink(e.target.value); if (e.target.value) validateLink(e.target.value); else setJoinLinkError(""); }}
              className="text-xs h-8" />
            {joinLinkError && <p className="text-xs text-destructive mt-0.5">{joinLinkError}</p>}
          </div>
          <div className="flex gap-1.5">
            <Button size="sm" className="flex-1 h-7 text-xs" onClick={() => proposeSession(showForm === "counter")} disabled={submitting}>
              {submitting ? "…" : showForm === "counter" ? "Send Counter" : "Propose"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(null)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Schedule button when no upcoming session */}
      {!showForm && !nextSession && (
        <Button size="sm" variant="outline" className="w-full h-7 text-xs" onClick={() => setShowForm("propose")}>
          <Calendar className="h-3 w-3 mr-1" /> Schedule Session
        </Button>
      )}
      {!showForm && nextSession?.status === "proposed" && nextSession.proposedById === user?.id && (
        <p className="text-xs text-muted-foreground text-center">Waiting for partner to respond…</p>
      )}

      {/* Past sessions log */}
      {pastSessions.length > 0 && (
        <button className="w-full flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
          onClick={() => setShowHistory(h => !h)}>
          <History className="h-3 w-3" /> {showHistory ? "Hide" : "Show"} session history ({pastSessions.length})
        </button>
      )}
      {showHistory && pastSessions.length > 0 && (
        <div className="space-y-1 border border-border rounded-md p-2 bg-muted/10">
          {pastSessions.map(s => (
            <div key={s.id} className="flex items-center gap-2 text-xs text-muted-foreground">
              {s.status === "completed"
                ? <CheckCircle2 className="h-3 w-3 text-green-500 shrink-0" />
                : <X className="h-3 w-3 text-red-400 shrink-0" />}
              <span className="flex-1">{new Date(s.proposedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
              <span className="capitalize">{s.status}</span>
              {s.status === "completed" && s.myCompletion?.notes && (
                <span title={s.myCompletion.notes} className="truncate max-w-24 italic opacity-70">{s.myCompletion.notes}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Partnerships Section ────────────────────────────────────────────────────────

function PartnershipsSection() {
  const qc = useQueryClient();
  const [dissolveConfirm, setDissolveConfirm] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["practice", "partnerships"],
    queryFn: async () => {
      const res = await apiFetch("/practice/partnerships");
      if (!res.ok) throw new Error("Failed to load partnerships");
      return res.json() as Promise<{ partnerships: Partnership[] }>;
    },
  });

  const acceptMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/practice/partnerships/${id}/accept`, { method: "POST" });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["practice"] }); toast.success("Partnership accepted!"); },
    onError: () => toast.error("Failed to accept request"),
  });

  const declineMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/practice/partnerships/${id}/decline`, { method: "POST" });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["practice"] }); toast.success("Request declined."); },
    onError: () => toast.error("Failed to decline"),
  });

  const dissolveMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiFetch(`/practice/partnerships/${id}/dissolve`, { method: "POST" });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["practice"] });
      setDissolveConfirm(null);
      toast.success("Partnership dissolved.");
    },
    onError: () => toast.error("Failed to dissolve"),
  });

  if (isLoading) return <div className="text-center text-muted-foreground py-6 text-sm">Loading partnerships…</div>;

  const partnerships = data?.partnerships ?? [];
  const pending = partnerships.filter(p => p.status === "pending" && !p.isRequester);
  const active = partnerships.filter(p => p.status === "active");
  const sent = partnerships.filter(p => p.status === "pending" && p.isRequester);

  if (partnerships.length === 0) return null;

  return (
    <div className="space-y-6 mb-10">
      {/* Incoming requests */}
      {pending.length > 0 && (
        <div>
          <h2 className="text-lg font-serif font-semibold text-foreground mb-3 flex items-center gap-2">
            Incoming Requests
            <span className="h-5 w-5 text-xs font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center">
              {pending.length}
            </span>
          </h2>
          <div className="space-y-3">
            {pending.map(p => (
              <Card key={p.id} className="border-primary/30 bg-primary/5 shadow-sm">
                <CardContent className="p-4 flex items-center gap-4">
                  <AvatarIcon partner={p.partner} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground">{avatarName(p.partner)} wants to practice with you</p>
                    <p className="text-xs text-muted-foreground capitalize">{p.partnerProfile?.instruments?.join(", ") || "—"} · {p.partnerProfile?.skillLevel}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button size="sm" onClick={() => acceptMut.mutate(p.id)} disabled={acceptMut.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => declineMut.mutate(p.id)} disabled={declineMut.isPending}>
                      <X className="h-3.5 w-3.5 mr-1" /> Decline
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Active partners */}
      {active.length > 0 && (
        <div>
          <h2 className="text-lg font-serif font-semibold text-foreground mb-3">Active Partners</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {active.map(p => {
              const name = avatarName(p.partner);
              const isDissolving = dissolveConfirm === p.id;
              return (
                <Card key={p.id} className="border-border shadow-sm">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <AvatarIcon partner={p.partner} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-foreground truncate">{name}</p>
                        <p className="text-xs text-muted-foreground capitalize">{p.partnerProfile?.instruments?.slice(0, 2).join(", ")}</p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
                        {!isDissolving && (
                          <button title="Dissolve partnership" onClick={() => setDissolveConfirm(p.id)}
                            className="text-muted-foreground hover:text-destructive p-1 rounded transition-colors">
                            <UserMinus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Dissolve confirmation */}
                    {isDissolving && (
                      <div className="mb-3 p-2 bg-destructive/5 border border-destructive/20 rounded-md text-xs text-destructive space-y-2">
                        <p className="font-medium">End this partnership?</p>
                        <div className="flex gap-1.5">
                          <Button size="sm" variant="destructive" className="flex-1 h-7 text-xs"
                            onClick={() => dissolveMut.mutate(p.id)} disabled={dissolveMut.isPending}>
                            Yes, end it
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setDissolveConfirm(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}

                    <PartnerSessionWidget partnershipId={p.id} partnerName={name} />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Sent requests */}
      {sent.length > 0 && (
        <div>
          <h2 className="text-lg font-serif font-semibold text-foreground mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" /> Pending Requests Sent
          </h2>
          <div className="space-y-2">
            {sent.map(p => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border text-sm">
                <div className="h-8 w-8 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
                  {p.partner?.profileImageUrl
                    ? <img src={p.partner.profileImageUrl} alt={avatarName(p.partner)} className="w-full h-full object-cover" />
                    : <Music2 className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
                <span className="flex-1 text-foreground">{avatarName(p.partner)}</span>
                <Badge variant="secondary">Awaiting response</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Notification badge hook ────────────────────────────────────────────────────

export function usePracticeNotifications() {
  const { isSignedIn } = useUser();
  return useQuery({
    queryKey: ["practice", "notifications"],
    queryFn: async () => {
      const res = await apiFetch("/practice/notifications");
      if (!res.ok) return { incomingRequests: 0, pendingSessionsAwaitingMe: 0, total: 0 };
      return res.json() as Promise<{ incomingRequests: number; pendingSessionsAwaitingMe: number; total: number }>;
    },
    enabled: !!isSignedIn,
    refetchInterval: 30_000,
  });
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function PracticePartners() {
  const { isSignedIn } = useUser();
  const qc = useQueryClient();
  const [editingProfile, setEditingProfile] = useState(false);
  const [filterInstrument, setFilterInstrument] = useState("");
  const [filterFormat, setFilterFormat] = useState("all");
  const [requesting, setRequesting] = useState<string | null>(null);

  const { data: notifData } = usePracticeNotifications();
  const totalBadge = notifData?.total ?? 0;

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

  const filteredMatches = useMemo(() => {
    let m = matchData?.matches ?? [];
    if (filterInstrument.trim()) {
      const q = filterInstrument.trim().toLowerCase();
      m = m.filter(p => p.instruments.some(i => i.toLowerCase().includes(q)));
    }
    if (filterFormat && filterFormat !== "all") {
      m = m.filter(p => p.sessionFormat === filterFormat || p.sessionFormat === "either");
    }
    return m;
  }, [matchData?.matches, filterInstrument, filterFormat]);

  async function sendRequest(recipientId: string) {
    setRequesting(recipientId);
    try {
      const res = await apiFetch(`/practice/request/${recipientId}`, { method: "POST" });
      if (res.status === 409) { toast.error("A request already exists with this musician"); return; }
      if (!res.ok) throw new Error();
      toast.success("Practice request sent!");
      qc.invalidateQueries({ queryKey: ["practice", "matches"] });
      qc.invalidateQueries({ queryKey: ["practice", "partnerships"] });
    } catch { toast.error("Failed to send request"); }
    finally { setRequesting(null); }
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
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl font-serif font-bold text-foreground">Practice Partner Matching</h1>
                {totalBadge > 0 && (
                  <span className="h-6 min-w-6 px-1.5 text-xs font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center">
                    {totalBadge}
                  </span>
                )}
              </div>
              <p className="text-muted-foreground">Find compatible musicians for regular practice sessions based on instrument, skill level, and goals.</p>
            </div>
            {profileData && !editingProfile && (
              <div className="flex gap-2 shrink-0 mt-1">
                <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> Profile Active</Badge>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingProfile(true)}>Edit</Button>
              </div>
            )}
          </div>

          {profileLoading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
            </div>
          ) : !profileData || editingProfile ? (
            <ProfileSetupCard
              existing={editingProfile ? profileData : null}
              onSaved={() => { refetchProfile(); setEditingProfile(false); qc.invalidateQueries({ queryKey: ["practice", "matches"] }); }}
            />
          ) : (
            <>
              <PartnershipsSection />

              {/* Filter bar */}
              <div className="flex items-center gap-3 mb-4">
                <h2 className="text-xl font-serif font-semibold text-foreground mr-auto">Suggested Partners</h2>
                {matchData?.isPremium && (
                  <div className="flex items-center gap-1.5 text-amber-600 text-sm font-medium">
                    <Sparkles className="h-4 w-4" /> AI Matched
                  </div>
                )}
              </div>
              <div className="flex gap-2 mb-6 flex-wrap">
                <div className="relative flex-1 min-w-40">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                  <Input placeholder="Filter by instrument…" value={filterInstrument}
                    onChange={e => setFilterInstrument(e.target.value)} className="pl-9 h-9 text-sm" />
                </div>
                <Select value={filterFormat} onValueChange={setFilterFormat}>
                  <SelectTrigger className="w-40 h-9 text-sm"><SelectValue placeholder="Session format" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any format</SelectItem>
                    <SelectItem value="video-call">Video Call</SelectItem>
                    <SelectItem value="in-person">In Person</SelectItem>
                    <SelectItem value="either">Flexible</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {matchLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {[1, 2, 3, 4].map(i => <div key={i} className="h-48 bg-muted rounded-xl animate-pulse" />)}
                </div>
              ) : filteredMatches.length === 0 ? (
                <div className="text-center py-16 border border-dashed border-border rounded-xl">
                  <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <h3 className="text-lg font-medium text-foreground mb-2">No matches found</h3>
                  <p className="text-sm text-muted-foreground">
                    {filterInstrument || filterFormat !== "all"
                      ? "Try adjusting your filters."
                      : "As more musicians join, compatible partners will appear here."}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {filteredMatches.map(profile => (
                    <PartnerCard key={profile.userId} profile={profile}
                      onRequest={sendRequest} requesting={requesting === profile.userId} />
                  ))}
                </div>
              )}

              {!matchData?.isPremium && (
                <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5 flex items-start gap-4">
                  <Sparkles className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="font-semibold text-amber-900 mb-1">Unlock AI-Powered Matching</h3>
                    <p className="text-sm text-amber-800 mb-3">Business Suite subscribers get personalized "Why we matched" explanations and priority rankings.</p>
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
