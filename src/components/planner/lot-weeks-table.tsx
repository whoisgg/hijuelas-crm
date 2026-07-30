"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { updateLotWeek, type LotWeekRow } from "@/lib/actions/planner-lot-weeks";

const STAGE_LABEL: Record<string, string> = {
  enraizamiento: "Enraizamiento",
  maduracion: "Maduración",
  predespacho: "Predespacho",
};

/**
 * Ubicación semana a semana de un lote (planner_lot_weeks): una fila por
 * semana de campaña, área editable. "plan" = derivado de las 3 etapas fijas
 * del lote; "manual" = lo que el usuario corrigió acá porque en la realidad
 * pasó algo distinto. Con esto poblado en el tiempo se puede sacar el
 * protocolo real por variedad (promedio de semanas por etapa).
 */
export function LotWeeksTable({
  lotId,
  initialWeeks,
  areas,
  canEdit = true,
}: {
  lotId: number;
  initialWeeks: LotWeekRow[];
  areas: { id: number; name: string; stage: string }[];
  /** viewer sin permiso de admin: ve la tabla, no puede editar */
  canEdit?: boolean;
}) {
  const [weeks, setWeeks] = React.useState(initialWeeks);
  const [saving, setSaving] = React.useState<number | null>(null);

  const changeArea = async (campaignWeek: number, areaId: number) => {
    setSaving(campaignWeek);
    try {
      const res = await updateLotWeek({ lotId, campaignWeek, areaId });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo guardar.");
        return;
      }
      const area = areas.find((a) => a.id === areaId);
      setWeeks((prev) =>
        prev.map((w) =>
          w.campaignWeek === campaignWeek
            ? { ...w, areaId, areaName: area?.name ?? null, stage: area?.stage ?? w.stage, source: "manual" }
            : w,
        ),
      );
      toast.success(`Semana S${campaignWeek} actualizada.`);
    } finally {
      setSaving(null);
    }
  };

  if (!weeks.length) {
    return (
      <p className="rounded-lg border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
        Sin semanas registradas para este lote (rango de semanas inválido en el plan).
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Semana</th>
            <th className="px-3 py-2 text-left font-medium">Etapa</th>
            <th className="px-3 py-2 text-left font-medium">Área</th>
            <th className="px-3 py-2 text-left font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {weeks.map((w) => (
            <tr key={w.campaignWeek} className="hover:bg-muted/30">
              <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">S{w.campaignWeek}</td>
              <td className="whitespace-nowrap px-3 py-1.5 text-muted-foreground">
                {STAGE_LABEL[w.stage] ?? w.stage}
              </td>
              <td className="px-3 py-1.5">
                {canEdit ? (
                  <select
                    value={w.areaId ?? ""}
                    disabled={saving === w.campaignWeek}
                    onChange={(e) => changeArea(w.campaignWeek, Number(e.target.value))}
                    className="h-8 w-full max-w-56 rounded-md border bg-background px-2 text-xs"
                  >
                    {!w.areaId ? <option value="">— sin área —</option> : null}
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span>{w.areaName ?? "—"}</span>
                )}
              </td>
              <td className="whitespace-nowrap px-3 py-1.5 text-right">
                {w.source === "manual" ? (
                  <Badge
                    variant="outline"
                    className="gap-1 text-[10px]"
                    title="Corregido a mano — distinto del plan derivado"
                  >
                    <Pencil className="h-2.5 w-2.5" /> manual
                  </Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground">plan</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
