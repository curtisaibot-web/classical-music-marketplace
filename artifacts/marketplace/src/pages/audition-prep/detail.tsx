import { useState } from "react";
import { useRoute, Link } from "wouter";
import { useUser } from "@clerk/react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useGetAuditionProgram, useCreateProgramEnrollment, useCreateProgramEnrollmentCheckout } from "@workspace/api-client-react";
import { GraduationCap, BookOpen, CheckCircle2, Users, ArrowLeft, AlertCircle } from "lucide-react";
import { resolveImageUrl } from "@/lib/image-url";
import { toast } from "sonner";

const TARGET_LEVEL_LABELS: Record<string, string> = {
  undergraduate: "Undergraduate",
  postgrad: "Postgraduate",
  professional_orchestra: "Professional Orchestra",
};

const LEVEL_COLORS: Record<string, string> = {
  undergraduate: "bg-blue-100 text-blue-800",
  postgrad: "bg-purple-100 text-purple-800",
  professional_orchestra: "bg-amber-100 text-amber-800",
};

export default function AuditionPrepDetail() {
  const [, params] = useRoute("/audition-prep/:id");
  const id = parseInt(params?.id ?? "", 10);
  const { isSignedIn } = useUser();
  const [enrolling, setEnrolling] = useState(false);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  const { data: program, isLoading, isError } = useGetAuditionProgram(isNaN(id) ? 0 : id);

  const createEnrollment = useCreateProgramEnrollment();
  const createCheckout = useCreateProgramEnrollmentCheckout();

  const handleEnroll = async () => {
    if (!isSignedIn) {
      window.location.href = `${basePath}/sign-in`;
      return;
    }
    if (!program) return;

    setEnrolling(true);
    try {
      const enrollment = await createEnrollment.mutateAsync({ id });
      const successUrl = `${window.location.origin}${basePath}/payment/success?type=program_enrollment&enrollment_id=${enrollment.id}`;
      const cancelUrl = `${window.location.origin}${basePath}/audition-prep/${id}`;

      const checkout = await createCheckout.mutateAsync({
        data: { enrollmentId: enrollment.id, successUrl, cancelUrl },
      });

      if (checkout.checkoutUrl) {
        window.location.href = checkout.checkoutUrl;
      } else {
        toast.error("Failed to start checkout. Please try again.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Enrollment failed";
      toast.error(msg);
    } finally {
      setEnrolling(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-12 animate-pulse space-y-6 max-w-3xl">
          <div className="h-8 bg-muted rounded w-1/3" />
          <div className="h-48 bg-muted rounded-xl" />
          <div className="h-32 bg-muted rounded-xl" />
        </div>
        <Footer />
      </div>
    );
  }

  if (isError || !program) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 container mx-auto px-4 py-20 text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4 opacity-70" />
          <h2 className="text-xl font-medium mb-2">Program not found</h2>
          <p className="text-muted-foreground mb-6">This program may no longer be available.</p>
          <Button asChild variant="outline">
            <Link href="/audition-prep">Back to programs</Link>
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const imgSrc = resolveImageUrl(program.teacher?.profileImageUrl ?? null, basePath);
  const levelLabel = TARGET_LEVEL_LABELS[program.targetLevel] ?? program.targetLevel;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        {/* Back nav */}
        <Link href="/audition-prep" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8 transition-colors">
          <ArrowLeft className="h-4 w-4" />
          All Audition Prep Programs
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main info */}
          <div className="lg:col-span-2 space-y-6">
            <div>
              <div className="flex flex-wrap gap-2 mb-3">
                <Badge className={`text-xs font-medium ${LEVEL_COLORS[program.targetLevel] ?? ""}`}>
                  {levelLabel}
                </Badge>
                <Badge variant="outline" className="text-xs">{program.instrument}</Badge>
                <Badge variant="outline" className="text-xs">{program.sessionCount} sessions</Badge>
              </div>
              <h1 className="text-3xl font-serif font-bold text-foreground mb-4">{program.title}</h1>
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-muted overflow-hidden border border-border">
                  {imgSrc ? (
                    <img src={imgSrc} alt="Teacher" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Users className="h-4 w-4 opacity-30" />
                    </div>
                  )}
                </div>
                <p className="text-muted-foreground">
                  with{" "}
                  <span className="font-medium text-foreground">
                    {program.teacher?.firstName} {program.teacher?.lastName}
                  </span>
                </p>
              </div>
            </div>

            {/* Session overview */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                  Program Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-2xl font-bold text-foreground">{program.sessionCount}</p>
                    <p className="text-xs text-muted-foreground mt-1">Sessions</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-lg font-bold text-foreground">{program.instrument}</p>
                    <p className="text-xs text-muted-foreground mt-1">Instrument</p>
                  </div>
                  <div className="rounded-lg bg-muted/50 p-4">
                    <p className="text-sm font-bold text-foreground leading-tight">{levelLabel}</p>
                    <p className="text-xs text-muted-foreground mt-1">Target Level</p>
                  </div>
                </div>

                {program.syllabusText && (
                  <div>
                    <h3 className="font-medium text-foreground mb-2">Syllabus</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {program.syllabusText}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* What's included */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="font-serif">What's Included</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3">
                  {[
                    `${program.sessionCount} one-to-one coaching sessions with your specialist`,
                    "Detailed teacher notes after each session",
                    "Mock audition feedback recordings (audio or PDF) per session",
                    "Completion certificate upon finishing the full program",
                    "Progress tracking dashboard for student and teacher",
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                      <span className="text-sm text-muted-foreground">{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>

          {/* Purchase sidebar */}
          <div className="space-y-6">
            <Card className="border-border shadow-sm sticky top-6">
              <CardContent className="p-6 space-y-4">
                <div>
                  <p className="text-3xl font-bold text-foreground">
                    ${(program.priceCents / 100).toFixed(0)}
                  </p>
                  <p className="text-sm text-muted-foreground">Full package · one-time payment</p>
                </div>

                <div className="space-y-2 text-sm text-muted-foreground">
                  <div className="flex justify-between">
                    <span>{program.sessionCount} sessions</span>
                    <span className="text-foreground font-medium">
                      ${(program.priceCents / program.sessionCount / 100).toFixed(0)}/session
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Instrument</span>
                    <span className="text-foreground">{program.instrument}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Level</span>
                    <span className="text-foreground">{levelLabel}</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleEnroll}
                  disabled={enrolling}
                >
                  <GraduationCap className="h-5 w-5 mr-2" />
                  {enrolling ? "Enrolling..." : "Enroll Now"}
                </Button>

                <p className="text-xs text-center text-muted-foreground">
                  Secure payment via Stripe. Full amount charged upfront.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
