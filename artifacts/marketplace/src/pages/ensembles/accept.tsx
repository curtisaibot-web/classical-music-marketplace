import { useEffect, useState } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { useUser } from "@clerk/react";
import { useAcceptEnsembleInvite, useGetEnsemble, getGetEnsembleQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

export default function EnsembleAccept() {
  const [, params] = useRoute("/ensembles/:slug/accept");
  const slug = params?.slug ?? "";
  const [, setLocation] = useLocation();

  const { isSignedIn, isLoaded: userLoaded } = useUser();
  const [status, setStatus] = useState<"idle" | "accepting" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const { data: ensemble, isLoading: ensembleLoading } = useGetEnsemble(slug, {
    query: { enabled: !!slug, queryKey: getGetEnsembleQueryKey(slug) },
  });

  const acceptMutation = useAcceptEnsembleInvite();

  // Extract token from query string
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  // If user is not signed in, redirect to sign-in with return URL
  useEffect(() => {
    if (userLoaded && !isSignedIn) {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      setLocation(`/sign-in?redirect_url=${returnUrl}`);
    }
  }, [userLoaded, isSignedIn, setLocation]);

  // Auto-attempt acceptance once we have slug + token + user
  useEffect(() => {
    if (!ensemble || !token || !isSignedIn || status !== "idle") return;

    setStatus("accepting");
    acceptMutation
      .mutateAsync({ id: ensemble.id, data: { token } })
      .then(() => {
        setStatus("success");
      })
      .catch((err: unknown) => {
        const msg =
          err instanceof Error
            ? err.message
            : typeof err === "object" && err !== null && "response" in err
            ? "Failed to accept invitation"
            : "Failed to accept invitation";
        setErrorMsg(msg);
        setStatus("error");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ensemble, token, isSignedIn]);

  if (!userLoaded || ensembleLoading || status === "idle" || status === "accepting") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">
            {status === "accepting" ? "Accepting your invitation…" : "Loading…"}
          </p>
        </div>
      </div>
    );
  }

  if (status === "success") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-500" />
            <h1 className="text-2xl font-bold">Welcome to the ensemble!</h1>
            <p className="text-muted-foreground">
              You've successfully joined{" "}
              <span className="font-semibold text-foreground">
                {ensemble?.name ?? slug}
              </span>
              . Your revenue splits are now active.
            </p>
            <Link href={`/ensembles/${slug}`}>
              <Button className="mt-2">View Ensemble Profile</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-2xl font-bold">Unable to accept invitation</h1>
            <p className="text-muted-foreground">
              {errorMsg || "This invitation link may be invalid or expired."}
            </p>
            <div className="flex gap-3 mt-2">
              <Link href={`/ensembles/${slug}`}>
                <Button variant="outline">View Ensemble</Button>
              </Link>
              <Link href="/dashboard">
                <Button>Go to Dashboard</Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
