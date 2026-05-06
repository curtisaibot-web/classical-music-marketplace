import { useState, useRef, useCallback } from "react";
import { Link } from "wouter";
import { useGetMe } from "@workspace/api-client-react";
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
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Music, Plus, Edit, Upload, CheckCircle2, AlertCircle, Loader2,
  FileText, Play, DollarSign, Eye, EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { usePageMeta } from "@/hooks/use-page-meta";

const GENRES = ["Baroque", "Classical", "Romantic", "Contemporary", "Jazz", "Film", "Sacred", "Folk", "Other"];
const DIFFICULTIES = ["beginner", "intermediate", "advanced", "professional"];
const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced", professional: "Professional",
};
const LICENSE_TYPES = ["personal", "performance", "sync"] as const;
const LICENSE_LABELS: Record<string, string> = {
  personal: "Personal / Practice",
  performance: "Performance",
  sync: "Sync / Commercial",
};
const LICENSE_DESCRIPTIONS: Record<string, string> = {
  personal: "Private study only",
  performance: "Public concerts & recitals (perpetual)",
  sync: "Film, TV & commercial use (1-year)",
};

interface ScoreLicense {
  id?: number;
  licenseType: string;
  priceCents: number;
}

interface ComposerScore {
  id: number;
  title: string;
  instrumentation: string;
  difficulty: string;
  genre: string;
  durationSeconds?: number | null;
  description?: string | null;
  hasPreviewPdf?: boolean;
  hasFullPdf?: boolean;
  hasAudioDemo?: boolean;
  isActive: boolean;
  licenses: ScoreLicense[];
  salesCount: number;
  revenueCents: number;
}

interface FileUploadState {
  isUploading: boolean;
  progress: number;
  fileName: string;
  fileKey: string;
  error: string | null;
}

const emptyUpload: FileUploadState = { isUploading: false, progress: 0, fileName: "", fileKey: "", error: null };

