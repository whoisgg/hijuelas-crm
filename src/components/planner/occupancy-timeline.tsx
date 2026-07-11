"use client";

import * as React from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { HEAT_LEGEND, heatTone } from "@/lib/planner/heat";
import type { TimelineData } from "@/lib/planner/occupancy-data";

/**
 * Línea de tiempo vertical de ocupación: semanas como filas, áreas como
 * columnas. Granularidad fija semanal; mes/año solo como separadores.
 * Heatmap por % de utilización (escala compartida en lib/planner/heat).
 */

const STAGE_SHORT: Record<string, string> = {
  enraizamiento: "Enraiz.",
  maduracion: "Madur.",
  predespacho: "Predesp.",
};

export function OccupancyTimeline({ data }: { data: TimelineData }) {
  const { areas, weeks, maxUtilization } = data;

  // La vista operativa parte en la semana actual; el historial queda
  // disponible bajo demanda (y siempre en la exportación a Excel).
  const [showHistory, setShowHistory] = React.useState(false);
  const currentIdx = weeks.findIndex((w) => w.isCurrent);
  const historyCount = currentIdx > 0 ? currentIdx : 0;
  const visibleWeeks =
    showHistory || historyCount === 0 ? weeks : weeks.slice(currentIdx);

  const alertWeeksByArea = new Map<number, number>();
  for (const w of weeks) {
    for (const a of areas) {
      const pct = a.capacityTrays > 0 ? ((w.occupied[String(a.id)] ?? 0) / a.capacityTrays) * 100 : 0;
      if (pct >= maxUtilization * 100) {
        alertWeeksByArea.set(a.id, (alertWeeksByArea.get(a.id) ?? 0) + 1);
      }
    }
  }

  // Agrupación para la columna de mes (celda combinada con rowSpan) y las
  // filas divisorias de año. El mes cambia siempre en borde de grupo, así
  // que los rowSpan nunca cruzan una fila de año.
  const monthSpan = new Map<number, number>();
  {
    let i = 0;
    while (i < visibleWeeks.length) {
      let j = i;
      while (
        j < visibleWeeks.length &&
        visibleWeeks[j].monthLabel === visibleWeeks[i].monthLabel
      )
        j++;
      monthSpan.set(i, j - i);
      i = j;
    }
  }

  return (
    <div>
      {historyCount > 0 ? (
        <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            {showHistory
              ? "Ocultar historial"
              : `Mostrar historial (${historyCount} semanas anteriores)`}
          </button>
        </div>
      ) : null}
      {/* La tabla es su propia área de scroll: el header queda fijo arriba
          mientras se recorren las semanas (sticky no funciona contra el
          scroll de la página dentro de un overflow-x-auto). */}
      <div className="max-h-[calc(100dvh-11rem)] overflow-auto rounded-md border">
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-xs">
        <thead>
          <tr>
            <th className="sticky top-0 z-10 w-4 border-b bg-background" />
            <th className="sticky top-0 z-10 w-14 border-b bg-background px-2 py-2 text-left font-medium text-muted-foreground">
              Semana
            </th>
            {areas.map((a) => (
              <th
                key={a.id}
                className="sticky top-0 z-10 border-b bg-background px-1 py-2 text-center font-medium"
              >
                <div className="truncate">{a.name}</div>
                <div className="text-[10px] font-normal text-muted-foreground">
                  {STAGE_SHORT[a.stage] ?? a.stage} ·{" "}
                  {a.capacityTrays.toLocaleString("es-CL")}
                  {alertWeeksByArea.get(a.id) ? (
                    <span className="ml-1 text-red-600 dark:text-red-400">
                      ⚠{alertWeeksByArea.get(a.id)}
                    </span>
                  ) : null}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visibleWeeks.map((w, i) => {
            const isYearStart = i === 0 || w.year !== visibleWeeks[i - 1].year;
            const span = monthSpan.get(i);
            const monthName = w.monthLabel.split(" ")[0];
            return (
              <React.Fragment key={w.campaignWeek}>
                {isYearStart ? (
                  <tr>
                    <td className="pt-3" />
                    <td colSpan={areas.length + 1} className="pt-3">
                      <div className="rounded-md bg-muted/70 px-2 py-1 text-center text-[11px] font-semibold tracking-wide text-muted-foreground">
                        {w.year}
                      </div>
                    </td>
                  </tr>
                ) : null}
                <tr>
                  {span ? (
                    <td
                      rowSpan={span}
                      className="border-r border-border/60 pr-1 align-middle"
                    >
                      <div className="mx-auto text-center text-[9px] font-medium uppercase leading-[1.4] tracking-wide text-muted-foreground/70 [text-orientation:upright] [writing-mode:vertical-rl]">
                        {monthName.slice(0, 3)}
                      </div>
                    </td>
                  ) : null}
                  <td className="whitespace-nowrap px-1 py-0.5 tabular-nums text-muted-foreground">
                    {w.isCurrent ? (
                      <span className="inline-block min-w-7 rounded-md bg-foreground px-1.5 py-0.5 text-center font-semibold text-background">
                        {w.week}
                      </span>
                    ) : (
                      <span className="inline-block min-w-7 px-1 text-center">{w.week}</span>
                    )}
                  </td>
                  {areas.map((a) => {
                    const trays = w.occupied[String(a.id)] ?? 0;
                    const pct =
                      a.capacityTrays > 0 ? (trays / a.capacityTrays) * 100 : 0;
                    return (
                      <td key={a.id} className="p-[1px]">
                        <Link
                          href={`/planner/sector/${a.id}?week=${w.campaignWeek}`}
                          className={cn(
                            "flex h-6 items-center justify-center rounded-sm tabular-nums transition-transform hover:scale-[1.04]",
                            heatTone(pct, maxUtilization),
                          )}
                          title={`${a.name} · S${w.week} ${w.year}: ${trays.toLocaleString("es-CL")} / ${a.capacityTrays.toLocaleString("es-CL")} bandejas (${pct.toFixed(1)}%) — ver layout`}
                        >
                          {pct > 0 ? `${Math.round(pct)}%` : "·"}
                        </Link>
                      </td>
                    );
                  })}
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        {HEAT_LEGEND.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-sm", item.swatch)} />
            {item.label.replace("{max}", String(Math.round(maxUtilization * 100)))}
          </span>
        ))}
      </div>
    </div>
  );
}
