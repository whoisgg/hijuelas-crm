"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCheck, Hammer, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  approveWorkingScenario,
  discardWorkingScenario,
} from "@/lib/actions/planner-scenarios";
import type { WorkspaceChange } from "@/lib/planner/workspace-diff";

/**
 * Banner de la mesa de trabajo en Ocupación: la timeline muestra por defecto
 * la mesa (plan + movimientos sin aprobar). Cuando hay diferencias contra el
 * plan vigente, este banner las cuenta y ofrece aprobarlas (la mesa pasa a
 * ser el plan) o descartarlas (la mesa vuelve al plan).
 */
export function WorkingChangesBanner({
  count,
  changes,
  viewingPlan,
  query,
}: {
  count: number;
  changes: WorkspaceChange[];
  viewingPlan: boolean;
  query: string | null;
}) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState<"approve" | "discard" | null>(null);
  const [busy, setBusy] = React.useState(false);

  if (count === 0) return null;

  const qs = (extra?: string) => {
    const parts = [query, extra].filter(Boolean);
    return parts.length ? `?${parts.join("&")}` : "";
  };

  const run = async (kind: "approve" | "discard") => {
    setBusy(true);
    try {
      const res =
        kind === "approve"
          ? await approveWorkingScenario()
          : await discardWorkingScenario();
      if (res.ok) {
        toast.success(
          kind === "approve"
            ? "Mesa de trabajo aprobada: ahora es el plan vigente."
            : "Cambios descartados: la mesa vuelve al plan vigente.",
        );
        setConfirm(null);
        router.push(`/planner/ocupacion${qs()}`);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo completar la operación.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200">
        <Hammer className="h-4 w-4 shrink-0" />
        <span className="min-w-0">
          {viewingPlan ? (
            <>
              Estás viendo el <strong>plan vigente</strong> — tu mesa de trabajo
              tiene{" "}
              <strong>
                {count} {count === 1 ? "cambio" : "cambios"} sin aprobar
              </strong>
              .
            </>
          ) : (
            <>
              Mesa de trabajo:{" "}
              <strong>
                {count} {count === 1 ? "cambio" : "cambios"} sin aprobar
              </strong>{" "}
              sobre el plan vigente.
            </>
          )}
        </span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <Link
            href={`/planner/ocupacion${viewingPlan ? qs() : qs("base=plan")}`}
            className="text-xs underline-offset-2 hover:underline"
          >
            {viewingPlan ? "Volver a la mesa" : "Ver plan vigente"}
          </Link>
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-amber-300 bg-transparent text-amber-900 hover:bg-amber-100 dark:border-amber-800 dark:text-amber-200 dark:hover:bg-amber-950"
            onClick={() => setConfirm("discard")}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Descartar
          </Button>
          <Button
            size="sm"
            className="h-8"
            onClick={() => setConfirm("approve")}
          >
            <CheckCheck className="h-3.5 w-3.5" /> Aprobar al plan
          </Button>
        </span>
      </div>

      {confirm ? (
        <Dialog
          open
          onOpenChange={(o: boolean) => {
            if (!o && !busy) setConfirm(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {confirm === "approve"
                  ? "Aprobar la mesa de trabajo"
                  : "Descartar los cambios"}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {confirm === "approve"
                ? "El plan vigente se reemplaza con tu mesa de trabajo. Estos son los cambios que se aprueban:"
                : "Tu mesa de trabajo vuelve a ser una copia del plan vigente. Estos cambios se pierden:"}
            </p>
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border bg-muted/40 p-2 text-sm">
              {changes.map((c) => (
                <li key={c.code} className="flex items-baseline gap-2 px-1 py-0.5">
                  <span className="shrink-0 font-medium tabular-nums">{c.code}</span>
                  <span className="min-w-0 text-muted-foreground">
                    {c.description}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setConfirm(null)}
              >
                Cancelar
              </Button>
              <Button
                disabled={busy}
                variant={confirm === "discard" ? "destructive" : "default"}
                onClick={() => run(confirm)}
              >
                {busy
                  ? "Aplicando…"
                  : confirm === "approve"
                    ? "Aprobar al plan"
                    : "Descartar cambios"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
