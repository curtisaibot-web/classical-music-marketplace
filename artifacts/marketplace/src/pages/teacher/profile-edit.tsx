import { useState, useEffect, useRef } from "react";
import { useGetMyTeacherProfile, useUpdateMyTeacherProfile } from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageCropModal } from "@/components/ui/image-crop-modal";
import { Loader2, Music, Camera } from "lucide-react";
import { toast } from "sonner";

interface UploadState {
  isUploading: boolean;
  error: string | null;
}

export default function TeacherProfileEdit() {
  const { data: profile, isLoading } = useGetMyTeacherProfile();
  const updateProfile = useUpdateMyTeacherProfile();

  const [formData, setFormData] = useState({
    bio: "",
    instruments: "",
    genres: "",
    city: "",
    hourlyRate: 5000,
    yearsExperience: 0,
    education: "",
    profileImageUrl: "",
  });

  const [uploadState, setUploadState] = useState<UploadState>({ isUploading: false, error: null });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [cropSrc, setCropSrc] = useState<string | null>(null);

  useEffect(() => {
    if (profile) {
      setFormData({
        bio: profile.bio || "",
        instruments: profile.instruments.join(", "),
        genres: profile.genres.join(", "),
        city: profile.city || "",
        hourlyRate: profile.hourlyRate || 5000,
        yearsExperience: profile.yearsExperience || 0,
        education: profile.education || "",
        profileImageUrl: profile.profileImageUrl || "",
      });
    }
  }, [profile]);

  const handleFileSelected = (file: File) => {
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

  const handleCropCancel = () => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (cropSrc) URL.revokeObjectURL(cropSrc);
    setCropSrc(null);

    const croppedFile = new File([croppedBlob], "profile-photo.jpg", { type: "image/jpeg" });

    const objectUrl = URL.createObjectURL(croppedBlob);
    setPreviewUrl((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return objectUrl;
    });
    setUploadState({ isUploading: true, error: null });

    try {
      const urlResp = await fetch("/api/storage/images/request-url", {
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
      const servingUrl = `/api/storage${objectPath}`;
      setFormData((prev) => ({ ...prev, profileImageUrl: servingUrl }));
      setPreviewUrl(null);
      setUploadState({ isUploading: false, error: null });
      toast.success("Photo uploaded — save your profile to apply changes.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUploadState({ isUploading: false, error: msg });
      URL.revokeObjectURL(objectUrl);
      setPreviewUrl(null);
      toast.error(msg);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    updateProfile.mutate({
      data: {
        bio: formData.bio,
        instruments: formData.instruments.split(",").map((s) => s.trim()).filter(Boolean),
        genres: formData.genres.split(",").map((s) => s.trim()).filter(Boolean),
        city: formData.city,
        hourlyRate: formData.hourlyRate,
        yearsExperience: formData.yearsExperience,
        education: formData.education,
        profileImageUrl: formData.profileImageUrl || undefined,
      },
    }, {
      onSuccess: () => toast.success("Profile updated successfully"),
      onError: () => toast.error("Failed to update profile"),
    });
  };

  const displayImageUrl = previewUrl || formData.profileImageUrl || null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <>
      {cropSrc && (
        <ImageCropModal
          imageSrc={cropSrc}
          aspect={3 / 4}
          onCropComplete={handleCropComplete}
          onCancel={handleCropCancel}
        />
      )}

      <div className="min-h-screen flex flex-col bg-background">
        <Navbar />

        <div className="bg-muted py-10 border-b border-border">
          <div className="container mx-auto px-4 max-w-3xl">
            <h1 className="text-3xl font-serif font-bold text-foreground">Edit Profile</h1>
            <p className="text-muted-foreground mt-1">Update your public teacher profile.</p>
          </div>
        </div>

        <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
          <form onSubmit={handleSubmit}>
            <div className="space-y-8">

              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="font-serif">Profile Photo</CardTitle>
                  <CardDescription>This photo appears on your public profile and teacher cards.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="w-28 h-28 rounded-full overflow-hidden bg-muted border-2 border-border shrink-0 flex items-center justify-center">
                      {displayImageUrl ? (
                        <img
                          src={displayImageUrl}
                          alt="Profile preview"
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        <Music className="h-10 w-10 text-muted-foreground opacity-30" />
                      )}
                    </div>

                    <div className="flex flex-col gap-3">
                      <Button
                        type="button"
                        variant="outline"
                        disabled={uploadState.isUploading}
                        onClick={() => fileInputRef.current?.click()}
                        className="gap-2"
                      >
                        {uploadState.isUploading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Camera className="h-4 w-4" />
                        )}
                        {uploadState.isUploading ? "Uploading…" : displayImageUrl ? "Change Photo" : "Upload Photo"}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        JPG, PNG or WebP · Max 5 MB · Crop to 3:4 portrait
                      </p>
                      {uploadState.error && (
                        <p className="text-xs text-destructive">{uploadState.error}</p>
                      )}
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFileSelected(f);
                        e.target.value = "";
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="font-serif">Basic Information</CardTitle>
                  <CardDescription>This information will be displayed publicly on your profile.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="bio">Biography</Label>
                    <Textarea
                      id="bio"
                      value={formData.bio}
                      onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                      placeholder="Tell prospective students about yourself..."
                      className="min-h-[150px]"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="instruments">Instruments (comma-separated)</Label>
                      <Input
                        id="instruments"
                        value={formData.instruments}
                        onChange={(e) => setFormData({ ...formData, instruments: e.target.value })}
                        placeholder="e.g. Piano, Violin, Music Theory"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="genres">Genres (comma-separated)</Label>
                      <Input
                        id="genres"
                        value={formData.genres}
                        onChange={(e) => setFormData({ ...formData, genres: e.target.value })}
                        placeholder="e.g. Classical, Jazz, Contemporary"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="city">City / Location</Label>
                      <Input
                        id="city"
                        value={formData.city}
                        onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                        placeholder="e.g. New York, NY"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="yearsExperience">Years of Experience</Label>
                      <Input
                        id="yearsExperience"
                        type="number"
                        min="0"
                        value={formData.yearsExperience}
                        onChange={(e) => setFormData({ ...formData, yearsExperience: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="font-serif">Rates & Qualifications</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2 max-w-sm">
                    <Label htmlFor="hourlyRate">Default Hourly Rate ($)</Label>
                    <Input
                      id="hourlyRate"
                      type="number"
                      min="0"
                      step="1"
                      value={formData.hourlyRate / 100}
                      onChange={(e) => setFormData({ ...formData, hourlyRate: Math.round(Number(e.target.value) * 100) })}
                    />
                    <p className="text-xs text-muted-foreground">This is your base rate for private lessons.</p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="education">Education & Credentials</Label>
                    <Textarea
                      id="education"
                      value={formData.education}
                      onChange={(e) => setFormData({ ...formData, education: e.target.value })}
                      placeholder="List your degrees, conservatories, and major instructors..."
                      className="min-h-[100px]"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4 border-t border-border pt-6">
                <Button type="submit" disabled={updateProfile.isPending || uploadState.isUploading}>
                  {updateProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </div>
          </form>
        </main>

        <Footer />
      </div>
    </>
  );
}
