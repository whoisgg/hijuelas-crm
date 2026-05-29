"use client";

import * as React from "react";
import { Download, Upload, X, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EXPORT_COMPROMISOS_HEADERS } from "@/lib/export/compromisos";
import {
  importContractsDryRun,
  importContractsCommit,
  type ImportRawRow,
  type ImportPreview,
  type ImportResult,
} from "@/lib/actions/import-contratos";

type Stage = "idle" | "parsing" | "preview" | "committing" | "done";

export function ImportContractsButton() {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [stage, setStage] = React.useState<Stage>("idle");
  const [rows, setRows] = React.useState<ImportRawRow[]>([]);
  const [preview, setPreview] = React.useState<ImportPreview | null>(null);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  function reset() {
    setStage("idle");
    setRows([]);
    setPreview(null);
    setResult(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function downloadTemplate() {
    const XLSX = await import("xlsx");
    const example: Record<string, string | number> = {};
    for (const h of EXPORT_COMPROMISOS_HEADERS) example[h] = "";
    example["País Destino"] = "Perú";
    example["Empresa vendedora"] = "Viveros Hijuelas S.A.";
    example["Cliente"] = "Cliente Ejemplo SAC";
    example["# Contrato"] = "";
    example["Condición"] = "Venta";
    example["Tipo de venta"] = "Exportacion";
    example["Especie"] = "Arándano";
    example["Variedad"] = "Biloxi";
    example["Moneda"] = "USD";
    example["Rut"] = "20123456789";
    example["# plantas"] = 10000;
    example["Valor planta"] = 1.5;
    example["Año entrega"] = new Date().getFullYear();
    example["Wk entrega"] = 30;
    const ws = XLSX.utils.json_to_sheet([example], { header: [...EXPORT_COMPROMISOS_HEADERS] });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Compromisos");
    XLSX.writeFile(wb, "Plantilla BBDD ventas - Compromisos.xlsx");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setStage("parsing");
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const XLSX = await import("xlsx");
      const wb = XLSX.read(buf, { type: "array" });
      const sheetName =
        wb.SheetNames.find((n) => /compromiso/i.test(n)) ?? wb.SheetNames[0];
      const ws = wb.Sheets[sheetName];
      const parsed = XLSX.utils.sheet_to_json<ImportRawRow>(ws, { defval: null });
      if (parsed.length === 0) {
        setError("El archivo no tiene filas de datos.");
        setStage("idle");
        return;
      }
      setRows(parsed);
      const pv = await importContractsDryRun(parsed);
      setPreview(pv);
      setStage("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al leer el archivo");
      setStage("idle");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function commit() {
    setStage("committing");
    setError(null);
    try {
      const res = await importContractsCommit(rows);
      setResult(res);
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al importar");
      setStage("preview");
    }
  }

  const modalOpen = stage === "preview" || stage === "committing" || stage === "done";

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={onFile}
      />
      <Button variant="outline" size="sm" onClick={downloadTemplate}>
        <Download className="h-4 w-4" />
        Plantilla
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => fileRef.current?.click()}
        disabled={stage === "parsing"}
      >
        {stage === "parsing" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        Importar
      </Button>

      {error && stage === "idle" ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : null}

      {modalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-lg border bg-card p-5 shadow-lg">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">
                {stage === "done" ? "Importación completada" : "Previsualización del import"}
              </h2>
              <button
                onClick={reset}
                className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {stage !== "done" && preview ? (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <Stat label="Filas en archivo" value={preview.totalRows} />
                  <Stat label="Contratos nuevos" value={preview.contractsNew} highlight />
                  <Stat label="Items nuevos" value={preview.itemsNew} />
                  <Stat label="Clientes nuevos" value={preview.clientsNew} />
                  <Stat label="Ya existentes (omitidos)" value={preview.contractsExisting} />
                  <Stat label="Filas con error" value={preview.rowErrors.length} tone={preview.rowErrors.length > 0 ? "warn" : undefined} />
                </div>

                {preview.rowErrors.length > 0 ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-500">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Filas que se omitirán ({preview.rowErrors.length})
                    </div>
                    <ul className="max-h-40 space-y-0.5 overflow-auto text-xs text-muted-foreground">
                      {preview.rowErrors.slice(0, 50).map((e, i) => (
                        <li key={i}>Fila {e.row}: {e.reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {error ? <p className="text-xs text-destructive">{error}</p> : null}

                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={reset} disabled={stage === "committing"}>
                    Cancelar
                  </Button>
                  <Button
                    size="sm"
                    onClick={commit}
                    disabled={stage === "committing" || preview.contractsNew === 0}
                  >
                    {stage === "committing" ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" /> Importando…
                      </>
                    ) : (
                      `Importar ${preview.contractsNew} contratos`
                    )}
                  </Button>
                </div>
              </div>
            ) : null}

            {stage === "done" && result ? (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-500">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-medium">Listo</span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Contratos" value={result.contractsCreated} highlight />
                  <Stat label="Items" value={result.itemsCreated} />
                  <Stat label="Clientes" value={result.clientsCreated} />
                </div>
                {result.errors.length > 0 ? (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-muted-foreground">
                    {result.errors.length} incidencias durante el import (ver detalle abajo):
                    <ul className="mt-1 max-h-32 space-y-0.5 overflow-auto">
                      {result.errors.slice(0, 30).map((e, i) => (
                        <li key={i}>{e.reason}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex justify-end pt-1">
                  <Button size="sm" onClick={reset}>Cerrar</Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Stat({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  tone?: "warn";
}) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-1.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={
          "text-lg font-semibold tabular-nums " +
          (tone === "warn"
            ? "text-amber-600 dark:text-amber-500"
            : highlight
              ? "text-primary"
              : "")
        }
      >
        {value}
      </div>
    </div>
  );
}
