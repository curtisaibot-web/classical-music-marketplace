import { Link } from "wouter";
import { useRef, useState, useCallback, useEffect } from "react";
import { useGetTeacherDashboard, useGetConnectStatus, useCreateConnectOnboarding, useGetMyReel, useGetMyTeacherProfile, useUploadReel, getGetMyReelQueryKey, useListMyAuditionPrograms, useListTeacherEnrollments } from "@workspace/api-client-react";
import type { AuditionProgram } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, DollarSign, Users, Star, Music, ExternalLink, CreditCard, AlertCircle, CheckCircle2, Film, Upload, RefreshCw, ChevronDown, ChevronUp, Share2, Briefcase, Link2, Clock, MessageSquare } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";

const _TEACHER_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
function _teacherApiFetch(path: string) {
  return fetch(`${_TEACHER_BASE}/api${path}`, { credentials: "include" });
}

type TeacherDashPartnership = {
  id: number; status: string; isRequester: boolean;
  partner: { firstName: string | null; lastName: string | null } | null;
  partnerProfile: { instruments: string[]; skillLevel: string } | null;
};

function useTeacherPartnerSessions(partnershipId: number) {
  return useQuery({
    queryKey: ["practice", "sessions", partnershipId],
    queryFn: async () => {
      const res = await _teacherApiFetch(`/practice/partnerships/${partnershipId}/sessions`);
      if (!res.ok) return null;
      return res.json() as Promise<{ sessions: Array<{ id: number; status: string; proposedAt: string; proposedById: string }> }>;
    },
  });
}

