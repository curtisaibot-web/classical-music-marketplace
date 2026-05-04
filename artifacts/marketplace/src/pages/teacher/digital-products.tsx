import { useState, useRef } from "react";
import {
  useGetMe,
  useUpdateDigitalProduct,
  useCreateDigitalProduct,
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Plus, FileText, Music, BookOpen, Edit, Upload, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";

const ACCEPTED_TYPES = ".pdf,.mp3,.mp4,.zip,.wav,.aiff,.mxl,.xml,.sib,.musx,.musxd";

interface DigitalProductFormState {
  title: string;
  description: string;
  category: string;
  instrument: string;
  difficulty: string;
  priceInCents: number;
  fileKey: string;
  fileSize: number;
  fileType: string;
}

const defaultForm: DigitalProductFormState = {
  title: "",
  description: "",
  category: "sheet_music",
  instrument: "",
  difficulty: "",
  priceInCents: 999,
  fileKey: "",
  fileSize: 0,
  fileType: "",
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "sheet_music": return <FileText className="h-5 w-5" />;
    case "backing_track": return <Music className="h-5 w-5" />;
    case "lesson_plan": return <BookOpen className="h-5 w-5" />;
    default: return <FileText className="h-5 w-5" />;
  }
};

const formatCategory = (cat: string) =>
  cat.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

interface UploadState {
  isUploading: boolean;
  progress: number;
  fileName: string;
  error: string | null;
}

