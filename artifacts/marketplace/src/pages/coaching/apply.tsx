import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ImageCropModal } from "@/components/ui/image-crop-modal";
import { Briefcase, CheckCircle2, Camera, Loader2 } from "lucide-react";
import { useUser } from "@clerk/react";
import { toast } from "sonner";
import { usePageMeta } from "@/hooks/use-page-meta";

const ALL_SPECIALTIES = [
  "Audition Preparation",
  "Career Development",
  "Music Business",
  "Orchestral Careers",
  "Artist Management",
  "Music Education",
  "Grant Writing",
  "Recording & Production",
  "Music Law",
  "Entrepreneurship",
];

type ExistingCoach = {
  profileImageUrl?: string | null;
  bio?: string | null;
  credentials?: string | null;
  specialties?: string[];
  linkedInUrl?: string | null;
  sessionRateCents?: number | null;
  city?: string | null;
  country?: string | null;
  approvalStatus?: string;
};

export default function CoachApply() {
  const { user, isLoaded } = useUser();
  const [, setLocation] = useLocation();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const [bio, setBio] = useState("");
  const [credentials, setCredentials] = useState("");
  const [specialties, setSpecialties] = useState<string[]>([]);
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [sessionRateCents, setSessionRateCents] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");

  const [photoUrl, setPhotoUrl] = useState<string>("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isApproved, setIsApproved] = useState(false);

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  const apiBase = basePath.replace(/\/[^/]*$/, "");

  usePageMeta({
    title: "Apply to Coach — Harmonia",
    description: "Share your industry expertise and help classical musicians build their careers.",
  });

  useEffect(() => {
    if (!isLoaded || !user) return;
    fetch(`${apiBase}/api/coaches/me`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) return;
        const data = await r.json() as ExistingCoach;
        setBio(data.bio ?? "");
        setCredentials(data.credentials ?? "");
        setSpecialties(data.specialties ?? []);
        setLinkedInUrl(data.linkedInUrl ?? "");
        setSessionRateCents(data.sessionRateCents ? String(data.sessionRateCents / 100) : "");
        setCity(data.city ?? "");
        setCountry(data.country ?? "");
        setPhotoUrl(data.profileImageUrl ?? "");
        setIsApproved(data.approvalStatus === "approved");
      })
      .catch(() => {});
  }, [isLoaded, user, apiBase]);

  const toggleSpecialty = (s: string) => {
    setSpecialties((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  const handlePhotoFileSelected = (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5 MB.");
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    setCropSrc(objectUrl);
  };

  const handlePhotoCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handlePhotoCropComplete = async (croppedBlob: Blob) => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);

    const croppedFile = new File([croppedBlob], "profile-photo.jpg", { type: "image/jpeg" });
    const objectUrl = URL.createObjectURL(croppedBlob);
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return objectUrl;
    });
    setIsUploadingPhoto(true);

    try {
      const urlResp = await fetch(`${apiBase}/api/storage/images/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: croppedFile.name,
          size: croppedFile.size,
          contentType: croppedFile.type,
        }),
      });

      if (!urlResp.ok) {
        const data = await urlResp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to request upload URL");
      }

      const { uploadURL, objectPath } = await urlResp.json() as { uploadURL: string; objectPath: string };

      const putResp = await fetch(uploadURL, {
        method: "PUT",
        body: croppedFile,
        headers: { "Content-Type": croppedFile.type },
      });

      if (!putResp.ok) throw new Error("Failed to upload image to storage");

      URL.revokeObjectURL(objectUrl);
      const servingUrl = `${apiBase}/api/storage${objectPath}`;
      setPhotoUrl(servingUrl);
      setPreviewUrl(null);
      toast.success("Photo uploaded — save your profile to apply changes.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setIsUploadingPhoto(false);
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
      toast.error(msg);
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { toast.error("Please sign in first"); return; }
    if (!bio.trim() || !credentials.trim() || specialties.length === 0) {
      toast.error("Please fill in all required fields and select at least one specialty");
      return;
    }
    setLoading(true);
    try {
      const endpoint = isApproved ? `${apiBase}/api/coaches/me` : `${apiBase}/api/coaches/apply`;
      const method = isApproved ? "PUT" : "POST";
      const resp = await fetch(endpoint, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bio: bio.trim(),
          credentials: credentials.trim(),
          specialties,
          linkedInUrl: linkedInUrl.trim() || undefined,
          sessionRateCents: sessionRateCents ? Math.round(Number(sessionRateCents) * 100) : undefined,
          city: city.trim() || undefined,
          country: country.trim() || undefined,
          profileImageUrl: photoUrl || undefined,
        }),
      });
      if (!resp.ok) {
        const err = await resp.json() as { error?: string };
        throw new Error(err.error ?? "Application failed");
      }
      if (isApproved) {
        toast.success("Profile updated successfully");
      } else {
        setSubmitted(true);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit application");
    } finally {
      setLoading(false);
    }
  };

  const displayPhoto = previewUrl || photoUrl || null;

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <CheckCircle2 className="h-16 w-16 text-emerald-500 mx-auto mb-6" />
            <h2 className="text-3xl font-serif font-bold mb-3">Application Received!</h2>
            <p className="text-muted-foreground mb-6">
              Thank you for applying to become a Harmonia coach. We review all applications within 3–5 business days.
              You'll be notified by email once your profile is approved.
            </p>
            <Button onClick={() => setLocation("/coaching")}>Browse Coaches</Button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          onCropComplete={handlePhotoCropComplete}
          onCancel={handlePhotoCropCancel}
        />
      )}

      <div className="bg-muted border-b border-border py-10">
        <div className="container mx-auto px-4 max-w-2xl">
          <div className="flex items-center gap-3 mb-2">
            <Briefcase className="h-6 w-6 text-primary" />
            <h1 className="text-3xl font-serif font-bold">
              {isApproved ? "My Coach Profile" : "Apply to Coach"}
            </h1>
          </div>
          <p className="text-muted-foreground">
            {isApproved
              ? "Update your coaching profile visible to musicians on Harmonia."
              : "Share your industry expertise with classical musicians seeking career guidance. Applications are reviewed by the Harmonia team."}
          </p>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-10 max-w-2xl">
        {!isLoaded ? null : !user ? (
          <Card className="border-border">
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground mb-4">Please sign in to submit a coaching application.</p>
              <Button asChild><a href={`${basePath}/sign-in`}>Sign In</a></Button>
            </CardContent>
          </Card>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Profile Photo */}
            <Card className="border-border">
              <CardContent className="p-6 space-y-4">
                <h2 className="font-serif font-semibold text-lg">Profile Photo</h2>
                <p className="text-sm text-muted-foreground -mt-2">
                  A professional headshot helps musicians recognise and trust you.
                </p>
                <div className="flex items-center gap-5">
                  <div className="relative h-24 w-24 rounded-full bg-primary/10 overflow-hidden shrink-0 flex items-center justify-center border border-border">
                    {isUploadingPhoto ? (
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    ) : displayPhoto ? (
                      <img src={displayPhoto} alt="Profile photo" className="w-full h-full object-cover" />
                    ) : (
                      <Camera className="h-8 w-8 text-muted-foreground opacity-50" />
                    )}
                  </div>
                  <div className="space-y-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={isUploadingPhoto}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {isUploadingPhoto ? "Uploading…" : displayPhoto ? "Change Photo" : "Upload Photo"}
                    </Button>
                    <p className="text-xs text-muted-foreground">JPG or PNG · Max 5 MB · Cropped to portrait</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handlePhotoFileSelected(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="p-6 space-y-5">
                <h2 className="font-serif font-semibold text-lg">About You</h2>

                <div className="space-y-1.5">
                  <Label htmlFor="credentials">Credentials / Title <span className="text-destructive">*</span></Label>
                  <Input
                    id="credentials"
                    placeholder="e.g. Former Principal Oboist, Philadelphia Orchestra"
                    value={credentials}
                    onChange={(e) => setCredentials(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">Your professional title or most notable role</p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="bio">Bio <span className="text-destructive">*</span></Label>
                  <Textarea
                    id="bio"
                    placeholder="Tell musicians about your career experience and what you can offer as a coach…"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={5}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="linkedin">LinkedIn URL</Label>
                  <Input
                    id="linkedin"
                    type="url"
                    placeholder="https://linkedin.com/in/your-profile"
                    value={linkedInUrl}
                    onChange={(e) => setLinkedInUrl(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="p-6 space-y-5">
                <h2 className="font-serif font-semibold text-lg">Specialties <span className="text-destructive">*</span></h2>
                <p className="text-sm text-muted-foreground -mt-3">Select all areas you can coach on</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ALL_SPECIALTIES.map((s) => (
                    <label key={s} className="flex items-center gap-2.5 cursor-pointer rounded-md hover:bg-muted px-2 py-1.5">
                      <Checkbox
                        checked={specialties.includes(s)}
                        onCheckedChange={() => toggleSpecialty(s)}
                      />
                      <span className="text-sm">{s}</span>
                    </label>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-border">
              <CardContent className="p-6 space-y-5">
                <h2 className="font-serif font-semibold text-lg">Session Details</h2>

                <div className="space-y-1.5">
                  <Label htmlFor="rate">Session Rate (USD)</Label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                    <Input
                      id="rate"
                      type="number"
                      min="10"
                      step="5"
                      className="pl-7"
                      placeholder="150"
                      value={sessionRateCents}
                      onChange={(e) => setSessionRateCents(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Starting rate per session (you can set specific prices per listing)</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      placeholder="New York"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      placeholder="USA"
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? "Saving…" : isApproved ? "Save Profile" : "Submit Application"}
            </Button>
          </form>
        )}
      </main>

      <Footer />
    </div>
  );
}
