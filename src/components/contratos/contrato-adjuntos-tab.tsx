"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Download,
  FileText,
  Image as ImageIcon,
  Loader2,
  Paperclip,
  Trash2,
  Upload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  deleteAttachment,
  getAttachmentDownloadUrl,
  uploadAttachment,
  type AttachmentRow,
} from "@/lib/actions/attachments";
import { formatDate } from "@/components/contratos/format";

type Props = {
  contractId: string;
  attachments: AttachmentRow[];
};

function fileIcon(mime: string | null) {
  if (!mime) return FileText;
  if (mime.startsWith("image/")) return ImageIcon;
  return FileText;
}

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ContractAdjuntosTab({ contractId, attachments }: Props) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [dragging, setDragging] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("entity_type", "contract");
      fd.append("entity_id", contractId);
      fd.append("file", file);
      await uploadAttachment(fd);
      toast.success(`${file.name} subido`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al subir");
    } finally {
      setUploading(false);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    for (const f of files) await upload(f);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files ?? []);
    for (const f of files) await upload(f);
  };

  const download = async (id: string) => {
    setBusyId(id);
    try {
      const { url, filename } = await getAttachmentDownloadUrl(id);
      // Triger browser download via anchor
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al descargar");
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: string, filename: string) => {
    if (!window.confirm(`¿Borrar "${filename}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    setBusyId(id);
    try {
      await deleteAttachment(id);
      toast.success("Archivo borrado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al borrar");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDrop={onDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        className={
          "flex flex-col items-center gap-2 rounded-lg border-2 border-dashed bg-card py-8 text-center transition-colors " +
          (dragging
            ? "border-primary/60 bg-primary/5"
            : "border-border hover:border-primary/40")
        }
      >
        {uploading ? (
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        ) : (
          <Paperclip className="h-6 w-6 text-muted-foreground/60" />
        )}
        <div className="space-y-0.5">
          <p className="text-sm font-medium">
            {uploading ? "Subiendo..." : "Arrastrá archivos aquí"}
          </p>
          <p className="text-xs text-muted-foreground">
            PDF, imágenes, Word, Excel · máx 20 MB
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          Elegir archivo
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.docx,.xlsx,.doc,.xls,.txt,.csv"
          onChange={onFileChange}
        />
      </div>

      {/* Files list */}
      {attachments.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground">
          Sin archivos adjuntos todavía.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <ul className="divide-y">
            {attachments.map((a) => {
              const Icon = fileIcon(a.mime_type);
              const isBusy = busyId === a.id;
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm"
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={a.filename}>
                      {a.filename}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatBytes(a.size_bytes)} · {formatDate(a.created_at)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={isBusy}
                    onClick={() => download(a.id)}
                    aria-label="Descargar"
                  >
                    {isBusy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={isBusy}
                    onClick={() => handleDelete(a.id, a.filename)}
                    aria-label="Borrar"
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
