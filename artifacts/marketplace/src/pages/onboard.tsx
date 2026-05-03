import { useState } from "react";
import { useLocation } from "wouter";
import { useOnboardUser } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, Music, GraduationCap } from "lucide-react";
import { toast } from "sonner";

export default function Onboard() {
  const [, setLocation] = useLocation();
  const [role, setRole] = useState<"teacher" | "student">("student");
  const onboardMutation = useOnboardUser();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onboardMutation.mutate(
      { data: { role } },
      {
        onSuccess: () => {
          toast.success("Welcome to Harmonia!");
          if (role === "teacher") {
            setLocation("/teacher-dashboard");
          } else {
            setLocation("/dashboard");
          }
        },
        onError: () => {
          toast.error("Failed to complete onboarding. Please try again.");
        },
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="Harmonia" className="h-12 w-auto mx-auto mb-6" />
          <h1 className="text-3xl font-serif font-bold text-foreground">How will you use Harmonia?</h1>
          <p className="text-muted-foreground mt-2">Select your primary role. You can always browse everything.</p>
        </div>

        <Card className="border-border shadow-sm">
          <form onSubmit={handleSubmit}>
            <CardContent className="pt-6">
              <RadioGroup value={role} onValueChange={(v) => setRole(v as "teacher" | "student")} className="space-y-4">
                
                <div>
                  <RadioGroupItem value="student" id="student" className="peer sr-only" />
                  <Label
                    htmlFor="student"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-colors"
                  >
                    <div className="flex w-full items-center gap-4">
                      <div className="bg-primary/10 p-3 rounded-full text-primary">
                        <GraduationCap className="h-6 w-6" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-semibold text-lg">Student or Enthusiast</div>
                        <div className="text-sm text-muted-foreground font-normal">
                          Find teachers, book lessons, and attend masterclasses.
                        </div>
                      </div>
                    </div>
                  </Label>
                </div>

                <div>
                  <RadioGroupItem value="teacher" id="teacher" className="peer sr-only" />
                  <Label
                    htmlFor="teacher"
                    className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-transparent p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer transition-colors"
                  >
                    <div className="flex w-full items-center gap-4">
                      <div className="bg-primary/10 p-3 rounded-full text-primary">
                        <Music className="h-6 w-6" />
                      </div>
                      <div className="flex-1 text-left">
                        <div className="font-semibold text-lg">Teacher or Musician</div>
                        <div className="text-sm text-muted-foreground font-normal">
                          Offer lessons, sell digital products, and manage your studio.
                        </div>
                      </div>
                    </div>
                  </Label>
                </div>
                
              </RadioGroup>
            </CardContent>
            <div className="px-6 pb-6 pt-2">
              <Button type="submit" className="w-full" disabled={onboardMutation.isPending}>
                {onboardMutation.isPending ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Completing setup...</>
                ) : (
                  "Continue"
                )}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
