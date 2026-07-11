"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, FileUp, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ImportSummary } from "@/lib/actions/planner-import";

type Props = {
  kind: "planner" | "hoteleria";
  title: string;
  description: string;
  preview: (formData: FormData) => Promise<ImportSummary>;
  apply: (formData: FormData) => Promise<ImportSummary>;
};

const STAT_LABELS: Record<string, string> = {
  areas: "Áreas",
  especies: "Especies",
  variedades: "Variedades",
  semanas_calendario: "Semanas calendario",
  demanda: "Filas de demanda",
  lotes: "Lotes",
  lotes_actuales_a_reemplazar: "Lotes actuales (se reemplazan)",
  demanda_actual_a_reemplazar: "Demanda actual (se reemplaza)",
  ubicaciones: "Ubicaciones",
  filas_snapshot: "Filas de snapshot",
  snapshot_insertado: "Snapshot insertado",
};

export function UploadCard({ kind, title, description, preview, apply }: Props) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);
  const [phase, setPhase] = React.useState<"idle" | "previewing" | "applying">("idle");

  const reset = () => {
    setFile(null);
    setSummary(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setSummary(null);
    setPhase("previewing");
    try {
      const fd = new FormData();
      fd.set("file", f);
      setSummary(await preview(fd));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al leer el archivo.");
      reset();
    } finally {
      setPhase("idle");
    }
  };

  const handleApply = async () => {
    if (!file) return;
    setPhase("applying");
    try {
      const fd = new FormData();
      fd.set("file", file);
      const result = await apply(fd);
      setSummary(result);
      if (result.ok) {
        toast.success(`Carga aplicada: ${result.fileName}`);
        setFile(null);
        if (inputRef.current) inputRef.current.value = "";
        router.refresh();
      } else {
        toast.error("La carga no se aplicó — revisa los errores.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al aplicar la carga.");
    } finally {
      setPhase("idle");
    }
  };

  const newMasterEntries = Object.entries(summary?.newMasters ?? {}).filter(
    ([, v]) => v.length > 0,
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <FileUp className="h-5 w-5 text-primary" />
        <div>
          <CardTitle className="text-base">{title}</CardTitle>
          <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm"
            className="hidden"
            id={`file-${kind}`}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
          <Button
            variant="outline"
            onClick={() => inputRef.current?.click()}
            disabled={phase !== "idle"}
          >
            {phase === "previewing" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileUp className="h-4 w-4" />
            )}
            Seleccionar archivo
          </Button>
          {file ? (
            <span className="text-sm text-muted-foreground">{file.name}</span>
          ) : null}
        </div>

        {summary ? (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-sm">
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
              {Object.entries(summary.stats).map(([k, v]) => (
                <div key={k} className="flex flex-col">
                  <span className="text-xs text-muted-foreground">
                    {STAT_LABELS[k] ?? k}
                  </span>
                  <span className="font-medium tabular-nums">{v.toLocaleString("es-CL")}</span>
                </div>
              ))}
            </div>

            {newMasterEntries.map(([k, values]) => (
              <div key={k} className="text-xs">
                <span className="font-medium">
                  {k === "areas" && "Áreas nuevas: "}
                  {k === "especies" && "Especies nuevas: "}
                  {k === "sectores_sin_area" && "Sectores sin área equivalente: "}
                  {k === "especies_solo_snapshot" && "Especies solo en snapshot: "}
                </span>
                <span className="text-muted-foreground">{values.join(", ")}</span>
              </div>
            ))}

            {summary.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {w}
              </p>
            ))}
            {summary.errors.map((e, i) => (
              <p key={i} className="flex items-start gap-1.5 text-xs text-destructive">
                <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {e}
              </p>
            ))}

            {file && summary.errors.length === 0 ? (
              <div className="flex items-center gap-2 pt-1">
                <Button onClick={handleApply} disabled={phase !== "idle"}>
                  {phase === "applying" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  Aplicar carga
                </Button>
                <Button variant="ghost" onClick={reset} disabled={phase !== "idle"}>
                  Cancelar
                </Button>
              </div>
            ) : null}

            {!file && summary.ok ? (
              <p
                className={cn(
                  "flex items-center gap-1.5 text-xs font-medium",
                  "text-emerald-700 dark:text-emerald-400",
                )}
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Carga aplicada.
              </p>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
