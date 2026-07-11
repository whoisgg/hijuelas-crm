"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { HEAT_LEGEND, heatTone } from "@/lib/planner/heat";
import type { SectorLayoutData } from "@/lib/planner/layout-data";

/**
 * Plano del sector: módulos apilados (scroll vertical, mobile-first). La
 * geometría sale de la nomenclatura — letra = lado (columnas enfrentadas),
 * número = fila. Ubicaciones sin lado/fila (Túnel 12, ZO 3) van en grilla.
 *
 * Dos vistas (misma escala de calor, con rojo ≥ máx en ambas):
 *  - "plan": proyección FIFO anclada — lo que no cabe se lista como sobrecupo.
 *  - "real" ("Hoy"): la foto del último snapshot de Hotelería.
 */

export type SectorOverflow = {
  trays: number;
  items: { label: string; trays: number }[];
};

function LocationCell({
  code,
  pct,
  trays,
  capacity,
  detail,
  alertAt,
}: {
  code: string;
  pct: number;
  trays: number;
  capacity: number | null;
  detail: string;
  alertAt: number;
}) {
  return (
    <div
      className={cn(
        "flex h-11 flex-col items-center justify-center rounded-md text-[11px] tabular-nums",
        heatTone(pct, alertAt),
      )}
      title={`${code}: ${trays.toLocaleString("es-CL")}${capacity ? ` / ${capacity.toLocaleString("es-CL")}` : ""} bandejas — ${detail || "vacío"}`}
    >
      <span className="font-medium">{code}</span>
      <span className="text-[10px] opacity-90">
        {capacity ? `${Math.round(pct)}%` : `${trays}`}
      </span>
    </div>
  );
}

export function SectorLayout({
  data,
  alertAt,
  variant = "real",
  fill,
  overflow,
}: {
  data: SectorLayoutData;
  alertAt: number;
  variant?: "plan" | "real";
  /** relleno simulado por location id (solo variant="plan") */
  fill?: Record<number, { trays: number; detail: string }>;
  overflow?: SectorOverflow;
}) {
  const cellData = (loc: SectorLayoutData["modules"][number]["locations"][number]) => {
    if (variant === "plan") {
      const f = fill?.[loc.id];
      return {
        trays: f?.trays ?? 0,
        detail: f?.detail ?? "",
      };
    }
    return {
      trays: loc.trays,
      detail: loc.species.map((s) => `${s.name}: ${s.trays}`).join(" · "),
    };
  };

  return (
    <div className="space-y-6">
      {variant === "plan" && overflow && overflow.trays > 0 ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
          <p className="flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
            <AlertTriangle className="h-4 w-4" />
            {overflow.trays.toLocaleString("es-CL")} bandejas del plan no caben
            en el sector esta semana
          </p>
          <ul className="mt-1.5 space-y-0.5 text-xs text-red-700/90 dark:text-red-300/90">
            {overflow.items.map((o, i) => (
              <li key={i} className="tabular-nums">
                {o.label} — {o.trays.toLocaleString("es-CL")} bandejas
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {data.modules.map((m) => {
        const sides = [...new Set(m.locations.map((l) => l.side).filter(Boolean))] as string[];
        const hasGeometry =
          sides.length > 0 && m.locations.every((l) => l.side && l.rowNum !== null);
        return (
          <section key={m.id}>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">
              {m.name}
            </h3>
            {hasGeometry ? (
              <div
                className="grid gap-1.5"
                style={{
                  gridTemplateColumns: `repeat(${sides.length}, minmax(0, 1fr))`,
                }}
              >
                {[...new Set(m.locations.map((l) => l.rowNum))]
                  .sort((a, b) => (a ?? 0) - (b ?? 0))
                  .flatMap((row) =>
                    sides.map((side) => {
                      const loc = m.locations.find(
                        (l) => l.side === side && l.rowNum === row,
                      );
                      if (!loc) {
                        return <div key={`${side}${row}`} className="h-11" />;
                      }
                      const { trays, detail } = cellData(loc);
                      const pct = loc.capacityTrays
                        ? (trays / loc.capacityTrays) * 100
                        : 0;
                      return (
                        <LocationCell
                          key={loc.id}
                          code={loc.code}
                          pct={pct}
                          trays={trays}
                          capacity={loc.capacityTrays}
                          detail={detail}
                          alertAt={alertAt}
                        />
                      );
                    }),
                  )}
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 md:grid-cols-8">
                {m.locations.map((loc) => {
                  const { trays, detail } = cellData(loc);
                  const pct = loc.capacityTrays
                    ? (trays / loc.capacityTrays) * 100
                    : 0;
                  return (
                    <LocationCell
                      key={loc.id}
                      code={loc.code}
                      pct={pct}
                      trays={trays}
                      capacity={loc.capacityTrays}
                      detail={detail}
                      alertAt={alertAt}
                    />
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        {HEAT_LEGEND.map((item) => (
          <span key={item.label} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-sm", item.swatch)} />
            {item.label.replace("{max}", String(Math.round(alertAt * 100)))}
          </span>
        ))}
      </div>
    </div>
  );
}