function TeacherActivePartnerRow({ partnership }: { partnership: TeacherDashPartnership }) {
  const { data } = useTeacherPartnerSessions(partnership.id);
  const sessions = data?.sessions ?? [];
  const next = sessions.find(s => s.status === "proposed" || s.status === "confirmed");
  const past = sessions.filter(s => s.status === "completed").length;
  const name = [partnership.partner?.firstName, partnership.partner?.lastName].filter(Boolean).join(" ") || "Musician";

  return (
    <div className="p-2 rounded-lg border border-border bg-muted/20 space-y-1">
      <div className="flex items-center gap-2 text-sm">
        <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
          <Users className="h-3 w-3 text-primary" />
        </div>
        <span className="text-foreground flex-1 truncate font-medium">{name}</span>
        <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">Active</Badge>
      </div>
      {next ? (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-8">
          <Calendar className="h-3 w-3 shrink-0" />
          <span className="capitalize">{next.status}:</span>
          <span>{new Date(next.proposedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground pl-8 flex items-center gap-1.5">
          <Clock className="h-3 w-3 shrink-0" />
          <Link href="/practice-partners" className="text-primary hover:underline">Schedule a session</Link>
        </div>
      )}
      {past > 0 && (
        <p className="text-xs text-muted-foreground pl-8">{past} session{past !== 1 ? "s" : ""} completed</p>
      )}
    </div>
  );
}

function PracticePartnersCard() {
  const { data } = useQuery({
    queryKey: ["practice", "partnerships"],
    queryFn: async () => {
      const res = await _teacherApiFetch("/practice/partnerships");
      if (!res.ok) return null;
      return res.json() as Promise<{ partnerships: TeacherDashPartnership[] }>;
    },
  });
  const { data: profileData } = useQuery({
    queryKey: ["practice", "profile", "me"],
    queryFn: async () => {
      const res = await _teacherApiFetch("/practice/profile/me");
      if (res.status === 404) return null;
      if (!res.ok) return null;
      return res.json();
    },
  });
  const { data: notifData } = useQuery({
    queryKey: ["practice", "notifications"],
    queryFn: async () => {
      const res = await _teacherApiFetch("/practice/notifications");
      if (!res.ok) return null;
      return res.json() as Promise<{ total: number; recentNotifications: Array<{ id: number; message: string; type: string; isRead: boolean }> }>;
    },
    refetchInterval: 30_000,
  });

  const partnerships = data?.partnerships ?? [];
  const pending = partnerships.filter(p => p.status === "pending" && !p.isRequester);
  const active = partnerships.filter(p => p.status === "active");
  const unreadNotifs = notifData?.recentNotifications?.filter(n => !n.isRead) ?? [];

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="font-serif text-lg">Practice Partners</CardTitle>
          {(notifData?.total ?? 0) > 0 && (
            <span className="h-5 w-5 text-xs font-bold bg-primary text-primary-foreground rounded-full flex items-center justify-center">
              {notifData!.total}
            </span>
          )}
        </div>
        <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
          <Link href="/practice-partners">View all</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* In-app notifications */}
        {unreadNotifs.slice(0, 2).map(n => (
          <div key={n.id} className="flex items-start gap-2 p-2 bg-primary/5 border border-primary/20 rounded-lg text-xs">
            <MessageSquare className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            <span className="text-foreground">{n.message}</span>
          </div>
        ))}

        {/* Incoming requests */}
        {pending.length > 0 && (
          <div className="flex items-center gap-2 p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm">
            <Users className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium text-foreground">{pending.length} incoming {pending.length === 1 ? "request" : "requests"}</span>
            <Button size="sm" asChild className="ml-auto h-7 text-xs">
              <Link href="/practice-partners">Review</Link>
            </Button>
          </div>
        )}

        {/* Active partners with next session info + past count */}
        {active.length > 0 ? (
          <div className="space-y-2">
            {active.slice(0, 3).map(p => <TeacherActivePartnerRow key={p.id} partnership={p} />)}
          </div>
        ) : !profileData ? (
          <p className="text-sm text-muted-foreground">Practice with other musicians to sharpen your skills and repertoire.</p>
        ) : (
          <p className="text-sm text-muted-foreground">No active partners yet. Browse matches to find compatible musicians.</p>
        )}

        <Button size="sm" variant={active.length > 0 || profileData ? "outline" : "default"} className="w-full" asChild>
          <Link href="/practice-partners">{profileData ? "Find Partners" : "Get Started"}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

const REEL_STATUS_LABELS: Record<string, string> = {
  uploading: "Uploading…",
  queued: "Queued — waiting to process",
  processing: "Processing — AI is editing your reel",
  ready: "Ready",
  failed: "Processing failed",
};

const REEL_STATUS_COLORS: Record<string, string> = {
  uploading: "bg-blue-50 border-blue-200 text-blue-700",
  queued: "bg-amber-50 border-amber-200 text-amber-700",
  processing: "bg-purple-50 border-purple-200 text-purple-700",
  ready: "bg-green-50 border-green-200 text-green-700",
  failed: "bg-red-50 border-red-200 text-red-700",
};

const TIPS = [
  "Film horizontally (landscape) — vertical video can't be properly edited.",
  "Find a quiet room; close windows and doors before recording.",
  "Natural light from a window in front of you gives the best result.",
  "Keep the mic 1–2 metres from the instrument for a balanced sound.",
  "Record a continuous 2–3 minute take — don't stop and restart.",
  "Warm up before recording so your best playing is captured.",
];

function BookingReelCard() {
  const { data: reel, isLoading: isLoadingReel, refetch } = useGetMyReel({
    query: {
      queryKey: getGetMyReelQueryKey(),
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        const inProgress = status === "uploading" || status === "queued" || status === "processing";
        return inProgress ? 10_000 : false;
      },
    },
  });
  const uploadReel = useUploadReel();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showTips, setShowTips] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isMuted, setIsMuted] = useState(true);

  const handleFileSelect = useCallback(async (file: File) => {
    if (!file) return;
    const maxBytes = (Number(import.meta.env.VITE_REEL_MAX_MB ?? 500)) * 1024 * 1024;
    if (file.size > maxBytes) {
      toast.error(`File too large. Maximum size is ${import.meta.env.VITE_REEL_MAX_MB ?? 500} MB.`);
      return;
    }
    setUploading(true);
    try {
      await uploadReel.mutateAsync({ data: { file, genre: "", instruments: "" } });
      toast.success("Video uploaded! Your reel is now queued for AI processing.");
      refetch();
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }, [uploadReel, refetch]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileSelect(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const isProcessing = reel?.status === "queued" || reel?.status === "processing" || reel?.status === "uploading";
  const isReady = reel?.status === "ready";
  const isFailed = reel?.status === "failed";

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center gap-3">
        <Film className="h-5 w-5 text-primary" />
        <CardTitle className="font-serif">Booking Reel</CardTitle>
        {isProcessing && (
          <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin ml-auto" />
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoadingReel ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-32 bg-muted rounded" />
          </div>
        ) : isReady && reel?.processedFileUrl ? (
          <>
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border ${REEL_STATUS_COLORS.ready}`}>
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span className="font-medium">Your booking reel is live</span>
            </div>
            <div className="relative rounded-lg overflow-hidden bg-black aspect-video">
              <video
                src={reel.processedFileUrl}
                autoPlay
                muted={isMuted}
                loop
                playsInline
                className="w-full h-full object-cover"
              />
              <button
                onClick={() => setIsMuted((m) => !m)}
                className="absolute bottom-3 right-3 bg-black/60 text-white rounded-full px-3 py-1 text-xs font-medium hover:bg-black/80 transition"
              >
                {isMuted ? "Unmute" : "Mute"}
              </button>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Replace Reel
            </Button>
            <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={handleInputChange} />
          </>
        ) : isProcessing ? (
          <>
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border ${REEL_STATUS_COLORS[reel?.status ?? "queued"]}`}>
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
              <span className="font-medium">{REEL_STATUS_LABELS[reel?.status ?? "queued"]}</span>
            </div>
            <p className="text-xs text-muted-foreground">Processing typically takes 5–15 minutes. This page will update when your reel is ready.</p>
            <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => refetch()}>
              <RefreshCw className="h-3 w-3 mr-1.5" /> Check status
            </Button>
          </>
        ) : isFailed ? (
          <>
            <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 border ${REEL_STATUS_COLORS.failed}`}>
              <AlertCircle className="h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Processing failed</p>
                {reel?.errorMessage && <p className="text-xs mt-0.5 opacity-80">{reel.errorMessage}</p>}
              </div>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="h-4 w-4 mr-2" />
              Try Again
            </Button>
            <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={handleInputChange} />
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Film yourself performing for 2–3 minutes in good light — we handle the rest. Our AI will clean your audio, grade the colour, and produce a polished 60–90 second reel.
            </p>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/30"}`}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2">
                  <RefreshCw className="h-8 w-8 text-primary animate-spin" />
                  <p className="text-sm font-medium text-foreground">Uploading your video…</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium text-foreground">Drop your video here or click to browse</p>
                  <p className="text-xs text-muted-foreground">MP4 or MOV · up to 500 MB</p>
                </div>
              )}
            </div>
            <input ref={fileInputRef} type="file" accept="video/mp4,video/quicktime,.mp4,.mov" className="hidden" onChange={handleInputChange} />
          </>
        )}

        {/* Tips collapsible */}
        <button
          onClick={() => setShowTips((t) => !t)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full text-left"
        >
          {showTips ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          How to get the best result
        </button>
        {showTips && (
          <ul className="space-y-1.5 text-xs text-muted-foreground pl-4 border-l-2 border-primary/20">
            {TIPS.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

interface ComposerScore {
  id: number;
  title: string;
  salesCount: number;
  revenueCents: number;
  licenses: Array<{ licenseType: string; priceCents: number }>;
}

function ComposerRoyaltyCard() {
  const [royalties, setRoyalties] = useState<{
    totalRevenueCents: number;
    totalSales: number;
    byLicenseType: Array<{ licenseType: string; totalCents: number; count: number }>;
    monthlyTrend: Array<{ month: string; totalCents: number; count: number }>;
  } | null>(null);
  const [myScores, setMyScores] = useState<ComposerScore[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const apiBase = import.meta.env.VITE_API_URL ?? "";

  useEffect(() => {
    if (hasLoaded) return;
    setIsLoading(true);
    Promise.all([
      fetch(`${apiBase}/api/composers/royalties`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
      fetch(`${apiBase}/api/scores/mine`, { credentials: "include" }).then((r) => r.ok ? r.json() : null),
    ])
      .then(([royaltyData, scoresData]) => {
        if (royaltyData) setRoyalties(royaltyData as typeof royalties);
        if (scoresData) setMyScores((scoresData as { scores: ComposerScore[] }).scores);
      })
      .catch(() => null)
      .finally(() => { setIsLoading(false); setHasLoaded(true); });
  }, [apiBase, hasLoaded]);

  const LICENSE_LABELS: Record<string, string> = {
    personal: "Personal",
    performance: "Performance",
    sync: "Sync",
  };

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Music className="h-4 w-4 text-primary" />
          Composer Royalties
        </CardTitle>
        <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
          <Link href="/my-scores">Manage</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="animate-pulse space-y-2">
            <div className="h-16 bg-muted rounded" />
            <div className="h-8 bg-muted rounded" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xl font-bold text-foreground">${((royalties?.totalRevenueCents ?? 0) / 100).toFixed(2)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Revenue</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xl font-bold text-foreground">{royalties?.totalSales ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Licenses Sold</p>
              </div>
            </div>

            {(royalties?.monthlyTrend ?? []).length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Monthly Revenue (6 mo.)</p>
                <div className="flex items-end gap-1 h-14">
                  {royalties!.monthlyTrend.map((m) => {
                    const maxCents = Math.max(...royalties!.monthlyTrend.map((x) => x.totalCents), 1);
                    const pct = Math.max((m.totalCents / maxCents) * 100, 4);
                    const label = m.month.slice(5);
                    return (
                      <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end" title={`${m.month}: $${(m.totalCents / 100).toFixed(0)}`}>
                        <div className="w-full rounded-sm bg-primary/50 transition-all" style={{ height: `${pct}%` }} />
                        <p className="text-[9px] text-muted-foreground leading-none">{label}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {(royalties?.byLicenseType ?? []).length > 0 && (
              <div className="space-y-1.5">
                {royalties!.byLicenseType.map((lt) => (
                  <div key={lt.licenseType} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{LICENSE_LABELS[lt.licenseType] ?? lt.licenseType}</span>
                    <span className="font-medium">${(lt.totalCents / 100).toFixed(2)} ({lt.count} sold)</span>
                  </div>
                ))}
              </div>
            )}

            {myScores.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Scores</p>
                {myScores.slice(0, 3).map((s) => (
                  <div key={s.id} className="flex justify-between text-sm items-center">
                    <span className="text-muted-foreground truncate max-w-[150px]">{s.title}</span>
                    <span className="font-medium shrink-0">{s.salesCount} sales · ${(s.revenueCents / 100).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                List your original compositions and earn royalties from personal, performance, and sync licenses.
              </p>
            )}
            <Button size="sm" className="w-full" asChild>
              <Link href="/my-scores">{myScores.length === 0 ? "List Your First Score" : "Manage My Scores"}</Link>
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function AuditionPrepCard() {
  const { data: programsData } = useListMyAuditionPrograms();
  const { data: enrollmentsData } = useListTeacherEnrollments();

  const programs = programsData?.programs ?? [];
  const activePrograms = (programs as AuditionProgram[]).filter((p) => p.isActive);
  const enrollments = (enrollmentsData?.enrollments ?? []) as Array<{ status: string; sessionsCompleted: number; program?: { sessionCount: number; title: string } | null }>;
  const activeEnrollments = enrollments.filter((e) => e.status === "active");
  const completedEnrollments = enrollments.filter((e) => e.status === "completed");

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-serif text-lg">Audition Prep Programs</CardTitle>
        <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
          <Link href="/audition-programs">Manage</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xl font-bold text-foreground">{activePrograms.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Active Programs</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xl font-bold text-foreground">{activeEnrollments.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">In Progress</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-3">
            <p className="text-xl font-bold text-foreground">{completedEnrollments.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Completed</p>
          </div>
        </div>
        {activeEnrollments.length > 0 && (
          <div className="space-y-2">
            {activeEnrollments.slice(0, 3).map((e, i) => {
              const total = e.program?.sessionCount ?? 1;
              const done = e.sessionsCompleted ?? 0;
              const pct = Math.round((done / total) * 100);
              return (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span className="truncate max-w-[160px]">{e.program?.title ?? "Program"}</span>
                    <span>{done}/{total} sessions</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
        {programs.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Create structured multi-session coaching packages for conservatory and orchestra auditions.
          </p>
        )}
        <Button size="sm" className="w-full" asChild>
          <Link href="/audition-programs">{activePrograms.length === 0 ? "Create First Program" : "Manage Programs"}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

type CoachingBooking = {
  id: number;
  studentId: string;
  scheduledAt: string | null;
  priceInCents: number;
  status: string;
  meetingUrl: string | null;
  student: { firstName: string | null; lastName: string | null } | null;
};

function CoachingCard() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const apiBase = basePath.replace(/\/[^/]*$/, "");
  const [bookings, setBookings] = useState<CoachingBooking[]>([]);
  const [isCoach, setIsCoach] = useState<boolean | null>(null);
  const [editingUrl, setEditingUrl] = useState<Record<number, string>>({});
  const [savingUrl, setSavingUrl] = useState<number | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ title: "", sessionType: "general", priceInCents: "", durationMinutes: "60" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetch(`${apiBase}/api/coaches/me`, { credentials: "include" })
      .then(async (r) => {
        if (r.status === 404) { setIsCoach(false); return; }
        if (!r.ok) { setIsCoach(false); return; }
        const data = await r.json() as { approvalStatus: string };
        setIsCoach(data.approvalStatus === "approved");
      })
      .catch(() => setIsCoach(false));

    fetch(`${apiBase}/api/coaches/me/bookings`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json() as { bookings: CoachingBooking[] };
        setBookings(data.bookings);
      })
      .catch(() => {});
  }, [apiBase]);

  const handleCreateListing = async () => {
    if (!createForm.title || !createForm.priceInCents) return;
    setCreating(true);
    try {
      const r = await fetch(`${apiBase}/api/coaches/me/listings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createForm.title,
          sessionType: createForm.sessionType,
          priceInCents: Math.round(Number(createForm.priceInCents) * 100),
          durationMinutes: Number(createForm.durationMinutes),
        }),
      });
      if (!r.ok) throw new Error("Failed");
      toast.success("Session listing created");
      setShowCreateForm(false);
      setCreateForm({ title: "", sessionType: "general", priceInCents: "", durationMinutes: "60" });
    } catch {
      toast.error("Failed to create listing");
    } finally {
      setCreating(false);
    }
  };

  const handleSaveUrl = async (bookingId: number) => {
    const url = editingUrl[bookingId];
    if (!url) return;
    setSavingUrl(bookingId);
    try {
      const r = await fetch(`${apiBase}/api/coaches/me/bookings/${bookingId}/meeting-url`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingUrl: url }),
      });
      if (!r.ok) throw new Error("Failed to save");
      setBookings((prev) => prev.map((b) => b.id === bookingId ? { ...b, meetingUrl: url } : b));
      setEditingUrl((prev) => { const n = { ...prev }; delete n[bookingId]; return n; });
      toast.success("Meeting link saved");
    } catch {
      toast.error("Failed to save meeting link");
    } finally {
      setSavingUrl(null);
    }
  };

  if (isCoach === null) return null;

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="font-serif text-lg flex items-center gap-2">
          <Briefcase className="h-5 w-5 text-primary" />
          Career Coaching
        </CardTitle>
        <div className="flex items-center gap-2">
          {isCoach && (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowCreateForm(v => !v)}>
              {showCreateForm ? "Cancel" : "+ Add Session"}
            </Button>
          )}
          <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
            <Link href="/coaching/apply">
              {isCoach ? "My Profile" : "Apply"}
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isCoach && showCreateForm && (
          <div className="rounded-lg border border-border p-3 space-y-2 bg-muted/30">
            <p className="text-xs font-medium text-foreground">New coaching session listing</p>
            <input
              className="w-full text-xs px-2 py-1.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
              placeholder="Session title (e.g. Audition Strategy)"
              value={createForm.title}
              onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))}
            />
            <div className="flex gap-2">
              <select
                className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-background focus:outline-none"
                value={createForm.sessionType}
                onChange={e => setCreateForm(f => ({ ...f, sessionType: e.target.value }))}
              >
                <option value="general">General Career</option>
                <option value="audition">Audition Prep</option>
                <option value="career_development">Career Development</option>
                <option value="music_business">Music Business</option>
                <option value="artist_management">Artist Management</option>
              </select>
              <select
                className="w-24 text-xs px-2 py-1.5 rounded border border-border bg-background focus:outline-none"
                value={createForm.durationMinutes}
                onChange={e => setCreateForm(f => ({ ...f, durationMinutes: e.target.value }))}
              >
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
                <option value="90">90 min</option>
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground">$</span>
              <input
                type="number"
                min="1"
                className="flex-1 text-xs px-2 py-1.5 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Price (USD)"
                value={createForm.priceInCents}
                onChange={e => setCreateForm(f => ({ ...f, priceInCents: e.target.value }))}
              />
              <Button size="sm" className="h-7 text-xs" onClick={handleCreateListing} disabled={creating || !createForm.title || !createForm.priceInCents}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        )}
        {!isCoach ? (
          <>
            <p className="text-sm text-muted-foreground">
              Share your industry expertise as a career coach. Help musicians navigate auditions, management, and the music business.
            </p>
            <Button size="sm" className="w-full" asChild>
              <Link href="/coaching/apply">Apply to Coach</Link>
            </Button>
          </>
        ) : bookings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No coaching sessions booked yet.</p>
        ) : (
          <div className="space-y-3">
            {(() => {
              const paidBookings = bookings.filter(b => b.status === "confirmed" || b.status === "completed");
              if (paidBookings.length > 0) {
                const grossCents = paidBookings.reduce((s, b) => s + b.priceInCents, 0);
                const feeCents = Math.round(grossCents * 0.20);
                const netCents = grossCents - feeCents;
                return (
                  <div className="rounded-lg bg-muted/50 border border-border px-3 py-2 text-xs space-y-1">
                    <p className="font-medium text-foreground">Earnings summary</p>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Gross ({paidBookings.length} session{paidBookings.length !== 1 ? "s" : ""})</span>
                      <span>${(grossCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Platform fee (20%)</span>
                      <span>−${(feeCents / 100).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-semibold text-foreground border-t border-border pt-1">
                      <span>Your earnings</span>
                      <span>${(netCents / 100).toFixed(2)}</span>
                    </div>
                  </div>
                );
              }
              return null;
            })()}
            {bookings.slice(0, 5).map((b) => {
              const studentName = b.student ? `${b.student.firstName ?? ""} ${b.student.lastName ?? ""}`.trim() : "Student";
              const isEditing = (bookingId: number) => editingUrl[bookingId] !== undefined;
              return (
                <div key={b.id} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">{studentName}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" />
                        {b.scheduledAt ? format(new Date(b.scheduledAt), "MMM d, yyyy") : "Date TBD"}
                        <span className="text-border mx-0.5">·</span>
                        ${(b.priceInCents / 100).toFixed(0)}
                      </p>
                    </div>
                    <Badge variant={b.status === "confirmed" ? "default" : "secondary"} className="text-xs shrink-0">
                      {b.status}
                    </Badge>
                  </div>
                  {b.status === "confirmed" && (
                    <div className="flex gap-2">
                      {isEditing(b.id) ? (
                        <>
                          <input
                            type="url"
                            className="flex-1 text-xs px-2 py-1 rounded border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                            placeholder="https://zoom.us/j/..."
                            value={editingUrl[b.id]}
                            onChange={(e) => setEditingUrl((prev) => ({ ...prev, [b.id]: e.target.value }))}
                          />
                          <Button size="sm" className="h-7 text-xs" onClick={() => handleSaveUrl(b.id)} disabled={savingUrl === b.id}>
                            {savingUrl === b.id ? "Saving…" : "Save"}
                          </Button>
                        </>
                      ) : (
                        <button
                          className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                          onClick={() => setEditingUrl((prev) => ({ ...prev, [b.id]: b.meetingUrl ?? "" }))}
                        >
                          <Link2 className="h-3 w-3" />
                          {b.meetingUrl ? "Edit meeting link" : "Add Zoom/Meet link"}
                        </button>
                      )}
                    </div>
                  )}
                  {b.meetingUrl && !isEditing(b.id) && (
                    <a href={b.meetingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 truncate">
                      <Link2 className="h-3 w-3 shrink-0" />
                      <span className="truncate">{b.meetingUrl}</span>
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TeacherDashboard() {
  const { data: dashboard, isLoading } = useGetTeacherDashboard();
  const { data: connectStatus } = useGetConnectStatus();
  const { data: myProfile } = useGetMyTeacherProfile();
  const createOnboarding = useCreateConnectOnboarding();

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const handleShareProfile = () => {
    const slug = myProfile?.profileSlug;
    if (!slug) {
      toast.error("Set a public URL handle in your profile settings first.");
      return;
    }
    const url = `${window.location.origin}${basePath}/musicians/${slug}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success("Profile link copied to clipboard!");
    }).catch(() => {
      toast.error("Could not copy to clipboard. Your profile URL: " + url);
    });
  };

  const handleSetupPayouts = () => {
    const returnUrl = `${window.location.origin}${basePath}/teacher-dashboard`;
    createOnboarding.mutate({ data: { returnUrl } }, {
      onSuccess: (data) => {
        if (data.onboardingUrl) {
          window.location.href = data.onboardingUrl;
        }
      },
      onError: () => {
        toast.error("Failed to start payout setup. Please try again.");
      }
    });
  };

  const handleOpenDashboard = async () => {
    try {
      const resp = await fetch(`${import.meta.env.VITE_API_URL ?? ""}/api/stripe/connect/dashboard`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed");
      const data = await resp.json();
      if (data.dashboardUrl) window.open(data.dashboardUrl, "_blank");
    } catch {
      toast.error("Failed to open Stripe dashboard. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-12 flex justify-center">
          <div className="animate-pulse w-full space-y-8">
            <div className="h-32 bg-muted rounded-xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="h-64 bg-muted rounded-xl md:col-span-2" />
              <div className="h-64 bg-muted rounded-xl" />
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!dashboard) return null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />
      
      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
          <h1 className="text-3xl font-serif font-bold text-foreground">Teacher Dashboard</h1>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleShareProfile}>
              <Share2 className="h-4 w-4 mr-2" />
              Share Profile
            </Button>
            <Button asChild>
              <Link href="/profile/edit">Edit Profile</Link>
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <DollarSign className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Total Earnings</p>
                  <h3 className="text-2xl font-bold text-foreground">${(dashboard.totalEarningsInCents / 100).toFixed(2)}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Active Students</p>
                  <h3 className="text-2xl font-bold text-foreground">{dashboard.totalStudents}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Calendar className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Lessons Taught</p>
                  <h3 className="text-2xl font-bold text-foreground">{dashboard.totalLessonsCompleted}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border">
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Star className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Average Rating</p>
                  <h3 className="text-2xl font-bold text-foreground">{dashboard.averageRating.toFixed(1)}</h3>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif">Upcoming Bookings</CardTitle>
              </CardHeader>
              <CardContent>
                {!dashboard.upcomingBookings.length ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No upcoming bookings scheduled.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dashboard.upcomingBookings.slice(0, 5).map(booking => (
                      <div key={booking.id} className="flex flex-col sm:flex-row gap-4 p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-start mb-1">
                            <h4 className="font-medium text-foreground truncate flex items-center gap-2">
                              {booking.type === 'lesson' ? 'Lesson' : 'Event'}
                              <span className="text-muted-foreground font-normal text-sm">
                                with {booking.studentId}
                              </span>
                            </h4>
                            <Badge variant={booking.status === 'pending' ? 'secondary' : 'default'} className="capitalize shrink-0 ml-2">
                              {booking.status}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2 flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            {booking.scheduledAt ? format(new Date(booking.scheduledAt), 'MMM d, yyyy h:mm a') : 'Date pending'}
                            <span className="text-border mx-1">•</span>
                            ${(booking.priceInCents / 100).toFixed(2)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif">Upcoming Masterclasses</CardTitle>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/listings">Manage Masterclasses</Link>
                </Button>
              </CardHeader>
              <CardContent>
                {!dashboard.upcomingMasterclasses.length ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No upcoming masterclasses.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {dashboard.upcomingMasterclasses.map(mc => (
                      <div key={mc.id} className="flex justify-between items-center p-4 rounded-lg border border-border bg-muted/20">
                        <div>
                          <h4 className="font-medium text-foreground">{mc.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {format(new Date(mc.scheduledAt), 'MMM d, yyyy h:mm a')}
                          </p>
                        </div>
                        <div className="text-right text-sm">
                          <div><span className="font-medium">{mc.registeredPerformers}</span>/{mc.maxPerformers} Performers</div>
                          <div><span className="font-medium">{mc.registeredObservers}</span>/{mc.maxObservers} Observers</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-8">
            {/* Booking Reel Card */}
            <BookingReelCard />

            {/* Stripe Connect Card */}
            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="font-serif text-lg flex items-center gap-2">
                  <CreditCard className="h-5 w-5 text-primary" />
                  Payouts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!connectStatus ? (
                  <div className="animate-pulse space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-8 bg-muted rounded" />
                  </div>
                ) : connectStatus.isConnected && connectStatus.isOnboarded ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span className="font-medium">Stripe payouts active</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                      <div className="rounded-lg bg-muted/50 border border-border p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Available</p>
                        <p className="text-base font-bold text-foreground">
                          ${((connectStatus.balanceAvailableInCents ?? 0) / 100).toFixed(2)}
                        </p>
                      </div>
                      <div className="rounded-lg bg-muted/50 border border-border p-3 text-center">
                        <p className="text-xs text-muted-foreground mb-0.5">Pending</p>
                        <p className="text-base font-bold text-foreground">
                          ${((connectStatus.balancePendingInCents ?? 0) / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      You receive 85% of each payment. The platform retains a 15% fee.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={handleOpenDashboard}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open Stripe Dashboard
                    </Button>
                  </>
                ) : connectStatus.isConnected && !connectStatus.isOnboarded ? (
                  <>
                    <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      <span className="font-medium">Setup incomplete</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Complete your Stripe account setup to receive payouts.
                    </p>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleSetupPayouts}
                      disabled={createOnboarding.isPending}
                    >
                      {createOnboarding.isPending ? "Loading..." : "Complete Setup"}
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Connect your bank account to receive lesson and booking payments directly. The platform takes a 15% fee.
                    </p>
                    <Button
                      size="sm"
                      className="w-full"
                      onClick={handleSetupPayouts}
                      disabled={createOnboarding.isPending}
                    >
                      {createOnboarding.isPending ? "Loading..." : "Set Up Payouts"}
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif text-lg">My Offerings</CardTitle>
                <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
                  <Link href="/listings">Manage</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between p-4 bg-muted/40 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <Music className="h-5 w-5 text-primary" />
                    <span className="font-medium">Active Listings</span>
                  </div>
                  <span className="text-xl font-bold">{dashboard.activeListingsCount}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border shadow-sm">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="font-serif text-lg">Concert Campaigns</CardTitle>
                <Button variant="ghost" size="sm" asChild className="h-auto p-0 text-primary">
                  <Link href="/campaigns">Manage</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-3">
                  Crowdfund live concerts with an all-or-nothing model. Fans back you; we only charge if you hit your goal.
                </p>
                <Button size="sm" className="w-full" asChild>
                  <Link href="/campaigns">View My Campaigns</Link>
                </Button>
              </CardContent>
            </Card>

            <AuditionPrepCard />

            <ComposerRoyaltyCard />

            <CoachingCard />

            <PracticePartnersCard />

            <Card className="border-border shadow-sm">
              <CardHeader>
                <CardTitle className="font-serif text-lg">Recent Reviews</CardTitle>
              </CardHeader>
              <CardContent>
                {!dashboard.recentReviews.length ? (
                  <p className="text-sm text-muted-foreground">No reviews yet.</p>
                ) : (
                  <div className="space-y-4">
                    {dashboard.recentReviews.slice(0, 3).map(review => (
                      <div key={review.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex text-primary">
                            {[...Array(5)].map((_, i) => (
                              <Star key={i} className={`h-3 w-3 ${i < review.rating ? 'fill-primary' : 'fill-muted text-muted'}`} />
                            ))}
                          </div>
                          <span className="text-xs text-muted-foreground">{format(new Date(review.createdAt), 'MMM d, yyyy')}</span>
                        </div>
                        {review.title && <h4 className="text-sm font-medium text-foreground">{review.title}</h4>}
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{review.body}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