function FileUploadField({
  value,
  onChange,
}: {
  value: { fileKey: string; fileSize: number; fileType: string; fileName?: string };
  onChange: (v: { fileKey: string; fileSize: number; fileType: string; fileName: string }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<UploadState>({
    isUploading: false,
    progress: 0,
    fileName: value.fileName ?? "",
    error: null,
  });

  const apiBase = import.meta.env.VITE_API_URL ?? "";

  const handleFile = async (file: File) => {
    setUpload({ isUploading: true, progress: 10, fileName: file.name, error: null });

    try {
      const urlResp = await fetch(`${apiBase}/api/storage/uploads/request-url`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: file.name,
          size: file.size,
          contentType: file.type || "application/octet-stream",
        }),
      });
      if (!urlResp.ok) {
        const data = await urlResp.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to request upload URL");
      }
      const { uploadURL, objectPath } = await urlResp.json() as { uploadURL: string; objectPath: string };

      setUpload((u) => ({ ...u, progress: 30 }));

      const putResp = await fetch(uploadURL, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || "application/octet-stream" },
      });
      if (!putResp.ok) throw new Error("Failed to upload file to storage");

      setUpload({ isUploading: false, progress: 100, fileName: file.name, error: null });
      onChange({ fileKey: objectPath, fileSize: file.size, fileType: file.type || "application/octet-stream", fileName: file.name });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setUpload({ isUploading: false, progress: 0, fileName: "", error: msg });
    }
  };

  return (
    <div className="space-y-2">
      <Label>File (PDF, MP3, ZIP…)</Label>
      <div
        className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files[0];
          if (f) handleFile(f);
        }}
      >
        {upload.isUploading ? (
          <div className="space-y-3">
            <Upload className="h-8 w-8 text-muted-foreground mx-auto animate-pulse" />
            <p className="text-sm text-muted-foreground">Uploading {upload.fileName}…</p>
            <Progress value={upload.progress} className="h-2 max-w-xs mx-auto" />
          </div>
        ) : value.fileKey && !upload.error ? (
          <div className="space-y-2">
            <CheckCircle2 className="h-8 w-8 text-green-600 mx-auto" />
            <p className="text-sm font-medium text-foreground">{upload.fileName || "File uploaded"}</p>
            <p className="text-xs text-muted-foreground">Click or drag to replace</p>
          </div>
        ) : (
          <div className="space-y-2">
            {upload.error ? (
              <>
                <AlertCircle className="h-8 w-8 text-destructive mx-auto" />
                <p className="text-sm text-destructive">{upload.error}</p>
              </>
            ) : (
              <Upload className="h-8 w-8 text-muted-foreground mx-auto" />
            )}
            <p className="text-sm text-muted-foreground">
              Drag & drop or <span className="text-primary font-medium">click to browse</span>
            </p>
            <p className="text-xs text-muted-foreground">PDF, MP3, ZIP, MusicXML, etc.</p>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES}
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

interface ProductFormProps {
  initial: DigitalProductFormState;
  onSubmit: (data: DigitalProductFormState) => void;
  onCancel: () => void;
  isPending: boolean;
  submitLabel: string;
}

function ProductForm({ initial, onSubmit, onCancel, isPending, submitLabel }: ProductFormProps) {
  const [form, setForm] = useState<DigitalProductFormState>(initial);
  const [fileName, setFileName] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.fileKey) {
      toast.error("Please upload a file before saving.");
      return;
    }
    onSubmit(form);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-2">
          <Label htmlFor="dp-title">Title</Label>
          <Input id="dp-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dp-category">Category</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
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
          <Label htmlFor="dp-price">Price ($)</Label>
          <Input
            id="dp-price"
            type="number"
            min="0"
            step="0.01"
            value={(form.priceInCents / 100).toFixed(2)}
            onChange={(e) => setForm({ ...form, priceInCents: Math.round(Number(e.target.value) * 100) })}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dp-instrument">Instrument</Label>
          <Input id="dp-instrument" value={form.instrument} onChange={(e) => setForm({ ...form, instrument: e.target.value })} placeholder="e.g. Piano, Violin" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dp-difficulty">Difficulty</Label>
          <Select value={form.difficulty || "__none__"} onValueChange={(v) => setForm({ ...form, difficulty: v === "__none__" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Any level</SelectItem>
              <SelectItem value="beginner">Beginner</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="advanced">Advanced</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-2">
          <Label htmlFor="dp-desc">Description</Label>
          <Textarea id="dp-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
        </div>
        <div className="col-span-2">
          <FileUploadField
            value={{ fileKey: form.fileKey, fileSize: form.fileSize, fileType: form.fileType, fileName }}
            onChange={(v) => {
              setForm({ ...form, fileKey: v.fileKey, fileSize: v.fileSize, fileType: v.fileType });
              setFileName(v.fileName);
            }}
          />
        </div>
      </div>
      <DialogFooter className="pt-4 border-t border-border">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" disabled={isPending || !form.fileKey}>
          {isPending ? "Saving…" : submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface DigitalProduct {
  id: number;
  title: string;
  description?: string | null;
  category: string;
  instrument?: string | null;
  difficulty?: string | null;
  priceInCents: number;
  fileKey?: string | null;
  fileSize?: number | null;
  fileType?: string | null;
  downloadCount: number;
  isPublished: boolean;
  listingId: number;
  teacherId: string;
  createdAt: string | Date;
}

export default function TeacherDigitalProducts() {
  const { data: user } = useGetMe();
  const queryClient = useQueryClient();
  const createProduct = useCreateDigitalProduct();
  const updateProduct = useUpdateDigitalProduct();

  const apiBase = import.meta.env.VITE_API_URL ?? "";

  const { data: productsData, isLoading } = useQuery<{ products: DigitalProduct[]; total: number }>({
    queryKey: ["teacher-digital-products", user?.id],
    queryFn: async () => {
      const resp = await fetch(`${apiBase}/api/digital-products/mine?limit=50&offset=0`, {
        credentials: "include",
      });
      if (!resp.ok) throw new Error("Failed to load products");
      return resp.json();
    },
    enabled: !!user?.id,
  });

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<DigitalProduct | null>(null);

  const handleCreate = (data: DigitalProductFormState) => {
    createProduct.mutate({
      data: {
        title: data.title,
        description: data.description || undefined,
        category: data.category,
        instrument: data.instrument || undefined,
        difficulty: data.difficulty || undefined,
        priceInCents: data.priceInCents,
        fileKey: data.fileKey || undefined,
        fileSize: data.fileSize || undefined,
        fileType: data.fileType || undefined,
        isPublished: true,
        listingId: 0,
      } as Parameters<typeof createProduct.mutate>[0]["data"],
    }, {
      onSuccess: () => {
        toast.success("Product created and published!");
        setIsCreateOpen(false);
        queryClient.invalidateQueries({ queryKey: ["teacher-digital-products", user?.id] });
      },
      onError: () => toast.error("Failed to create product"),
    });
  };

  const handleUpdate = (data: DigitalProductFormState) => {
    if (!editingProduct) return;
    updateProduct.mutate({
      id: editingProduct.id,
      data: {
        title: data.title,
        description: data.description || undefined,
        instrument: data.instrument || undefined,
        difficulty: data.difficulty || undefined,
        priceInCents: data.priceInCents,
        fileKey: data.fileKey || undefined,
        fileSize: data.fileSize || undefined,
        fileType: data.fileType || undefined,
      },
    }, {
      onSuccess: () => {
        toast.success("Product updated!");
        setEditingProduct(null);
        queryClient.invalidateQueries({ queryKey: ["teacher-digital-products", user?.id] });
      },
      onError: () => toast.error("Failed to update product"),
    });
  };

  const teacherProducts = productsData?.products?.filter((p) => p.teacherId === user?.id) ?? [];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">Digital Products</h1>
            <p className="text-muted-foreground mt-1">Upload and manage your sheet music, lesson plans, and backing tracks.</p>
          </div>
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Product
          </Button>
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
          ) : !teacherProducts.length ? (
            <div className="text-center py-20 bg-muted/30 rounded-xl border border-dashed border-border">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-medium text-foreground mb-2">No digital products yet</h3>
              <p className="text-muted-foreground mb-6">Upload sheet music, lesson plans, or backing tracks to sell.</p>
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus className="h-4 w-4 mr-2" /> Create Your First Product
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {teacherProducts.map((product) => (
                <Card key={product.id} className="border-border overflow-hidden">
                  <CardContent className="p-0 flex flex-col sm:flex-row">
                    <div className="p-6 bg-muted/30 border-b sm:border-b-0 sm:border-r border-border shrink-0 flex items-center justify-center sm:w-28">
                      <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                        {getCategoryIcon(product.category)}
                      </div>
                    </div>
                    <div className="p-6 flex-1 flex flex-col justify-between">
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-[10px] tracking-wider uppercase px-2 py-0.5 bg-background">
                              {formatCategory(product.category)}
                            </Badge>
                            {product.isPublished ? (
                              <Badge className="text-[10px] tracking-wider uppercase px-2 py-0.5 bg-green-100 text-green-800 border-green-200">Published</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-[10px] tracking-wider uppercase px-2 py-0.5">Draft</Badge>
                            )}
                            {product.fileKey && (
                              <Badge variant="outline" className="text-[10px] tracking-wider uppercase px-2 py-0.5 text-blue-700 border-blue-200 bg-blue-50">
                                File Ready
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-semibold text-lg text-foreground truncate">{product.title}</h3>
                          <p className="text-sm text-muted-foreground mt-0.5 line-clamp-1">{product.description || "No description."}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="shrink-0"
                          onClick={() => setEditingProduct(product)}
                        >
                          <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
                        </Button>
                      </div>
                      <div className="mt-4 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-2 text-sm">
                        <div className="flex flex-wrap gap-4 text-muted-foreground">
                          {product.instrument && <span>{product.instrument}</span>}
                          {product.difficulty && <span className="capitalize">{product.difficulty}</span>}
                          <span className="flex items-center gap-1">
                            <Download className="h-3.5 w-3.5" />
                            {product.downloadCount} downloads
                          </span>
                        </div>
                        <div className="font-bold text-foreground text-base">
                          ${(product.priceInCents / 100).toFixed(2)}
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

      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">New Digital Product</DialogTitle>
          </DialogHeader>
          <ProductForm
            initial={defaultForm}
            onSubmit={handleCreate}
            onCancel={() => setIsCreateOpen(false)}
            isPending={createProduct.isPending}
            submitLabel="Create & Publish"
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingProduct} onOpenChange={(open) => { if (!open) setEditingProduct(null); }}>
        <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Edit Product</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <ProductForm
              initial={{
                title: editingProduct.title,
                description: editingProduct.description ?? "",
                category: editingProduct.category,
                instrument: editingProduct.instrument ?? "",
                difficulty: editingProduct.difficulty ?? "",
                priceInCents: editingProduct.priceInCents,
                fileKey: editingProduct.fileKey ?? "",
                fileSize: editingProduct.fileSize ?? 0,
                fileType: editingProduct.fileType ?? "",
              }}
              onSubmit={handleUpdate}
              onCancel={() => setEditingProduct(null)}
              isPending={updateProduct.isPending}
              submitLabel="Save Changes"
            />
          )}
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
