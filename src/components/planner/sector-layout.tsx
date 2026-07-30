"use client";

import * as React from "react";
import { AlertTriangle, MapPin } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RedistributeButton } from "@/components/planner/redistribute-button";
import type { SectorLayoutData } from "@/lib/planner/layout-data";

/**
 * Plano del sector.
 *  - "plan": vista estadio — cada mesón es una barra que al hacer clic se
 *    expande mostrando sus bandejas como "sillas" (gris = vacío, verde =
 *    lleno; hover azul resalta todas las del lote; clic lo selecciona y abre
 *    el sidebar de la derecha, tipo carrito, con la opción de mover).
 *  - "real" ("Hoy"): heatmap del snapshot contra capacidad física + drill-down.
 */

export type SectorOverflow = {
  trays: number;
  items: { label: string; trays: number }[];
};

export type LocationFill = {
  trays: number;
  parts: { label: string; trays: number }[];
};

type CellPart = { label: string; trays: number };

const SEAT_EMPTY = "#c9ccd1";
const SEAT_FULL = "#2f9e44";
const SEAT_HOVER = "#378ADD";
const SEAT_SELECTED = "#185FA5";

/** Código de lote a partir de la etiqueta "Especie Variedad · 2026-25-XXX". */
function lotCodeOf(label: string) {
  const parts = label.split(" · ");
  return parts.length > 1 ? parts[parts.length - 1] : label;
}
function speciesOf(label: string) {
  return label.split(" · ")[0];
}

function seatColor(
  label: string | null,
  hovered: string | null,
  selected: string | null,
) {
  if (!label) return SEAT_EMPTY;
  if (label === selected) return SEAT_SELECTED;
  if (label === hovered) return SEAT_HOVER;
  return SEAT_FULL;
}