function FileUploadField({
  label,
  accept,
  value,
  onChange,
  hint,
}: {
  label: string;
  accept: string;
  value: FileUploadState;
  onChange: (v: FileUploadState) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const apiBase = import.meta.env.VITE_API_URL ?? "";

  const handleFile = useCallback(async (file: File) => {
    onChange({ isUploading: true, progress: 0, fileName: file.name, fileKey: value.fileKey, error: null });

    try {
      const reqResp = await fetch(`${apiBase}/api/storage/uploads/request-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!reqResp.ok) {
        const d = await reqResp.json().catch(() => ({})) as { error?: string };
        throw new Error(d.error ?? "Failed to get upload URL");
      }
      const { uploadURL, objectPath } = await reqResp.json() as { uploadURL: string; objectPath: string };

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onChange({ isUploading: true, progress: Math.round((e.loaded / e.total) * 100), fileName: file.name, fileKey: value.fileKey, error: null });
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("Upload failed")));
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.open("PUT", uploadURL);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      onChange({ isUploading: false, progress: 100, fileName: file.name, fileKey: objectPath, error: null });
    } catch (err) {
      onChange({ isUploading: false, progress: 0, fileName: file.name, fileKey: value.fileKey, error: (err as Error).message });
    }
  }, [apiBase, onChange, value.fileKey]);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }} />
      {value.fileKey && !value.isUploading ? (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-green-200 bg-green-50 text-sm">
          <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
          <span className="text-green-700 truncate flex-1">{value.fileName || "File uploaded"}</span>
          <button className="text-xs text-muted-foreground hover:text-foreground shrink-0" onClick={() => inputRef.current?.click()}>Replace</button>
        </div>
      ) : value.isUploading ? (
        <div className="p-2.5 rounded-lg border border-border space-y-1.5">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
            <span className="truncate">{value.fileName}</span>
          </div>
          <Progress value={value.progress} className="h-1.5" />
        </div>
      ) : value.error ? (
        <div className="flex items-center gap-2 p-2.5 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-destructive truncate flex-1">{value.error}</span>
          <button className="text-xs text-muted-foreground hover:text-foreground shrink-0" onClick={() => inputRef.current?.click()}>Retry</button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full flex items-center gap-2 p-3 rounded-lg border-2 border-dashed border-border hover:border-primary/40 transition-colors text-sm text-muted-foreground"
        >
          <Upload className="h-4 w-4 shrink-0" />
          Click to upload
        </button>
      )}
    </div>
  );
}

const defaultLicenses: Array<{ licenseType: string; priceCents: number; enabled: boolean }> = [
  { licenseType: "personal", priceCents: 1500, enabled: true },
  { licenseType: "performance", priceCents: 4500, enabled: false },
  { licenseType: "sync", priceCents: 14900, enabled: false },
];

interface FormState {
  title: string;
  instrumentation: string;
  genre: string;
  difficulty: string;
  durationSeconds: string;
  description: string;
  licenses: Array<{ licenseType: string; priceCents: number; enabled: boolean }>;
  fullPdf: FileUploadState;
  previewPdf: FileUploadState;
  audioDemo: FileUploadState;
}

const emptyForm = (): FormState => ({
  title: "",
  instrumentation: "",
  genre: "Classical",
  difficulty: "intermediate",
  durationSeconds: "",
  description: "",
  licenses: defaultLicenses.map((l) => ({ ...l })),
  fullPdf: { ...emptyUpload },
  previewPdf: { ...emptyUpload },
  audioDemo: { ...emptyUpload },
});

export default function MyScores() {
  usePageMeta({ title: "My Scores" });
  const apiBase = import.meta.env.VITE_API_URL ?? "";
  const qc = useQueryClient();
  const { data: me } = useGetMe();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingScore, setEditingScore] = useState<ComposerScore | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [isSaving, setIsSaving] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["scores", "mine"],
    queryFn: () =>
      fetch(`${apiBase}/api/scores/mine`, { credentials: "include" })
        .then((r) => r.ok ? r.json() : Promise.reject(r))
        .then((d: { scores: ComposerScore[] }) => d.scores),
    enabled: !!me,
  });

  const scores = data ?? [];

  function openCreate() {
    setEditingScore(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(s: ComposerScore) {
    setEditingScore(s);
    setForm({
      title: s.title,
      instrumentation: s.instrumentation,
      genre: s.genre,
      difficulty: s.difficulty,
      durationSeconds: s.durationSeconds ? String(Math.round(s.durationSeconds / 60)) : "",
      description: s.description ?? "",
      licenses: LICENSE_TYPES.map((lt) => {
        const existing = s.licenses.find((l) => l.licenseType === lt);
        return { licenseType: lt, priceCents: existing?.priceCents ?? defaultLicenses.find((d) => d.licenseType === lt)!.priceCents, enabled: !!existing };
      }),
      fullPdf: s.hasFullPdf ? { ...emptyUpload, fileKey: "__existing__", fileName: "Current PDF" } : { ...emptyUpload },
      previewPdf: s.hasPreviewPdf ? { ...emptyUpload, fileKey: "__existing__", fileName: "Current preview" } : { ...emptyUpload },
      audioDemo: s.hasAudioDemo ? { ...emptyUpload, fileKey: "__existing__", fileName: "Current audio demo" } : { ...emptyUpload },
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    const activeLicenses = form.licenses.filter((l) => l.enabled);
    if (!form.title.trim()) { toast.error("Title is required"); return; }
    if (!form.instrumentation.trim()) { toast.error("Instrumentation is required"); return; }
    if (!form.genre) { toast.error("Genre is required"); return; }
    if (activeLicenses.length === 0) { toast.error("At least one license tier must be enabled"); return; }
    if (!editingScore && !form.fullPdf.fileKey) { toast.error("Full score PDF is required"); return; }
    if (form.fullPdf.isUploading || form.previewPdf.isUploading || form.audioDemo.isUploading) {
      toast.error("Please wait for all uploads to complete"); return;
    }

    setIsSaving(true);
    try {
      const body: Record<string, unknown> = {
        title: form.title.trim(),
        instrumentation: form.instrumentation.trim(),
        genre: form.genre,
        difficulty: form.difficulty,
        description: form.description.trim() || null,
        durationSeconds: form.durationSeconds ? Number(form.durationSeconds) * 60 : null,
        licenses: activeLicenses.map((l) => ({ licenseType: l.licenseType, priceCents: l.priceCents })),
      };

      if (form.fullPdf.fileKey && form.fullPdf.fileKey !== "__existing__") body.fullPdfKey = form.fullPdf.fileKey;
      else if (!editingScore) body.fullPdfKey = form.fullPdf.fileKey;

      if (form.previewPdf.fileKey && form.previewPdf.fileKey !== "__existing__") body.previewPdfKey = form.previewPdf.fileKey;
      if (form.audioDemo.fileKey && form.audioDemo.fileKey !== "__existing__") body.audioDemoKey = form.audioDemo.fileKey;

      const url = editingScore ? `${apiBase}/api/scores/${editingScore.id}` : `${apiBase}/api/scores`;
      const method = editingScore ? "PUT" : "POST";

      const resp = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const result = await resp.json() as { error?: string };
      if (!resp.ok) { toast.error(result.error ?? "Failed to save score"); return; }

      toast.success(editingScore ? "Score updated" : "Score listed on marketplace!");
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["scores", "mine"] });
    } catch {
      toast.error("Failed to save score. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleActive(s: ComposerScore) {
    const resp = await fetch(`${apiBase}/api/scores/${s.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !s.isActive }),
    });
    if (resp.ok) {
      qc.invalidateQueries({ queryKey: ["scores", "mine"] });
      toast.success(s.isActive ? "Score unlisted" : "Score is now live on the marketplace");
    } else {
      toast.error("Failed to update score");
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <div className="bg-muted py-10 border-b border-border">
        <div className="container mx-auto px-4 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-3xl font-serif font-bold text-foreground">My Scores</h1>
            <p className="text-muted-foreground mt-1">List original compositions and earn royalties from 3 license tiers.</p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href="/scores">Browse Marketplace</Link>
            </Button>
            <Button onClick={openCreate} className="gap-2">
              <Plus className="h-4 w-4" />
              List a Score
            </Button>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-10">
        <div className="max-w-4xl mx-auto">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => <div key={i} className="animate-pulse bg-muted rounded-xl h-28 border border-border" />)}
            </div>
          ) : scores.length === 0 ? (
            <div className="text-center py-20 bg-muted/30 rounded-xl border border-border border-dashed">
              <Music className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-50" />
              <h3 className="text-xl font-medium text-foreground mb-2">No scores listed yet</h3>
              <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
                Start listing your original compositions. Set personal, performance, and sync license prices.
              </p>
              <Button onClick={openCreate} className="gap-2">
                <Plus className="h-4 w-4" />
                List Your First Score
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {scores.map((s) => (
                <Card key={s.id} className="border-border hover:shadow-sm transition-all">
                  <CardContent className="p-5">
                    <div className="flex flex-col sm:flex-row gap-4 items-start">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Music className="h-5 w-5" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-foreground">{s.title}</h3>
                          <Badge variant={s.isActive ? "default" : "secondary"} className="text-[10px]">
                            {s.isActive ? "Live" : "Unlisted"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-2">
                          {s.instrumentation} · {s.genre} · {DIFFICULTY_LABELS[s.difficulty] ?? s.difficulty}
                        </p>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {s.licenses.map((l) => (
                            <span key={l.licenseType} className="text-xs border border-border rounded-full px-2 py-0.5 text-muted-foreground">
                              {LICENSE_LABELS[l.licenseType] ?? l.licenseType} — ${(l.priceCents / 100).toFixed(2)}
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-3 text-xs text-muted-foreground">
                          {s.hasFullPdf && <span className="flex items-center gap-1"><FileText className="h-3 w-3" />Full PDF</span>}
                          {s.hasPreviewPdf && <span className="flex items-center gap-1"><FileText className="h-3 w-3" />Preview PDF</span>}
                          {s.hasAudioDemo && <span className="flex items-center gap-1"><Play className="h-3 w-3" />Audio Demo</span>}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-2 shrink-0">
                        <div className="text-right">
                          <p className="font-bold text-foreground">${(s.revenueCents / 100).toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">{s.salesCount} license{s.salesCount !== 1 ? "s" : ""} sold</p>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => toggleActive(s)} className="gap-1 text-xs h-7 px-2">
                            {s.isActive ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                            {s.isActive ? "Unlist" : "List"}
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEdit(s)} className="gap-1 text-xs h-7 px-2">
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button size="sm" variant="ghost" asChild className="text-xs h-7 px-2">
                            <Link href={`/scores/${s.id}`}>View</Link>
                          </Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{editingScore ? "Edit Score" : "List a New Score"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Title <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. String Quartet No. 2 in D minor"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Instrumentation <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="e.g. String Quartet, SATB, Piano"
                  value={form.instrumentation}
                  onChange={(e) => setForm((f) => ({ ...f, instrumentation: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Genre <span className="text-destructive">*</span></Label>
                <Select value={form.genre} onValueChange={(v) => setForm((f) => ({ ...f, genre: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Difficulty</Label>
                <Select value={form.difficulty} onValueChange={(v) => setForm((f) => ({ ...f, difficulty: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DIFFICULTIES.map((d) => <SelectItem key={d} value={d}>{DIFFICULTY_LABELS[d]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Duration (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  placeholder="e.g. 12"
                  value={form.durationSeconds}
                  onChange={(e) => setForm((f) => ({ ...f, durationSeconds: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  rows={3}
                  placeholder="Describe the piece, its history, instrumentation details, performance notes..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <div>
                <Label className="text-sm font-semibold">License Tiers <span className="text-destructive">*</span></Label>
                <p className="text-xs text-muted-foreground mt-0.5">Enable at least one tier and set the price.</p>
              </div>
              {form.licenses.map((lic, i) => (
                <div key={lic.licenseType} className={`rounded-lg border p-3 transition-colors ${lic.enabled ? "border-primary/30 bg-primary/3" : "border-border bg-muted/20"}`}>
                  <div className="flex items-center gap-3 mb-1">
                    <Switch
                      checked={lic.enabled}
                      onCheckedChange={(v) => setForm((f) => {
                        const ls = [...f.licenses];
                        ls[i] = { ...ls[i], enabled: v };
                        return { ...f, licenses: ls };
                      })}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{LICENSE_LABELS[lic.licenseType]}</p>
                      <p className="text-xs text-muted-foreground">{LICENSE_DESCRIPTIONS[lic.licenseType]}</p>
                    </div>
                    {lic.enabled && (
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          type="number"
                          min={1}
                          step={0.01}
                          className="w-24 h-8 text-sm"
                          value={(lic.priceCents / 100).toFixed(2)}
                          onChange={(e) => setForm((f) => {
                            const ls = [...f.licenses];
                            ls[i] = { ...ls[i], priceCents: Math.round(parseFloat(e.target.value || "0") * 100) };
                            return { ...f, licenses: ls };
                          })}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold">Files</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Buyers receive the full PDF after purchase. The preview PDF (optional) is publicly visible.
                </p>
              </div>
              <FileUploadField
                label="Full Score PDF *"
                accept=".pdf"
                hint="The complete score — only delivered after a license is purchased."
                value={form.fullPdf}
                onChange={(v) => setForm((f) => ({ ...f, fullPdf: v }))}
              />
              <FileUploadField
                label="Preview PDF (optional)"
                accept=".pdf"
                hint="First few pages shown publicly to buyers before purchase."
                value={form.previewPdf}
                onChange={(v) => setForm((f) => ({ ...f, previewPdf: v }))}
              />
              <FileUploadField
                label="Audio Demo (optional)"
                accept=".mp3,.wav,.ogg,.aac,.m4a"
                hint="A performance excerpt — helps buyers evaluate the piece."
                value={form.audioDemo}
                onChange={(v) => setForm((f) => ({ ...f, audioDemo: v }))}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2">
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingScore ? "Save Changes" : "List Score"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Footer />
    </div>
  );
}
