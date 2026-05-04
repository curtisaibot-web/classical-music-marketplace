import { useState, useRef } from "react";
import {
  useGetTeacherListings,
  getGetTeacherListingsQueryKey,
  useCreateListing,
  useUpdateListing,
  useDeleteListing,
  useGetMe,
  useCreateDigitalProduct,
  useUpdateDigitalProduct,
  CreateListingBodyType,
} from "@workspace/api-client-react";
import { Navbar } from "@/components/layout/navbar";
import { Footer } from "@/components/layout/footer";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Edit, Trash2, MoreVertical, Music, Video, ShoppingBag, Camera, Loader2, ImageIcon, FileUp, FileCheck, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

interface ListingFormState {
  title: string;
  type: CreateListingBodyType;
  priceInCents: number;
  description: string;
  instrument: string;
  durationMinutes: number;
  imageUrl: string;
  category: string;
  difficulty: string;
  fileKey: string;
  fileSize: number | null;
  fileType: string;
}

const defaultForm: ListingFormState = {
  title: "",
  type: CreateListingBodyType.lesson,
  priceInCents: 5000,
  description: "",
  instrument: "",
  durationMinutes: 60,
  imageUrl: "",
  category: "sheet_music",
  difficulty: "",
  fileKey: "",
  fileSize: null,
  fileType: "",
};

const ALLOWED_FILE_TYPES: Record<string, string> = {
  "application/pdf": "PDF",
  "audio/mpeg": "MP3",
  "audio/mp3": "MP3",
  "application/zip": "ZIP",
  "application/x-zip-compressed": "ZIP",
  "audio/wav": "WAV",
  "audio/flac": "FLAC",
};

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

interface FileUploadFieldProps {
  value: { fileKey: string; fileSize: number | null; fileType: string };
  onChange: (v: { fileKey: string; fileSize: number | null; fileType: string }) => void;
}