/** Barra de asientos de un mesón: cada bandeja es una silla. */
function SeatGrid({
  capacity,
  parts,
  hovered,
  selected,
  onHover,
  onSelect,
}: {
  capacity: number;
  parts: CellPart[];
  hovered: string | null;
  selected: string | null;
  onHover: (label: string | null) => void;
  onSelect: (label: string) => void;
}) {
  // Escala para no dibujar miles de celdas en mesones grandes.
  const perCell = capacity > 320 ? Math.ceil(capacity / 320) : 1;
  const seats: (string | null)[] = [];
  for (const p of parts) {
    const n = Math.round(p.trays / perCell);
    for (let i = 0; i < n; i++) seats.push(p.label);
  }
  const total = Math.round(capacity / perCell);
  while (seats.length < total) seats.push(null);

  return (
    <div>
      <div className="flex flex-wrap gap-[2px]">
        {seats.map((label, i) => (
          <span
            key={i}
            onMouseEnter={() => onHover(label)}
            onMouseLeave={() => onHover(null)}
            onClick={() => label && onSelect(label)}
            title={label ?? "vacío"}
            className={cn("h-3 w-3 rounded-[2px] transition-colors", label && "cursor-pointer")}
            style={{ backgroundColor: seatColor(label, hovered, selected) }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[10px] text-muted-foreground">
        cada silla = {perCell === 1 ? "1 bandeja" : `${perCell} bandejas`} · clic para
        seleccionar el lote
      </p>
    </div>
  );
}

function PlanMeson({
  code,
  trays,
  capacity,
  parts,
  expanded,
  hovered,
  selected,
  onToggle,
  onHover,
  onSelect,
}: {
  code: string;
  trays: number;
  capacity: number | null;
  parts: CellPart[];
  expanded: boolean;
  hovered: string | null;
  selected: string | null;
  onToggle: () => void;
  onHover: (label: string | null) => void;
  onSelect: (label: string) => void;
}) {
  const cap = capacity ?? 0;
  const pct = cap ? (trays / cap) * 100 : 0;
  const free = Math.max(0, cap - trays);
  const hasSelected = selected != null && parts.some((p) => p.label === selected);
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-card p-1.5 text-[11px] transition-colors",
        expanded && "border-primary/50",
        pct >= 100 && "border-red-400/60",
        hasSelected && "border-[#185FA5]/70",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between px-0.5 tabular-nums hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span className="font-medium">{code}</span>
        <span className="text-muted-foreground">{cap ? `${Math.round(pct)}%` : trays}</span>
      </button>
      {expanded ? (
        <SeatGrid
          capacity={cap}
          parts={parts}
          hovered={hovered}
          selected={selected}
          onHover={onHover}
          onSelect={onSelect}
        />
      ) : (
        // barra gris/verde: verde = lleno, gris = vacío
        <div className="flex h-3.5 overflow-hidden rounded-sm">
          {trays > 0 ? (
            <div
              style={{
                flexGrow: trays,
                flexBasis: 0,
                backgroundColor: hasSelected ? SEAT_SELECTED : SEAT_FULL,
              }}
            />
          ) : null}
          {free > 0 ? (
            <div style={{ flexGrow: free, flexBasis: 0, backgroundColor: SEAT_EMPTY }} />
          ) : null}
        </div>
      )}
    </div>
  );
}

export function SectorLayout({
  data,
  variant = "real",
  fill,
  overflow,
  overflowAction,
  redistribute,
}: {
  data: SectorLayoutData;
  /** deprecado: la vista ya no usa heatmap (se mantiene por compatibilidad) */
  alertAt?: number;
  variant?: "plan" | "real";
  fill?: Record<number, LocationFill>;
  overflow?: SectorOverflow;
  overflowAction?: React.ReactNode;
  /** datos para el botón "Mover en un escenario" del sidebar (solo plan) */
  redistribute?: { areaId: number; week: number; scenarios: { id: number; name: string }[] };
}) {
  // Por defecto todos los mesones desplegados (se pueden colapsar).
  const allLocIds = React.useMemo(
    () => data.modules.flatMap((m) => m.locations.map((l) => l.id)),
    [data.modules],
  );
  const [expanded, setExpanded] = React.useState<Set<number>>(() => new Set(allLocIds));
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = React.useState<string | null>(null);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cellData = (loc: SectorLayoutData["modules"][number]["locations"][number]) => {
    if (variant === "plan") {
      const f = fill?.[loc.id];
      return { trays: f?.trays ?? 0, parts: f?.parts ?? [], capacity: loc.planCapacityTrays };
    }
    return {
      trays: loc.trays,
      parts: loc.species.map((s) => ({
        label: s.variety ? `${s.name} ${s.variety}` : s.name,
        trays: s.trays,
      })),
      capacity: loc.capacityTrays,
    };
  };

  // Mesones donde está el lote seleccionado, para el sidebar.
  const selectionPlaces = React.useMemo(() => {
    if (variant !== "plan" || !selectedLabel) return null;
    const places: { code: string; trays: number }[] = [];
    let total = 0;
    for (const m of data.modules) {
      for (const loc of m.locations) {
        const f = fill?.[loc.id];
        const part = f?.parts.find((p) => p.label === selectedLabel);
        if (part) {
          places.push({ code: loc.code, trays: part.trays });
          total += part.trays;
        }
      }
    }
    // sobrecupo del lote (si aparece en overflow)
    const over = overflow?.items
      .filter((o) => o.label === selectedLabel)
      .reduce((s, o) => s + o.trays, 0) ?? 0;
    return { places, total, over };
  }, [variant, selectedLabel, data, fill, overflow]);

  const selectLabel = (label: string) => {
    setSelectedLabel((prev) => (prev === label ? null : label));
    // al seleccionar, expande los mesones que contienen el lote
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const m of data.modules) {
        for (const loc of m.locations) {
          if (fill?.[loc.id]?.parts.some((p) => p.label === label)) next.add(loc.id);
        }
      }
      return next;
    });
  };

  const renderCell = (
    loc: SectorLayoutData["modules"][number]["locations"][number],
  ) => {
    const { trays, parts, capacity } = cellData(loc);
    // Mismo estadio para Proyección y Hoy; en Hoy (real) es sólo lectura.
    return (
      <PlanMeson
        key={loc.id}
        code={loc.code}
        trays={trays}
        capacity={capacity}
        parts={parts}
        expanded={expanded.has(loc.id)}
        hovered={hovered}
        selected={variant === "plan" ? selectedLabel : null}
        onToggle={() => toggle(loc.id)}
        onHover={setHovered}
        onSelect={variant === "plan" ? selectLabel : () => {}}
      />
    );
  };

  const anyExpanded = expanded.size > 0;

  const plano = (
    <div className="space-y-6">
      <p className="text-[11px] text-muted-foreground">
        {variant === "plan"
          ? "Clic en una silla selecciona su lote; pasa el cursor para verlo."
          : "Ubicaciones reales del último snapshot. Pasa el cursor sobre una silla para ver el lote."}
        <button
          type="button"
          onClick={() =>
            setExpanded(anyExpanded ? new Set() : new Set(allLocIds))
          }
          className="ml-2 underline-offset-2 hover:underline"
        >
          {anyExpanded ? "Colapsar todo" : "Expandir todo"}
        </button>
      </p>

      {data.modules.map((m) => {
        const sides = [...new Set(m.locations.map((l) => l.side).filter(Boolean))] as string[];
        const hasGeometry =
          sides.length > 0 && m.locations.every((l) => l.side && l.rowNum !== null);
        return (
          <section key={m.id}>
            <h3 className="mb-2 text-sm font-medium text-muted-foreground">{m.name}</h3>
            {hasGeometry ? (
              <div
                className="grid items-start gap-1.5"
                style={{ gridTemplateColumns: `repeat(${sides.length}, minmax(0, 1fr))` }}
              >
                {[...new Set(m.locations.map((l) => l.rowNum))]
                  .sort((a, b) => (a ?? 0) - (b ?? 0))
                  .flatMap((row) =>
                    sides.map((side) => {
                      const loc = m.locations.find(
                        (l) => l.side === side && l.rowNum === row,
                      );
                      if (!loc) return <div key={`${side}${row}`} className="h-11" />;
                      return renderCell(loc);
                    }),
                  )}
              </div>
            ) : (
              <div className="grid grid-cols-4 items-start gap-1.5 sm:grid-cols-6 md:grid-cols-8">
                {m.locations.map((loc) => renderCell(loc))}
              </div>
            )}
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: SEAT_EMPTY }} /> vacío
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: SEAT_FULL }} /> lleno
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: SEAT_HOVER }} /> hover (lote)
        </span>
        {variant === "plan" ? (
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: SEAT_SELECTED }} /> seleccionado
          </span>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {variant === "plan" && overflow && overflow.trays > 0 ? (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm dark:border-red-900 dark:bg-red-950/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-medium text-red-700 dark:text-red-300">
              <AlertTriangle className="h-4 w-4" />
              {overflow.trays.toLocaleString("es-CL")} bandejas del plan no caben
              en el sector esta semana
            </p>
            {overflowAction}
          </div>
          <ul className="mt-1.5 space-y-0.5 text-xs text-red-700/90 dark:text-red-300/90">
            {overflow.items.map((o, i) => (
              <li key={i} className="tabular-nums">
                {o.label} — {o.trays.toLocaleString("es-CL")} bandejas
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {plano}

      {/* Sidebar de selección: oculto por defecto, se desliza al elegir un lote. */}
      <Sheet
        open={variant === "plan" && !!selectedLabel}
        onOpenChange={(o: boolean) => {
          if (!o) setSelectedLabel(null);
        }}
      >
        <SheetContent side="right" className="w-[320px] gap-0 p-0 sm:max-w-sm">
          {selectedLabel && selectionPlaces ? (
            <>
              <SheetHeader className="border-b p-4 pr-12">
                <SheetTitle className="truncate">{speciesOf(selectedLabel)}</SheetTitle>
                <SheetDescription className="truncate text-[11px]">
                  {lotCodeOf(selectedLabel)}
                </SheetDescription>
              </SheetHeader>

              <div className="overflow-y-auto p-4">
                <div className="rounded-lg border bg-muted/30 px-3 py-2 text-[11px]">
                  <div className="flex items-center justify-between tabular-nums">
                    <span className="text-muted-foreground">En el sector</span>
                    <span className="font-semibold">
                      {selectionPlaces.total.toLocaleString("es-CL")} band.
                    </span>
                  </div>
                  {selectionPlaces.over > 0 ? (
                    <div className="mt-0.5 flex items-center justify-between tabular-nums text-red-600 dark:text-red-400">
                      <span>Sin espacio</span>
                      <span className="font-medium">
                        {selectionPlaces.over.toLocaleString("es-CL")} band.
                      </span>
                    </div>
                  ) : null}
                </div>

                <p className="mb-1 mt-3 flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                  <MapPin className="h-3 w-3" /> Mesones
                </p>
                <div className="flex flex-wrap gap-1">
                  {selectionPlaces.places.map((pl) => (
                    <span
                      key={pl.code}
                      className="rounded-md border bg-background px-1.5 py-0.5 text-[11px] tabular-nums"
                    >
                      {pl.code}{" "}
                      <span className="text-muted-foreground">
                        {pl.trays.toLocaleString("es-CL")}
                      </span>
                    </span>
                  ))}
                </div>

                {redistribute ? (
                  <div className="mt-4">
                    <RedistributeButton
                      areaId={redistribute.areaId}
                      week={redistribute.week}
                      scenarios={redistribute.scenarios}
                      lot={lotCodeOf(selectedLabel)}
                      label="Mover en un escenario"
                      fullWidth
                    />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      Los movimientos se guardan en un escenario; el plan real no se
                      toca.
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
