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
import { Loader2, Music, Camera, Plus, Trash2, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";

interface UploadState {
  isUploading: boolean;
  error: string | null;
}

interface Recording {
  id: number;
  url: string;
  title: string;
  description: string | null;
  sortOrder: number;
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

  const [slugInput, setSlugInput] = useState("");
  const [slugLoading, setSlugLoading] = useState(false);

  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [newRecUrl, setNewRecUrl] = useState("");
  const [newRecTitle, setNewRecTitle] = useState("");
  const [newRecDesc, setNewRecDesc] = useState("");

  const [uploadState, setUploadState] = useState<UploadState>({ isUploading: false, error: null });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);

  const apiUrl = import.meta.env.VITE_API_URL ?? "";
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

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
      setSlugInput(profile.profileSlug || "");
      fetchRecordings(profile.userId);
    }
  }, [profile]);

  const fetchRecordings = async (teacherId: string) => {
    try {
      const res = await fetch(`${apiUrl}/api/teachers/${teacherId}/recordings`);
      if (res.ok) {
        const data = await res.json();
        setRecordings(data.recordings ?? []);
      }
    } catch {
      setRecordings([]);
    }
  };

  const handleSaveSlug = async () => {
    const slug = slugInput.trim().toLowerCase();
    if (!slug) { toast.error("Please enter a URL handle"); return; }
    if (!/^[a-z0-9-]{3,64}$/.test(slug)) {
      toast.error("Handle must be 3–64 characters: lowercase letters, numbers and hyphens only");
      return;
    }
    setSlugLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/teachers/me/slug`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      if (res.status === 409) {
        toast.error("That handle is already taken. Please choose another.");
      } else if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? "Failed to save handle");
      } else {
        toast.success("Profile URL handle saved!");
      }
    } catch {
      toast.error("Network error saving handle");
    } finally {
      setSlugLoading(false);
    }
  };

  const handleAddRecording = async () => {
    if (!newRecUrl.trim() || !newRecTitle.trim()) {
      toast.error("URL and title are required");
      return;
    }
    setRecLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/teachers/me/recordings`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: newRecUrl.trim(), title: newRecTitle.trim(), description: newRecDesc.trim() || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error((err as { error?: string }).error ?? "Failed to add recording");
      } else {
        const rec = await res.json();
        setRecordings(prev => [...prev, rec]);
        setNewRecUrl("");
        setNewRecTitle("");
        setNewRecDesc("");
        toast.success("Recording added!");
      }
    } catch {
      toast.error("Network error adding recording");
    } finally {
      setRecLoading(false);
    }
  };

  const handleDeleteRecording = async (id: number) => {
    try {
      const res = await fetch(`${apiUrl}/api/teachers/me/recordings/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        toast.error("Failed to delete recording");
      } else {
        setRecordings(prev => prev.filter(r => r.id !== id));
        toast.success("Recording removed");
      }
    } catch {
      toast.error("Network error deleting recording");
    }
  };

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

  const profileUrl = slugInput.trim()
    ? `${window.location.origin}${basePath}/musicians/${slugInput.trim().toLowerCase()}`
    : null;

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
            <p className="text-muted-foreground mt-1">Update your public musician profile.</p>
          </div>
        </div>

        <main className="flex-1 container mx-auto px-4 py-12 max-w-3xl">
          <div className="space-y-8">

            {/* Profile URL Handle */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="font-serif">Public Profile URL</CardTitle>
                <CardDescription>Choose a unique handle for your public musician page.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-3 items-end">
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="slug">URL Handle</Label>
                    <div className="flex items-center border border-input rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                      <span className="px-3 py-2 bg-muted text-muted-foreground text-sm border-r border-input whitespace-nowrap">
                        {window.location.origin}{basePath}/musicians/
                      </span>
                      <input
                        id="slug"
                        type="text"
                        value={slugInput}
                        onChange={(e) => setSlugInput(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        placeholder="your-handle"
                        className="flex-1 px-3 py-2 text-sm bg-background outline-none"
                        maxLength={64}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Lowercase letters, numbers and hyphens only. Min 3 characters.</p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveSlug}
                    disabled={slugLoading || !slugInput.trim()}
                    className="shrink-0"
                  >
                    {slugLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Save Handle
                  </Button>
                </div>
                {profileUrl && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                    <LinkIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="truncate">{profileUrl}</span>
                    <button
                      type="button"
                      className="shrink-0 text-primary hover:underline"
                      onClick={() => {
                        navigator.clipboard.writeText(profileUrl);
                        toast.success("Link copied to clipboard!");
                      }}
                    >
                      Copy
                    </button>
                  </div>
                )}
              </CardContent>
            </Card>

            <form onSubmit={handleSubmit}>
              <div className="space-y-8">

                <Card className="border-border">
                  <CardHeader>
                    <CardTitle className="font-serif">Profile Photo</CardTitle>
                    <CardDescription>This photo appears on your public profile and musician cards.</CardDescription>
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

            {/* Recordings — managed independently from the main form */}
            <Card className="border-border">
              <CardHeader>
                <CardTitle className="font-serif">Recordings</CardTitle>
                <CardDescription>Share up to 5 audio recordings on your public profile. Link directly to audio files (MP3, WAV, etc.).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {recordings.length > 0 && (
                  <div className="space-y-3">
                    {recordings.map((rec) => (
                      <div key={rec.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-muted/20">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-foreground">{rec.title}</p>
                          {rec.description && <p className="text-xs text-muted-foreground mt-0.5">{rec.description}</p>}
                          <p className="text-xs text-muted-foreground truncate mt-1">{rec.url}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteRecording(rec.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {recordings.length < 5 && (
                  <div className="space-y-3 border border-dashed border-border rounded-lg p-4">
                    <p className="text-sm font-medium text-foreground">Add Recording ({recordings.length}/5)</p>
                    <div className="space-y-2">
                      <Input
                        placeholder="Title (e.g. Chopin Nocturne Op. 9 No. 2)"
                        value={newRecTitle}
                        onChange={(e) => setNewRecTitle(e.target.value)}
                      />
                      <Input
                        placeholder="Audio URL (direct link to MP3, WAV, or audio file)"
                        value={newRecUrl}
                        onChange={(e) => setNewRecUrl(e.target.value)}
                      />
                      <Input
                        placeholder="Description (optional)"
                        value={newRecDesc}
                        onChange={(e) => setNewRecDesc(e.target.value)}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleAddRecording}
                      disabled={recLoading || !newRecUrl.trim() || !newRecTitle.trim()}
                    >
                      {recLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                      Add Recording
                    </Button>
                  </div>
                )}

                {recordings.length >= 5 && (
                  <p className="text-xs text-muted-foreground">You've reached the maximum of 5 recordings. Remove one to add another.</p>
                )}
              </CardContent>
            </Card>

          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}