function FileUploadField({ value, onChange }: FileUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasFile = Boolean(value.fileKey);

  const handleFile = async (file: File) => {
    const contentType = file.type || "application/octet-stream";
    if (!ALLOWED_FILE_TYPES[contentType]) {
      toast.error("Unsupported file type. Please upload a PDF, MP3, WAV, FLAC, or ZIP file.");
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File must be smaller than 100 MB.");
      return;
    }

    setIsUploading(true);
    try {
      const urlResp = await fetch("/api/storage/uploads/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType,
        }),
      });

      if (!urlResp.ok) {
        const data = await urlResp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to request upload URL");
      }

      const { uploadURL, objectPath } = await urlResp.json() as { uploadURL: string; objectPath: string };

      const putResp = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": contentType },
      });

      if (!putResp.ok) throw new Error("Failed to upload file to storage");

      onChange({ fileKey: objectPath, fileSize: file.size, fileType: ALLOWED_FILE_TYPES[contentType] ?? "FILE" });
      setUploadedName(file.name);
      toast.success("File uploaded successfully.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    onChange({ fileKey: "", fileSize: null, fileType: "" });
    setUploadedName(null);
  };

  const displayName = uploadedName ?? (hasFile ? `Previously uploaded file (${value.fileType || "FILE"})` : null);

  return (
    <div className="space-y-2">
      <Label>
        Product File <span className="text-muted-foreground font-normal">(PDF, MP3, WAV, FLAC, ZIP · max 100 MB)</span>
      </Label>
      {displayName ? (
        <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-muted/30">
          <FileCheck className="h-5 w-5 text-primary shrink-0" />
          <span className="text-sm text-foreground flex-1 truncate">{displayName}</span>
          <button
            type="button"
            onClick={handleClear}
            className="text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Remove file"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <div
          className="border border-dashed border-border rounded-lg p-6 flex flex-col items-center gap-2 cursor-pointer hover:border-primary/50 hover:bg-muted/20 transition-colors"
          onClick={() => !isUploading && fileInputRef.current?.click()}
        >
          {isUploading ? (
            <>
              <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
              <p className="text-sm text-muted-foreground">Uploading…</p>
            </>
          ) : (
            <>
              <FileUp className="h-8 w-8 text-muted-foreground opacity-60" />
              <p className="text-sm text-muted-foreground">Click to upload your file</p>
              <p className="text-xs text-muted-foreground">PDF, MP3, WAV, FLAC, ZIP</p>
            </>
          )}
        </div>
      )}
      {!displayName && !isUploading && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          className="w-full"
        >
          <FileUp className="h-4 w-4 mr-2" />
          Choose File
        </Button>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.mp3,.wav,.flac,.zip"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

interface ImageUploadFieldProps {
  value: string;
  onChange: (url: string) => void;
}

function ImageUploadField({ value, onChange }: ImageUploadFieldProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(value || null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be smaller than 5 MB.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return objectUrl;
    });
    setIsUploading(true);

    try {
      const urlResp = await fetch("/api/storage/images/request-url", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type,
        }),
      });

      if (!urlResp.ok) {
        const data = await urlResp.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Failed to request upload URL");
      }

      const { uploadURL, objectPath } = await urlResp.json() as { uploadURL: string; objectPath: string };

      const putResp = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });

      if (!putResp.ok) throw new Error("Failed to upload image");

      URL.revokeObjectURL(objectUrl);
      const servingUrl = `/api/storage${objectPath}`;
      onChange(servingUrl);
      setPreview(null);
      toast.success("Image uploaded.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      URL.revokeObjectURL(objectUrl);
      setPreview(value || null);
      toast.error(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const displayUrl = preview || value || null;

  return (
    <div className="space-y-2">
      <Label>Listing Image <span className="text-muted-foreground font-normal">(optional)</span></Label>
      <div
        className="border border-border rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group"
        onClick={() => !isUploading && fileInputRef.current?.click()}
      >
        {displayUrl ? (
          <div className="relative aspect-video bg-muted">
            <img
              src={displayUrl}
              alt="Listing preview"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              {isUploading ? (
                <Loader2 className="h-8 w-8 text-white animate-spin" />
              ) : (
                <Camera className="h-8 w-8 text-white" />
              )}
            </div>
          </div>
        ) : (
          <div className="aspect-video bg-muted/40 flex flex-col items-center justify-center gap-2">
            {isUploading ? (
              <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
            ) : (
              <>
                <ImageIcon className="h-8 w-8 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">Click to upload an image</p>
                <p className="text-xs text-muted-foreground">JPG, PNG, WebP · Max 5 MB</p>
              </>
            )}
          </div>
        )}
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export default function TeacherListings() {
  const { data: user } = useGetMe();
  const queryClient = useQueryClient();

  const { data: listingsData, isLoading } = useGetTeacherListings(user?.id || "", {
    query: { enabled: !!user?.id, queryKey: getGetTeacherListingsQueryKey(user?.id || "") }
  });

  const createListing = useCreateListing();
  const updateListing = useUpdateListing();
  const deleteListing = useDeleteListing();
  const createDigitalProduct = useCreateDigitalProduct();
  const updateDigitalProduct = useUpdateDigitalProduct();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [formData, setFormData] = useState<ListingFormState>(defaultForm);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingDigitalProductId, setEditingDigitalProductId] = useState<number | null>(null);
  const [editData, setEditData] = useState<ListingFormState>(defaultForm);

  const isDigitalProduct = (type: string) => type === "digital_product";

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();

    if (isDigitalProduct(formData.type)) {
      createDigitalProduct.mutate({
        data: {
          title: formData.title,
          description: formData.description || undefined,
          category: formData.category || "other",
          instrument: formData.instrument || undefined,
          difficulty: formData.difficulty || undefined,
          priceInCents: formData.priceInCents,
          fileKey: formData.fileKey || undefined,
          fileSize: formData.fileSize ?? undefined,
          fileType: formData.fileType || undefined,
          isPublished: true,
        }
      }, {
        onSuccess: () => {
          toast.success("Digital product created successfully");
          setIsCreateOpen(false);
          setFormData(defaultForm);
          queryClient.invalidateQueries({ queryKey: getGetTeacherListingsQueryKey(user?.id || "") });
        },
        onError: () => toast.error("Failed to create digital product")
      });
    } else {
      createListing.mutate({
        data: {
          title: formData.title,
          type: formData.type,
          priceInCents: formData.priceInCents,
          description: formData.description,
          instrument: formData.instrument,
          durationMinutes: formData.durationMinutes,
          imageUrl: formData.imageUrl || undefined,
          skillLevel: "all",
        }
      }, {
        onSuccess: () => {
          toast.success("Listing created successfully");
          setIsCreateOpen(false);
          setFormData(defaultForm);
          queryClient.invalidateQueries({ queryKey: getGetTeacherListingsQueryKey(user?.id || "") });
        },
        onError: () => toast.error("Failed to create listing")
      });
    }
  };

  const openEdit = (listing: NonNullable<typeof listingsData>["listings"][number]) => {
    setEditData({
      title: listing.title,
      type: listing.type as CreateListingBodyType,
      priceInCents: listing.priceInCents,
      description: listing.description ?? "",
      instrument: listing.instrument ?? "",
      durationMinutes: listing.durationMinutes ?? 60,
      imageUrl: listing.imageUrl ?? "",
      category: "sheet_music",
      difficulty: "",
      fileKey: "",
      fileSize: null,
      fileType: "",
    });
    setEditingId(listing.id);
    setEditingDigitalProductId(listing.digitalProductId ?? null);
  };

  const handleEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId === null) return;

    if (isDigitalProduct(editData.type) && editingDigitalProductId !== null) {
      const updatePayload: Record<string, unknown> = {
        title: editData.title,
        description: editData.description || undefined,
        instrument: editData.instrument || undefined,
        priceInCents: editData.priceInCents,
        difficulty: editData.difficulty || undefined,
      };
      if (editData.fileKey) {
        updatePayload.fileKey = editData.fileKey;
        updatePayload.fileSize = editData.fileSize ?? undefined;
        updatePayload.fileType = editData.fileType || undefined;
      }

      updateDigitalProduct.mutate({
        id: editingDigitalProductId,
        data: updatePayload as Parameters<typeof updateDigitalProduct.mutate>[0]["data"],
      }, {
        onSuccess: () => {
          toast.success("Digital product updated");
          setEditingId(null);
          setEditingDigitalProductId(null);
          queryClient.invalidateQueries({ queryKey: getGetTeacherListingsQueryKey(user?.id || "") });
        },
        onError: () => toast.error("Failed to update digital product")
      });
    } else {
      updateListing.mutate({
        id: editingId,
        data: {
          title: editData.title,
          description: editData.description,
          instrument: editData.instrument,
          priceInCents: editData.priceInCents,
          durationMinutes: editData.durationMinutes,
          imageUrl: editData.imageUrl || undefined,
        }
      }, {
        onSuccess: () => {
          toast.success("Listing updated");
          setEditingId(null);
          setEditingDigitalProductId(null);
          queryClient.invalidateQueries({ queryKey: getGetTeacherListingsQueryKey(user?.id || "") });
        },
        onError: () => toast.error("Failed to update listing")
      });
    }
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this listing?")) {
      deleteListing.mutate({ id }, {
        onSuccess: () => {
          toast.success("Listing deleted");
          queryClient.invalidateQueries({ queryKey: getGetTeacherListingsQueryKey(user?.id || "") });
        },
        onError: () => toast.error("Failed to delete listing")
      });
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'lesson': return <Music className="h-5 w-5" />;
      case 'masterclass': return <Video className="h-5 w-5" />;
      case 'digital_product': return <ShoppingBag className="h-5 w-5" />;
      default: return <Music className="h-5 w-5" />;
    }
  };

  const isCreatePending = formData.type === "digital_product"
    ? createDigitalProduct.isPending
    : createListing.isPending;

  const isEditPending = editData.type === "digital_product"
    ? updateDigitalProduct.isPending
    : updateListing.isPending;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">My Listings</h1>
            <p className="text-muted-foreground mt-1">Manage your lessons, products, and events.</p>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={(open) => { setIsCreateOpen(open); if (!open) setFormData(defaultForm); }}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> New Listing</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="font-serif text-2xl">Create New Listing</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="title">Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="type">Type</Label>
                    <Select
                      value={formData.type}
                      onValueChange={(v: CreateListingBodyType) => setFormData({ ...defaultForm, title: formData.title, type: v })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lesson">Private Lesson</SelectItem>
                        <SelectItem value="event">Event / Performance</SelectItem>
                        <SelectItem value="masterclass">Masterclass</SelectItem>
                        <SelectItem value="digital_product">Digital Product</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="price">Price ($)</Label>
                    <Input
                      id="price"
                      type="number"
                      min="0"
                      step="1"
                      value={formData.priceInCents / 100}
                      onChange={(e) => setFormData({ ...formData, priceInCents: Math.round(Number(e.target.value) * 100) })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="instrument">Instrument</Label>
                    <Input
                      id="instrument"
                      value={formData.instrument}
                      onChange={(e) => setFormData({ ...formData, instrument: e.target.value })}
                    />
                  </div>

                  {isDigitalProduct(formData.type) ? (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="category">Category</Label>
                        <Select
                          value={formData.category}
                          onValueChange={(v) => setFormData({ ...formData, category: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="sheet_music">Sheet Music</SelectItem>
                            <SelectItem value="lesson_plan">Lesson Plan</SelectItem>
                            <SelectItem value="backing_track">Backing Track</SelectItem>
                            <SelectItem value="arrangement">Arrangement</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="difficulty">Difficulty <span className="text-muted-foreground font-normal">(optional)</span></Label>
                        <Select
                          value={formData.difficulty || "__none__"}
                          onValueChange={(v) => setFormData({ ...formData, difficulty: v === "__none__" ? "" : v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Not specified</SelectItem>
                            <SelectItem value="beginner">Beginner</SelectItem>
                            <SelectItem value="intermediate">Intermediate</SelectItem>
                            <SelectItem value="advanced">Advanced</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          rows={3}
                        />
                      </div>
                      <div className="col-span-2">
                        <FileUploadField
                          value={{ fileKey: formData.fileKey, fileSize: formData.fileSize, fileType: formData.fileType }}
                          onChange={(v) => setFormData({ ...formData, ...v })}
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="duration">Duration (minutes)</Label>
                        <Input
                          id="duration"
                          type="number"
                          value={formData.durationMinutes}
                          onChange={(e) => setFormData({ ...formData, durationMinutes: Number(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-2 col-span-2">
                        <Label htmlFor="description">Description</Label>
                        <Textarea
                          id="description"
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          rows={3}
                        />
                      </div>
                      <div className="col-span-2">
                        <ImageUploadField
                          value={formData.imageUrl}
                          onChange={(url) => setFormData({ ...formData, imageUrl: url })}
                        />
                      </div>
                    </>
                  )}
                </div>
                <DialogFooter className="pt-4 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => { setIsCreateOpen(false); setFormData(defaultForm); }}>Cancel</Button>
                  <Button type="submit" disabled={isCreatePending}>
                    {isCreatePending ? "Creating..." : "Create Listing"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-12">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="animate-pulse bg-muted rounded-xl h-24" />
              ))}
            </div>
          ) : !listingsData?.listings.length ? (
            <div className="text-center py-20 bg-muted/30 rounded-xl border border-border border-dashed">
              <ShoppingBag className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-medium text-foreground mb-2">No listings yet</h3>
              <p className="text-muted-foreground mb-6">Create your first listing to start earning.</p>
              <Button onClick={() => setIsCreateOpen(true)}>Create Listing</Button>
            </div>
          ) : (
            <div className="space-y-4">
              {listingsData.listings.map((listing) => (
                <Card key={listing.id} className="border-border overflow-hidden">
                  <CardContent className="p-0 flex flex-col sm:flex-row">
                    <div className="shrink-0 sm:w-32 overflow-hidden bg-muted/30 border-b sm:border-b-0 sm:border-r border-border">
                      {listing.imageUrl ? (
                        <img
                          src={listing.imageUrl}
                          alt={listing.title}
                          className="w-full h-24 sm:h-full object-cover"
                        />
                      ) : (
                        <div className="h-24 sm:h-full flex items-center justify-center">
                          <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                            {getIcon(listing.type)}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <Badge variant="outline" className="mb-2 uppercase text-[10px] tracking-wider px-2 py-0.5 bg-background">{listing.type.replace('_', ' ')}</Badge>
                          <h3 className="font-semibold text-lg text-foreground truncate max-w-sm">{listing.title}</h3>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-1">{listing.description || "No description."}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2"><MoreVertical className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem className="cursor-pointer" onClick={() => openEdit(listing)}>
                              <Edit className="mr-2 h-4 w-4" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10 cursor-pointer" onClick={() => handleDelete(listing.id)}>
                              <Trash2 className="mr-2 h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-4 pt-4 border-t border-border flex items-center justify-between text-sm">
                        <div className="text-muted-foreground">
                          {listing.instrument && <span className="mr-4 inline-block">{listing.instrument}</span>}
                          {listing.durationMinutes && <span>{listing.durationMinutes} min</span>}
                          {listing.type === 'digital_product' && !listing.digitalProductId && (
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600">
                              <ShoppingBag className="h-3 w-3" />
                              No file uploaded
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-foreground text-base">
                          ${(listing.priceInCents / 100).toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>

      <Dialog open={editingId !== null} onOpenChange={(open) => { if (!open) { setEditingId(null); setEditingDigitalProductId(null); } }}>
        <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Edit Listing</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleEdit} className="space-y-4 pt-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="edit-title">Title</Label>
                <Input
                  id="edit-title"
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price ($)</Label>
                <Input
                  id="edit-price"
                  type="number"
                  min="0"
                  step="1"
                  value={editData.priceInCents / 100}
                  onChange={(e) => setEditData({ ...editData, priceInCents: Math.round(Number(e.target.value) * 100) })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-instrument">Instrument</Label>
                <Input
                  id="edit-instrument"
                  value={editData.instrument}
                  onChange={(e) => setEditData({ ...editData, instrument: e.target.value })}
                />
              </div>

              {isDigitalProduct(editData.type) ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-difficulty">Difficulty <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Select
                      value={editData.difficulty || "__none__"}
                      onValueChange={(v) => setEditData({ ...editData, difficulty: v === "__none__" ? "" : v })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select difficulty" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not specified</SelectItem>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="col-span-2">
                    <FileUploadField
                      value={{ fileKey: editData.fileKey, fileSize: editData.fileSize, fileType: editData.fileType }}
                      onChange={(v) => setEditData({ ...editData, ...v })}
                    />
                    {editingDigitalProductId && !editData.fileKey && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Upload a new file to replace the existing one, or leave empty to keep it.
                      </p>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="edit-duration">Duration (minutes)</Label>
                    <Input
                      id="edit-duration"
                      type="number"
                      value={editData.durationMinutes}
                      onChange={(e) => setEditData({ ...editData, durationMinutes: Number(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="edit-description">Description</Label>
                    <Textarea
                      id="edit-description"
                      value={editData.description}
                      onChange={(e) => setEditData({ ...editData, description: e.target.value })}
                      rows={3}
                    />
                  </div>
                  <div className="col-span-2">
                    <ImageUploadField
                      value={editData.imageUrl}
                      onChange={(url) => setEditData({ ...editData, imageUrl: url })}
                    />
                  </div>
                </>
              )}
            </div>
            <DialogFooter className="pt-4 border-t border-border">
              <Button type="button" variant="outline" onClick={() => { setEditingId(null); setEditingDigitalProductId(null); }}>Cancel</Button>
              <Button type="submit" disabled={isEditPending}>
                {isEditPending ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
