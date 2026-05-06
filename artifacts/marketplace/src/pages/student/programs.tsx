import { useListMyEnrollments, downloadCertificate } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GraduationCap, BookOpen, CheckCircle2, Clock, Download, Users, FileText } from "lucide-react";
import { format } from "date-fns";
import { usePageMeta } from "@/hooks/use-page-meta";
import { toast } from "sonner";
import { useState } from "react";

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

const STATUS_LABELS: Record<string, string> = {
  pending: "Payment Pending",
  active: "In Progress",
  completed: "Completed",
  cancelled: "Cancelled",
};

export default function StudentPrograms() {
  usePageMeta({ title: "My Audition Prep Programs" });

  const { data, isLoading } = useListMyEnrollments();
  const [downloading, setDownloading] = useState<number | null>(null);

  const handleDownloadCertificate = async (enrollmentId: number) => {
    setDownloading(enrollmentId);
    try {
      const blob = await downloadCertificate(enrollmentId);
      const url = URL.createObjectURL(blob as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `harmonia-certificate-${enrollmentId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Failed to download certificate. Please try again.");
    } finally {
      setDownloading(null);
    }
  };

  const enrollments = (data?.enrollments ?? []).filter((e) => e.status !== "pending");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <div className="flex items-center gap-3 mb-8">
          <GraduationCap className="h-7 w-7 text-primary" />
          <h1 className="text-3xl font-serif font-bold text-foreground">My Audition Prep Programs</h1>
        </div>

        {isLoading ? (
          <div className="space-y-6">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-64 bg-muted rounded-xl animate-pulse" />
            ))}
          </div>
        ) : !enrollments.length ? (
          <div className="text-center py-20 max-w-md mx-auto">
            <div className="h-20 w-20 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
              <BookOpen className="h-10 w-10 text-muted-foreground opacity-40" />
            </div>
            <h3 className="text-xl font-serif font-medium text-foreground mb-2">No programs yet</h3>
            <p className="text-muted-foreground mb-6">
              Browse audition prep programs and enroll to start working with a specialist coach.
            </p>
            <Button asChild>
              <a href="/audition-prep">Browse Programs</a>
            </Button>
          </div>
        ) : (
          <div className="space-y-8">
            {enrollments.map((enrollment) => {
              const program = enrollment.program;
              const totalSessions = program?.sessionCount ?? 1;
              const progress = Math.round((enrollment.sessionsCompleted / totalSessions) * 100);
              const isCompleted = enrollment.status === "completed";
              const completedSet = new Map(
                enrollment.sessionNotes.map((n) => [n.sessionNumber, n]),
              );
              const teacherName = [
                enrollment.teacherUser?.firstName,
                enrollment.teacherUser?.lastName,
              ]
                .filter(Boolean)
                .join(" ") || "Teacher";

              return (
                <Card key={enrollment.id} className="border-border shadow-sm">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <CardTitle className="font-serif text-xl leading-snug mb-1">
                          {program?.title ?? "Audition Prep Program"}
                        </CardTitle>
                        <div className="flex flex-wrap gap-2 mt-2">
                          <Badge className={`text-xs ${STATUS_COLORS[enrollment.status] ?? ""}`}>
                            {STATUS_LABELS[enrollment.status] ?? enrollment.status}
                          </Badge>
                          {program?.targetLevel && (
                            <Badge variant="outline" className="text-xs">
                              {TARGET_LEVEL_LABELS[program.targetLevel]}
                            </Badge>
                          )}
                          {program?.instrument && (
                            <Badge variant="outline" className="text-xs">{program.instrument}</Badge>
                          )}
                        </div>
                      </div>
                      {isCompleted && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDownloadCertificate(enrollment.id)}
                          disabled={downloading === enrollment.id}
                          className="shrink-0"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {downloading === enrollment.id ? "Preparing..." : "Certificate"}
                        </Button>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm text-muted-foreground mt-2">
                      <Users className="h-4 w-4" />
                      <span>with {teacherName}</span>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-6">
                    {/* Progress */}
                    <div>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium text-foreground">
                          {enrollment.sessionsCompleted}/{totalSessions} sessions
                        </span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className={`h-2 rounded-full transition-all ${isCompleted ? "bg-green-500" : "bg-primary"}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    {/* Session notes from teacher */}
                    {enrollment.sessionNotes.length > 0 && (
                      <div>
                        <h4 className="font-medium text-foreground text-sm mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          Session Notes from Your Coach
                        </h4>
                        <div className="space-y-2">
                          {Array.from({ length: totalSessions }, (_, i) => i + 1).map((sessionNum) => {
                            const note = completedSet.get(sessionNum);
                            return (
                              <div
                                key={sessionNum}
                                className={`flex gap-3 p-3 rounded-lg border ${note ? "border-border bg-muted/20" : "border-border/50 bg-transparent opacity-50"}`}
                              >
                                <div className="shrink-0 mt-0.5">
                                  {note ? (
                                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                                  ) : (
                                    <Clock className="h-4 w-4 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="text-sm font-medium text-foreground">Session {sessionNum}</span>
                                    {note && (
                                      <span className="text-xs text-muted-foreground">
                                        {format(new Date(note.completedAt), "MMM d, yyyy")}
                                      </span>
                                    )}
                                  </div>
                                  {note?.teacherNote ? (
                                    <p className="text-sm text-muted-foreground leading-relaxed">{note.teacherNote}</p>
                                  ) : note ? (
                                    <p className="text-xs text-muted-foreground italic">Session completed — no note added</p>
                                  ) : (
                                    <p className="text-xs text-muted-foreground italic">Not yet completed</p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Completion banner */}
                    {isCompleted && (
                      <div className="flex items-center gap-3 p-4 rounded-lg bg-green-50 border border-green-200">
                        <GraduationCap className="h-6 w-6 text-green-700 shrink-0" />
                        <div>
                          <p className="font-medium text-green-800 text-sm">Program Complete!</p>
                          <p className="text-green-700 text-xs">
                            Congratulations on completing all {totalSessions} sessions. Download your certificate above.
                          </p>
                        </div>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      Enrolled {format(new Date(enrollment.createdAt), "MMMM d, yyyy")}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}
