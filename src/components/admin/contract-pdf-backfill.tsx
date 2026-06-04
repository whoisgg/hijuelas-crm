"use client";

import * as React from "react";
import { toast } from "sonner";
import { FileText, Loader2, Play } from "lucide-react";

import { Button } from "@/components/ui/button";
import { backfillContractPdfsBatch } from "@/lib/actions/contract-pdf-actions";

export function ContractPdfBackfill() {
  const [running, setRunning] = React.useState(false);
  const [attached, setAttached] = React.useState(0);
  const [skipped, setSkipped] = React.useState(0);
  const [remaining, setRemaining] = React.useState<number | null>(null);
  const [failed, setFailed] = React.useState<{ number: string; reason: string }[]>([]);
  const [log, setLog] = React.useState<string>("");

  const run = async () => {
    setRunning(true);
    setAttached(0);
    setSkipped(0);
    setFailed([]);
    setLog("Procesando…");
    let totalAttached = 0;
    let totalSkipped = 0;
    const allFailed: { number: string; reason: string }[] = [];
    try {
      // Loop de lotes hasta que no queden pendientes (o no haya progreso).
      for (let guard = 0; guard < 200; guard++) {
        const res = await backfillContractPdfsBatch();
        if (!res.ok || !res.result) {
          toast.error(res.message ?? "Error en el backfill");
          break;
        }
        totalAttached += res.result.attached;
        totalSkipped += res.result.skipped;
        allFailed.push(...res.result.failed);
        setAttached(totalAttached);
        setSkipped(totalSkipped);
        setFailed([...allFailed]);
        setRemaining(res.result.remaining);
        setLog(
          `Generados ${totalAttached} · omitidos ${totalSkipped} · fallidos ${allFailed.length} · faltan ${res.result.remaining}`,
        );
        // Si el lote no procesó nada nuevo (solo fallidos repetidos), cortar.
        if (res.result.attached === 0 && res.result.skipped === 0) break;
        if (res.result.remaining <= 0) break;
      }
      toast.success(`Backfill terminado: ${totalAttached} PDFs generados`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-2">
        <FileText className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Generar PDFs de contratos</h3>
      </div>
      <p className="text-sm text-muted-foreground">
        Genera y adjunta el PDF del contrato (con los datos actuales del CRM) a
        cada contrato que aún no lo tenga. Es idempotente: re-ejecutar solo
        procesa los que faltan. El PDF queda en la pestaña Adjuntos de cada
        contrato.
      </p>
      <div>
        <Button disabled={running} onClick={run}>
          {running ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {running ? "Procesando…" : "Generar PDFs faltantes"}
        </Button>
      </div>

      {log ? (
        <div className="rounded-lg bg-muted/50 p-3 text-xs">
          <p className="font-medium">{log}</p>
          <div className="mt-1 flex gap-4 text-muted-foreground">
            <span>✅ Generados: {attached}</span>
            <span>↩︎ Omitidos: {skipped}</span>
            {remaining !== null ? <span>⏳ Faltan: {remaining}</span> : null}
          </div>
        </div>
      ) : null}

      {failed.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer text-destructive">
            {failed.length} contrato(s) sin PDF (datos insuficientes)
          </summary>
          <ul className="mt-2 space-y-1 text-muted-foreground">
            {failed.slice(0, 50).map((f, i) => (
              <li key={i}>
                <span className="font-mono">{f.number}</span> — {f.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
