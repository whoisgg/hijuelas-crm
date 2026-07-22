"use client";

import * as React from "react";
import Link from "next/link";
import { KanbanSquare, List } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  ScenariosList,
  type ScenarioRow,
} from "@/components/planner/scenarios-list";

/**
 * Tablero de simulaciones con toggle Kanban | Lista (mismo patrón que
 * oportunidades del CRM).
 */

const STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador",
  evaluacion: "En evaluación",
  aprobado: "Confirmada",
  descartado: "Descartada",
};
const LOADS = new Set(["evaluacion", "aprobado"]);

export function ScenariosSection({ scenarios }: { scenarios: ScenarioRow[] }) {
  const [view, setView] = React.useState<"kanban" | "list">("kanban");

  return (
    <section>
      <div className="flex items-center justify-end">
        <div className="inline-flex h-8 items-center rounded-lg border bg-card p-0.5">
          {(
            [
              ["kanban", "Kanban", KanbanSquare],
              ["list", "Lista", List],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              aria-pressed={view === key}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
                view === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2">
        {view === "kanban" ? (
          <ScenariosList scenarios={scenarios} />
        ) : scenarios.length ? (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-2.5 font-medium">Simulación</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 text-right font-medium">Órdenes</th>
                  <th className="px-4 py-2.5 text-right font-medium">Bandejas</th>
                  <th className="px-4 py-2.5 font-medium">Creada</th>
                  <th className="px-4 py-2.5 font-medium">Autor</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/40">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/planner/simulador/${s.id}`}
                        className="font-medium underline-offset-2 hover:underline"
                      >
                        {s.name}
                      </Link>
                      {s.description ? (
                        <p className="max-w-96 truncate text-xs text-muted-foreground">
                          {s.description}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px]">
                          {STATUS_LABEL[s.status] ?? s.status}
                        </Badge>
                        {LOADS.has(s.status) ? (
                          <span
                            title="Se suma a Ocupación."
                            className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                          >
                            se carga
                          </span>
                        ) : null}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {s.lots_count.toLocaleString("es-CL")}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {(s.trays_count ?? 0).toLocaleString("es-CL")}
                    </td>
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {new Date(s.created_at).toLocaleDateString("es-CL", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">
                      {s.created_by_name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            No hay simulaciones. Crea una con «Nueva simulación».
          </p>
        )}
      </div>
    </section>
  );
}
