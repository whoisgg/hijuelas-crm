"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { revertLotPlanChange } from "@/lib/actions/planner-lot-history";
import type { PlanChangeLogEntry } from "@/lib/planner/lot-plan-history";

const SOURCE_LABEL: Record<string, string> = {
  manual: "Edición manual",
  carga: "Carga de Excel",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Historial global de cambios al plan (pestaña "Historial" de Movimientos):
 * más reciente primero, con reversa. Revertir agrega un batch NUEVO que
 * deshace los valores — nunca borra ni reescribe el original ("no hay
 * eliminación, solo reversa o modificación").
 */
export function PlanChangesLog({
  entries,
  canRevert,
}: {
  entries: PlanChangeLogEntry[];
  canRevert: boolean;
}) {
  const router = useRouter();
  const [reverting, setReverting] = React.useState<string | null>(null);

  const revert = async (batchId: string, lotCode: string) => {
    setReverting(batchId);
    try {
      const res = await revertLotPlanChange(batchId);
      if (res.ok) {
        toast.success(`Revertido el cambio en ${lotCode}.`);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo revertir.");
      }
    } finally {
      setReverting(null);
    }
  };

  if (!entries.length) {
    return (
      <p className="rounded-lg border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
        Sin cambios registrados todavía. Cada edición en{" "}
        <Link href="/planner/lotes" className="text-primary underline-offset-2 hover:underline">
          Lotes
        </Link>{" "}
        o carga de Excel queda acá.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {entries.map((e) => (
        <div key={e.batchId} className="rounded-lg border bg-card px-4 py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/planner/lotes"
              className="font-mono text-xs font-medium underline-offset-2 hover:underline"
              title="Ver en Lotes (usa el buscador para encontrarlo)"
            >
              {e.lotCode}
            </Link>
            <Badge variant="outline" className="text-[10px]">
              {SOURCE_LABEL[e.source] ?? e.source}
            </Badge>
            <span className="text-xs text-muted-foreground">{fmtDate(e.changedAt)}</span>
            {e.changedByName ? (
              <span className="text-xs text-muted-foreground">· {e.changedByName}</span>
            ) : null}
            {e.uploadFileName ? (
              <span className="text-xs text-muted-foreground">· {e.uploadFileName}</span>
            ) : null}
            {canRevert && e.isLatestForLot ? (
              <Button
                variant="ghost"
                size="sm"
                className="ml-auto h-7 gap-1.5 text-xs"
                disabled={reverting === e.batchId}
                onClick={() => revert(e.batchId, e.lotCode)}
                title="Deshace estos campos al valor anterior — queda registrado como un cambio nuevo."
              >
                <Undo2 className="h-3.5 w-3.5" />
                {reverting === e.batchId ? "Revirtiendo…" : "Revertir"}
              </Button>
            ) : null}
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {e.fields.map((f, i) => (
              <span key={i}>
                <span className="font-medium text-foreground">{f.label}</span>:{" "}
                {f.oldValue ?? "—"} → {f.newValue ?? "—"}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
