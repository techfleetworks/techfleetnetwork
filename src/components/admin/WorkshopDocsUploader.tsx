import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle2, AlertCircle, FileText, Trash2, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { extractMarkdownFromPdf } from "@/lib/pdf-to-markdown";
import { supabase } from "@/integrations/supabase/client";

type DocStatus = "parsing" | "ready" | "uploading" | "uploaded" | "error";

interface PendingDoc {
  id: string;
  fileName: string;
  title: string;
  markdown: string;
  status: DocStatus;
  error?: string;
}

const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15 MB per PDF
const MAX_PARALLEL_PARSE = 3;

/**
 * Admin-only uploader that turns workshop PDFs into structured markdown
 * entries in the Fleety knowledge base. Each upload is parsed locally so
 * the admin can inspect and edit the title/markdown before it ships.
 */
export function WorkshopDocsUploader() {
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [uploadingAll, setUploadingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const updateDoc = useCallback((id: string, patch: Partial<PendingDoc>) => {
    setDocs((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const removeDoc = useCallback((id: string) => {
    setDocs((prev) => prev.filter((d) => d.id !== id));
  }, []);

  const parseFiles = useCallback(
    async (files: FileList | File[]) => {
      const fileArr = Array.from(files).filter((f) => /\.pdf$/i.test(f.name));
      if (fileArr.length === 0) {
        toast.error("Only PDF files are supported");
        return;
      }

      const newDocs: PendingDoc[] = fileArr.map((f) => ({
        id: crypto.randomUUID(),
        fileName: f.name,
        title: f.name.replace(/\.pdf$/i, ""),
        markdown: "",
        status: "parsing" as DocStatus,
      }));
      setDocs((prev) => [...prev, ...newDocs]);

      // Parse in small batches to keep UI responsive
      for (let i = 0; i < fileArr.length; i += MAX_PARALLEL_PARSE) {
        const batch = fileArr.slice(i, i + MAX_PARALLEL_PARSE);
        await Promise.all(
          batch.map(async (file, idx) => {
            const doc = newDocs[i + idx];
            try {
              if (file.size > MAX_FILE_BYTES) {
                throw new Error(`File too large (max ${MAX_FILE_BYTES / 1024 / 1024} MB)`);
              }
              const { title, markdown } = await extractMarkdownFromPdf(file);
              if (!markdown.trim()) {
                throw new Error("No text extracted (scanned PDF?)");
              }
              updateDoc(doc.id, { title, markdown, status: "ready" });
            } catch (err) {
              const message = err instanceof Error ? err.message : "Parse failed";
              updateDoc(doc.id, { status: "error", error: message });
            }
          }),
        );
      }
    },
    [updateDoc],
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void parseFiles(e.target.files);
      e.target.value = ""; // allow re-selecting the same files
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files?.length) {
      void parseFiles(e.dataTransfer.files);
    }
  };

  const uploadAll = async () => {
    const ready = docs.filter((d) => d.status === "ready" && d.markdown.trim() && d.title.trim());
    if (ready.length === 0) {
      toast.error("No parsed workshops ready to upload");
      return;
    }

    setUploadingAll(true);
    ready.forEach((d) => updateDoc(d.id, { status: "uploading" }));

    try {
      const { data, error } = await supabase.functions.invoke("ingest-workshop-docs", {
        body: {
          docs: ready.map((d) => ({ title: d.title, content: d.markdown })),
        },
      });

      if (error) throw new Error(error.message);

      const results = (data?.results ?? []) as { title: string; ok: boolean; error?: string }[];
      ready.forEach((d, i) => {
        const res = results[i];
        if (res?.ok) {
          updateDoc(d.id, { status: "uploaded" });
        } else {
          updateDoc(d.id, { status: "error", error: res?.error ?? "Upload failed" });
        }
      });

      const inserted = data?.inserted ?? 0;
      toast.success(`Uploaded ${inserted} workshop${inserted === 1 ? "" : "s"} to Fleety's knowledge base`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      ready.forEach((d) => updateDoc(d.id, { status: "error", error: message }));
      toast.error(message);
    } finally {
      setUploadingAll(false);
    }
  };

  const clearUploaded = () => {
    setDocs((prev) => prev.filter((d) => d.status !== "uploaded"));
  };

  const readyCount = docs.filter((d) => d.status === "ready").length;
  const uploadedCount = docs.filter((d) => d.status === "uploaded").length;

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Workshop Documents</h2>
        <p className="text-sm text-muted-foreground">
          Upload detailed workshop PDFs. Each becomes a rich entry in Fleety's knowledge base so it can give step-by-step
          facilitation guidance instead of one-line summaries.
        </p>
      </div>

      <div
        onDrop={onDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        aria-label="Upload workshop PDFs"
        className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary hover:bg-accent/30 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
      >
        <UploadCloud className="h-8 w-8 mx-auto mb-2 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm font-medium">Drop workshop PDFs here, or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">PDF only · up to 15 MB each</p>
        <Input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={onFileChange}
        />
      </div>

      {docs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={uploadAll} disabled={uploadingAll || readyCount === 0}>
            {uploadingAll ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" aria-hidden="true" />
                Uploading…
              </>
            ) : (
              `Upload ${readyCount} ready workshop${readyCount === 1 ? "" : "s"}`
            )}
          </Button>
          {uploadedCount > 0 && (
            <Button variant="outline" onClick={clearUploaded}>
              Clear {uploadedCount} uploaded
            </Button>
          )}
        </div>
      )}

      <ul className="space-y-3" aria-live="polite">
        {docs.map((doc) => (
          <li key={doc.id}>
            <Card className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <FileText className="h-5 w-5 mt-1 text-muted-foreground shrink-0" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">{doc.fileName}</p>
                  <Input
                    value={doc.title}
                    onChange={(e) => updateDoc(doc.id, { title: e.target.value })}
                    placeholder="Workshop title"
                    disabled={doc.status === "uploading" || doc.status === "uploaded"}
                    aria-label={`Title for ${doc.fileName}`}
                    className="mt-1 font-medium"
                  />
                </div>
                <StatusBadge status={doc.status} />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeDoc(doc.id)}
                  disabled={doc.status === "uploading"}
                  aria-label={`Remove ${doc.fileName}`}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>

              {doc.status === "error" && doc.error && (
                <p className="text-sm text-destructive">{doc.error}</p>
              )}

              {(doc.status === "ready" || doc.status === "uploaded") && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    Preview / edit markdown ({doc.markdown.length.toLocaleString()} chars)
                  </summary>
                  <Textarea
                    value={doc.markdown}
                    onChange={(e) => updateDoc(doc.id, { markdown: e.target.value })}
                    disabled={doc.status === "uploaded"}
                    aria-label={`Markdown content for ${doc.title}`}
                    rows={12}
                    className="mt-2 font-mono text-xs"
                  />
                </details>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StatusBadge({ status }: { status: DocStatus }) {
  const map: Record<DocStatus, { label: string; icon: React.ReactNode; className: string }> = {
    parsing: { label: "Parsing", icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />, className: "text-muted-foreground" },
    ready: { label: "Ready", icon: null, className: "text-foreground" },
    uploading: { label: "Uploading", icon: <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />, className: "text-primary" },
    uploaded: { label: "Uploaded", icon: <CheckCircle2 className="h-3 w-3" aria-hidden="true" />, className: "text-success" },
    error: { label: "Error", icon: <AlertCircle className="h-3 w-3" aria-hidden="true" />, className: "text-destructive" },
  };
  const { label, icon, className } = map[status];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${className} shrink-0`} role="status">
      {icon}
      {label}
    </span>
  );
}
