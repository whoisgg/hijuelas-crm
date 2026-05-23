"use client";

import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { GitBranch } from "lucide-react";

import type { OpportunityDetail } from "@/lib/actions/oportunidades";

const ACTION_LABEL: Record<string, string> = {
  create: "Creada",
  update: "Actualizada",
  stage_change: "Cambio de stage",
  lost: "Marcada como perdida",
  converted: "Convertida a contrato",
  item_add: "Item agregado",
  item_update: "Item actualizado",
  item_delete: "Item eliminado",
  activity_add: "Actividad agregada",
  activity_update: "Actividad actualizada",
  activity_done: "Actividad completada",
};

type Props = {
  history: OpportunityDetail["history"];
};

export function HistoryTab({ history }: Props) {
  if (history.length === 0) {
    return (
      <div className="rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
        Sin historial todavía.
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card">
      <ul className="divide-y">
        {history.map((entry) => (
          <li key={entry.id} className="flex gap-3 px-3 py-2.5 text-xs">
            <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <GitBranch className="h-3 w-3" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {ACTION_LABEL[entry.action] ?? entry.action}
              </div>
              {entry.diff_json ? (
                <pre className="mt-0.5 overflow-x-auto text-[10px] text-muted-foreground">
                  {JSON.stringify(entry.diff_json, null, 0)}
                </pre>
              ) : null}
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {formatDistanceToNow(new Date(entry.created_at), {
                  addSuffix: true,
                  locale: es,
                })}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
