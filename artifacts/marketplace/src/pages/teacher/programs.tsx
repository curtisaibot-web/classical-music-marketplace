import { useState } from "react";
import { useListMyAuditionPrograms, useListTeacherEnrollments, useCreateAuditionProgram, useUpdateAuditionProgram, useCompleteSession, useGetSessionFeedbackUploadUrl } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { GraduationCap, Plus, ChevronDown, ChevronUp, CheckCircle2, Clock, Users, BookOpen, Upload, Paperclip } from "lucide-react";
import { format } from "date-fns";
import { usePageMeta } from "@/hooks/use-page-meta";

const TARGET_LEVEL_LABELS: Record<string, string> = {
  undergraduate: "Undergraduate",
  postgrad: "Postgraduate",
  professional_orchestra: "Professional Orchestra",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  active: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

interface CreateProgramForm {
  title: string;
  instrument: string;
  targetLevel: string;
  sessionCount: string;
  priceCents: string;
  syllabusText: string;
}

function CreateProgramDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<CreateProgramForm>({
    title: "",
    instrument: "",
    targetLevel: "undergraduate",
    sessionCount: "8",
    priceCents: "",
    syllabusText: "",
  });

  const createProgram = useCreateAuditionProgram();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceInDollars = parseFloat(form.priceCents);
    if (isNaN(priceInDollars) || priceInDollars <= 0) {
      toast.error("Please enter a valid price");
      return;
    }
    try {
      await createProgram.mutateAsync({
        data: {
          title: form.title,
          instrument: form.instrument,
          targetLevel: form.targetLevel as "undergraduate" | "postgrad" | "professional_orchestra",
          sessionCount: parseInt(form.sessionCount, 10),
          priceCents: Math.round(priceInDollars * 100),
          syllabusText: form.syllabusText || undefined,
        },
      });
      toast.success("Program created successfully!");
      setOpen(false);
      setForm({ title: "", instrument: "", targetLevel: "undergraduate", sessionCount: "8", priceCents: "", syllabusText: "" });
      onSuccess();
    } catch {
      toast.error("Failed to create program. Please try again.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4 mr-2" />
          New Program
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">Create Audition Prep Program</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Program Title</Label>
            <Input
              id="title"
              placeholder="e.g. Royal Academy Violin Audition Prep"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="instrument">Instrument</Label>
              <Input
                id="instrument"
                placeholder="e.g. Violin"
                value={form.instrument}
                onChange={(e) => setForm((f) => ({ ...f, instrument: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="sessionCount">Number of Sessions</Label>
              <Input
                id="sessionCount"
                type="number"
                min="1"
                max="52"
                value={form.sessionCount}
                onChange={(e) => setForm((f) => ({ ...f, sessionCount: e.target.value }))}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="targetLevel">Target Level</Label>
              <Select value={form.targetLevel} onValueChange={(v) => setForm((f) => ({ ...f, targetLevel: v }))}>
                <SelectTrigger id="targetLevel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="undergraduate">Undergraduate</SelectItem>
                  <SelectItem value="postgrad">Postgraduate</SelectItem>
                  <SelectItem value="professional_orchestra">Professional Orchestra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="price">Package Price (USD)</Label>
              <Input
                id="price"
                type="number"
                min="1"
                step="1"
                placeholder="e.g. 499"
                value={form.priceCents}
                onChange={(e) => setForm((f) => ({ ...f, priceCents: e.target.value }))}
                required
              />
            </div>
          </div>
          <div>
            <Label htmlFor="syllabus">Syllabus Description</Label>
            <Textarea
              id="syllabus"
              placeholder="Describe what each session covers, repertoire requirements, goals..."
              rows={5}
              value={form.syllabusText}
              onChange={(e) => setForm((f) => ({ ...f, syllabusText: e.target.value }))}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={createProgram.isPending}>
              {createProgram.isPending ? "Creating..." : "Create Program"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SessionRowProps {
  enrollmentId: number;
  sessionNumber: number;
  totalSessions: number;
  completedNote: { teacherNote?: string | null; feedbackFileKey?: string | null; completedAt: string } | null;
  onMarkComplete: (note: string, fileKey?: string) => Promise<void>;
}

function SessionRow({ enrollmentId, sessionNumber, completedNote, onMarkComplete }: SessionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const [note, setNote] = useState(completedNote?.teacherNote ?? "");
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadedFileKey, setUploadedFileKey] = useState<string | null>(completedNote?.feedbackFileKey ?? null);

  const getFeedbackUploadUrl = useGetSessionFeedbackUploadUrl();

  const handleSave = async () => {
    setSaving(true);
    try {
      let fileKey = uploadedFileKey;

      if (selectedFile) {
        const { uploadUrl, fileKey: newKey } = await getFeedbackUploadUrl.mutateAsync({
          enrollmentId,
          sessionNumber,
        });
        await fetch(uploadUrl, {
          method: "PUT",
          body: selectedFile,
          headers: { "Content-Type": selectedFile.type || "application/octet-stream" },
        });
        fileKey = newKey;
        setUploadedFileKey(newKey);
        setSelectedFile(null);
      }

      await onMarkComplete(note, fileKey ?? undefined);
      toast.success(`Session ${sessionNumber} saved!`);
    } catch {
      toast.error("Failed to save session.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/50 transition-colors text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex items-center gap-3">
          {completedNote ? (
            <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
          ) : (
            <Clock className="h-5 w-5 text-muted-foreground shrink-0" />
          )}
          <span className="font-medium text-sm">Session {sessionNumber}</span>
          {completedNote && (
            <span className="text-xs text-muted-foreground">
              Completed {format(new Date(completedNote.completedAt), "MMM d, yyyy")}
            </span>
          )}
          {(uploadedFileKey || completedNote?.feedbackFileKey) && (
            <Paperclip className="h-3.5 w-3.5 text-primary" />
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="p-3 border-t border-border space-y-3 bg-muted/20">
          <div>
            <Label className="text-xs">Session Note</Label>
            <Textarea
              rows={3}
              placeholder="Add notes for the student about this session..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 text-sm"
            />
          </div>
          <div>
            <Label className="text-xs">Feedback File (PDF or audio — optional)</Label>
            <div className="mt-1 flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs border border-border rounded px-3 py-1.5 cursor-pointer hover:bg-muted transition-colors">
                <Upload className="h-3.5 w-3.5" />
                {selectedFile ? selectedFile.name : (completedNote?.feedbackFileKey ? "Replace file" : "Choose file")}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf,.mp3,.wav,.m4a,.aac,.ogg"
                  onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                />
              </label>
              {(uploadedFileKey || completedNote?.feedbackFileKey) && !selectedFile && (
                <span className="text-xs text-green-700 flex items-center gap-1">
                  <Paperclip className="h-3 w-3" /> File attached
                </span>
              )}
            </div>
          </div>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : completedNote ? "Update" : "Mark Complete"}
          </Button>
        </div>
      )}
    </div>
  );
}

function EnrollmentCard({ enrollment, totalSessions, refetchEnrollments }: {
  enrollment: {
    id: number;
    studentId: string;
    studentUser?: { firstName?: string | null; lastName?: string | null } | null;
    sessionsCompleted: number;
    status: string;
    program?: { title?: string; sessionCount?: number } | null;
    sessionNotes: Array<{ sessionNumber: number; teacherNote?: string | null; feedbackFileKey?: string | null; completedAt: string }>;
  };
  totalSessions: number;
  refetchEnrollments: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const completeSession = useCompleteSession();

  const completedSet = new Map(enrollment.sessionNotes.map((n) => [n.sessionNumber, n]));

  const handleMarkComplete = async (sessionNumber: number, note: string, fileKey?: string) => {
    await completeSession.mutateAsync({
      enrollmentId: enrollment.id,
      sessionNumber,
      data: { teacherNote: note, feedbackFileKey: fileKey },
    });
    refetchEnrollments();
  };

  const studentName = [enrollment.studentUser?.firstName, enrollment.studentUser?.lastName].filter(Boolean).join(" ") || enrollment.studentId;

  return (
    <Card className="border-border">
      <CardContent className="p-4">
        <button
          className="w-full flex items-center justify-between mb-0"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center gap-3 min-w-0">
            <Users className="h-5 w-5 text-muted-foreground shrink-0" />
            <div className="min-w-0 text-left">
              <p className="font-medium text-foreground truncate">{studentName}</p>
              <p className="text-xs text-muted-foreground">
                {enrollment.sessionsCompleted}/{totalSessions} sessions completed
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className={`text-xs ${STATUS_COLORS[enrollment.status] ?? ""}`}>
              {enrollment.status}
            </Badge>
            {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
          </div>
        </button>

        {expanded && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-2 mb-4">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{ width: `${(enrollment.sessionsCompleted / totalSessions) * 100}%` }}
              />
            </div>

            {Array.from({ length: totalSessions }, (_, i) => i + 1).map((sessionNum) => (
              <SessionRow
                key={sessionNum}
                enrollmentId={enrollment.id}
                sessionNumber={sessionNum}
                totalSessions={totalSessions}
                completedNote={completedSet.get(sessionNum) ?? null}
                onMarkComplete={(note, fileKey) => handleMarkComplete(sessionNum, note, fileKey)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function TeacherPrograms() {
  usePageMeta({ title: "My Audition Prep Programs" });

  const { data: programsData, isLoading: loadingPrograms, refetch: refetchPrograms } = useListMyAuditionPrograms();
  const { data: enrollmentsData, isLoading: loadingEnrollments, refetch: refetchEnrollments } = useListTeacherEnrollments();
  const updateProgram = useUpdateAuditionProgram();

  const handleDeactivate = async (id: number) => {
    if (!confirm("Deactivate this program? Students won't be able to enroll, but existing enrollments continue.")) return;
    try {
      await updateProgram.mutateAsync({ id, data: { isActive: false } });
      toast.success("Program deactivated");
      refetchPrograms();
    } catch {
      toast.error("Failed to deactivate program");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-12 max-w-5xl">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <GraduationCap className="h-7 w-7 text-primary" />
            <h1 className="text-3xl font-serif font-bold text-foreground">Audition Prep Programs</h1>
          </div>
          <CreateProgramDialog onSuccess={() => refetchPrograms()} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Programs list */}
          <div className="lg:col-span-2 space-y-6">
            <h2 className="text-lg font-semibold text-foreground">My Programs</h2>
            {loadingPrograms ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-muted rounded-xl animate-pulse" />)}
              </div>
            ) : !programsData?.programs.length ? (
              <Card className="border-border">
                <CardContent className="p-8 text-center">
                  <BookOpen className="h-10 w-10 text-muted-foreground opacity-30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No programs yet. Create your first one!</p>
                </CardContent>
              </Card>
            ) : (
              programsData.programs.map((program) => {
                const enrolledCount = enrollmentsData?.enrollments.filter(
                  (e) => e.programId === program.id && (e.status === "active" || e.status === "completed"),
                ).length ?? 0;

                return (
                  <Card key={program.id} className="border-border">
                    <CardContent className="p-4 space-y-3">
                      <div>
                        <h3 className="font-semibold text-foreground leading-snug">{program.title}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {program.instrument} · {TARGET_LEVEL_LABELS[program.targetLevel]}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground">
                        <span>{program.sessionCount} sessions</span>
                        <span className="text-border">·</span>
                        <span>${(program.priceCents / 100).toFixed(0)}</span>
                        <span className="text-border">·</span>
                        <span>{enrolledCount} student{enrolledCount !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs">Active</Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs text-muted-foreground hover:text-destructive ml-auto"
                          onClick={() => handleDeactivate(program.id)}
                        >
                          Deactivate
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Enrollments */}
          <div className="lg:col-span-3 space-y-6">
            <h2 className="text-lg font-semibold text-foreground">Enrolled Students</h2>
            {loadingEnrollments ? (
              <div className="space-y-4">
                {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-muted rounded-xl animate-pulse" />)}
              </div>
            ) : !enrollmentsData?.enrollments.filter((e) => e.status !== "pending").length ? (
              <Card className="border-border">
                <CardContent className="p-8 text-center">
                  <Users className="h-10 w-10 text-muted-foreground opacity-30 mx-auto mb-3" />
                  <p className="text-muted-foreground text-sm">No active enrollments yet.</p>
                </CardContent>
              </Card>
            ) : (
              enrollmentsData.enrollments
                .filter((e) => e.status !== "pending")
                .map((enrollment) => (
                  <EnrollmentCard
                    key={enrollment.id}
                    enrollment={{
                      ...enrollment,
                      studentUser: enrollment.studentUser as { firstName?: string | null; lastName?: string | null } | null,
                      sessionNotes: enrollment.sessionNotes.map((n) => ({
                        ...n,
                        completedAt: typeof n.completedAt === "string" ? n.completedAt : new Date(n.completedAt).toISOString(),
                      })),
                    }}
                    totalSessions={enrollment.program?.sessionCount ?? 1}
                    refetchEnrollments={refetchEnrollments}
                  />
                ))
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
