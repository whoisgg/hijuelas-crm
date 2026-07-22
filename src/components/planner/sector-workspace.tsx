"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Layers,
  Minus,
  PackageCheck,
  Pin,
  PinOff,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import {
  mermarScenarioLotPortion,
  moveScenarioLotPortion,
  pinLotToLocation,
} from "@/lib/actions/planner-scenarios";
import type {
  FillPart,
  SectorLotChip,
  SectorWorkspaceData,
} from "@/lib/planner/scenario-workspace";

/**
 * Mesa de trabajo del sector, vista "estadio" única (realidad + plan):
 * cada mesón se expande a sus bandejas ("sillas") sobre la capacidad física.
 * Verde = ocupado hoy, ámbar = el plan lo agrega la semana seleccionada,
 * gris = vacío. Una marca vertical señala la cuota de planificación del
 * mesón. El checkbox "salen esta semana" pinta de violeta las bandejas que hoy
 * están ocupadas pero el plan libera. Rojo se reserva para "sin espacio".
 * Azul también es hover del lote; el seleccionado queda resaltado en todos
 * los mesones. El toggle "Solo hoy" apaga la capa de plan y deja la foto
 * real del snapshot. El inbox de la derecha se arrastra sobre los mesones
 * para fijar (pin) dentro del sector.
 */

const SEAT_EMPTY = "#c9ccd1";
const SEAT_FULL = "#2f9e44";
const SEAT_ENTER = "#EF9F27";
const SEAT_HOVER = "#378ADD";
const SEAT_SELECTED = "#185FA5";
// Violeta para "sale esta semana": distinto del azul de hover/selección y del
// rojo (reservado a "sin espacio").
const SEAT_LEAVE = "#8b5cf6";

const lotKey = (lotId: number | null, stage: string | null) =>
  lotId !== null && stage ? `${lotId}:${stage}` : null;

export type WorkspaceBar = {
  weekLabel: string;
  prevHref: string | null;
  nextHref: string | null;
  planTrays: number;
  planPct: number;
  realTrays: number;
  realPct: number;
  planCapacity: number;
};

export function SectorWorkspace({
  scenarioId,
  scenarioName,
  data,
  initialLotCode = null,
  workingMode = false,
  bar = null,
}: {
  scenarioId: number;
  scenarioName: string;
  data: SectorWorkspaceData;
  alertAt: number;
  /** código de lote a preseleccionar al entrar (viene del plano de proyección) */
  initialLotCode?: string | null;
  /** mesa de trabajo invisible: suaviza el copy (no menciona "escenario") */
  workingMode?: boolean;
  /** barra de KPIs de la semana (selector, plan, hoy real, capacidad, salidas) */
  bar?: WorkspaceBar | null;
}) {
  const router = useRouter();

  // Preselección al llegar desde el plano de proyección (?lote=CODE).
  const initial = React.useMemo(() => {
    if (!initialLotCode) return { key: null as string | null, qty: 0, locs: [] as number[] };
    const chip = data.contents.find((c) => c.label.includes(initialLotCode));
    if (!chip) return { key: null as string | null, qty: 0, locs: [] as number[] };
    const key = `${chip.lotId}:${chip.stage}`;
    const locs: number[] = [];
    for (const m of data.layout.modules) {
      for (const loc of m.locations) {
        const parts = data.fill[loc.id]?.parts ?? [];
        if (parts.some((p) => lotKey(p.lotId, p.stage) === key)) locs.push(loc.id);
      }
    }
    return { key, qty: chip.trays, locs };
  }, [initialLotCode, data]);

  // Por defecto todos los mesones desplegados (se pueden colapsar).
  const allLocs = React.useMemo(
    () => data.layout.modules.flatMap((m) => m.locations),
    [data.layout.modules],
  );
  const snapshotDate = data.layout.snapshotDate
    ? new Date(data.layout.snapshotDate).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
      })
    : null;
  const allLocIds = React.useMemo(() => allLocs.map((l) => l.id), [allLocs]);

  const [busy, setBusy] = React.useState(false);
  // Capa: false = realidad + plan de la semana; true = sólo la foto real.
  const [soloHoy, setSoloHoy] = React.useState(false);
  // Filtro: pinta de azul las bandejas ocupadas hoy que el plan libera.
  const [marcarSalen, setMarcarSalen] = React.useState(false);
  const [dragging, setDragging] = React.useState<SectorLotChip | null>(null);
  const [expanded, setExpanded] = React.useState<Set<number>>(() => new Set(allLocIds));
  const [hoveredKey, setHoveredKey] = React.useState<string | null>(null);
  const [selectedKey, setSelectedKey] = React.useState<string | null>(initial.key);
  const [moveQty, setMoveQty] = React.useState<number>(initial.qty);
  // Movimiento por drag pendiente de confirmación (lote → mesón).
  const [pendingPin, setPendingPin] = React.useState<{
    chip: SectorLotChip;
    locationId: number;
    code: string;
  } | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const chipByKey = React.useMemo(() => {
    const m = new Map<string, SectorLotChip>();
    for (const c of data.contents) m.set(`${c.lotId}:${c.stage}`, c);
    return m;
  }, [data.contents]);
  const chipByLot = new Map(data.contents.map((c) => [c.lotId, c]));

  const selectedChip = selectedKey ? chipByKey.get(selectedKey) ?? null : null;

  // Mesones que contienen un lote dado (para auto-expandir al seleccionar).
  const locsWithKey = React.useCallback(
    (key: string) => {
      const ids: number[] = [];
      for (const m of data.layout.modules) {
        for (const loc of m.locations) {
          const parts = data.fill[loc.id]?.parts ?? [];
          if (parts.some((p) => lotKey(p.lotId, p.stage) === key)) ids.push(loc.id);
        }
      }
      return ids;
    },
    [data],
  );

  // Clic fuera del plano y del panel → deseleccionar. Vale también en touch:
  // un tap en el fondo limpia la selección y el scroll no dispara click.
  // Las zonas "seguras" (mesones, panel lateral, overlay de drag) llevan
  // data-keep-selection.
  React.useEffect(() => {
    if (!selectedKey) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-keep-selection]")) return;
      setSelectedKey(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [selectedKey]);

  const selectLot = (key: string | null) => {
    if (!key || key === selectedKey) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(key);
    const chip = chipByKey.get(key);
    setMoveQty(chip?.trays ?? 0);
    setExpanded((prev) => {
      const next = new Set(prev);
      for (const id of locsWithKey(key)) next.add(id);
      return next;
    });
  };

  const toggleExpand = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const onDragStart = (e: DragStartEvent) => {
    const id = Number(e.active.id);
    setDragging(chipByLot.get(id) ?? null);
  };

  // Espacio libre de un mesón (capacidad de plan − ocupado proyectado).
  const freeOf = (locationId: number) => {
    const loc = allLocs.find((l) => l.id === locationId);
    const cap = loc?.planCapacityTrays ?? 0;
    const used = data.fill[locationId]?.trays ?? 0;
    return cap - used;
  };

  const onDragEnd = (e: DragEndEvent) => {
    const chip = dragging;
    setDragging(null);
    if (!chip || !e.over) return;
    const locationId = Number(String(e.over.id).replace("loc:", ""));
    if (!Number.isFinite(locationId)) return;
    if (chip.pinnedLocationId === locationId) return;
    const code = allLocs.find((l) => l.id === locationId)?.code ?? "";
    if (freeOf(locationId) <= 0) {
      toast.error(`${code} está lleno — sin espacio.`);
      return;
    }
    // No se aplica todavía: espera confirmación en el panel.
    setPendingPin({ chip, locationId, code });
  };

  const confirmPin = async () => {
    if (!pendingPin) return;
    setBusy(true);
    try {
      const res = await pinLotToLocation({
        scenarioId,
        lotId: pendingPin.chip.lotId,
        stage: pendingPin.chip.stage,
        locationId: pendingPin.locationId,
      });
      if (res.ok) {
        toast.success(`${pendingPin.chip.species} fijado en ${pendingPin.code}.`);
        setPendingPin(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo fijar.");
      }
    } finally {
      setBusy(false);
    }
  };
  const cancelPin = () => setPendingPin(null);

  const unpin = async (chip: SectorLotChip) => {
    setBusy(true);
    try {
      const res = await pinLotToLocation({
        scenarioId,
        lotId: chip.lotId,
        stage: chip.stage,
        locationId: null,
      });
      if (res.ok) {
        toast.success("Pin quitado — vuelve al FIFO.");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo quitar.");
      }
    } finally {
      setBusy(false);
    }
  };

  const move = async (targetAreaId: number) => {
    if (!selectedChip) return;
    const qty = Math.max(1, Math.min(moveQty, selectedChip.trays));
    setBusy(true);
    try {
      const res = await moveScenarioLotPortion({
        scenarioId,
        lotId: selectedChip.lotId,
        stage: selectedChip.stage,
        trays: qty,
        targetAreaId,
      });
      if (res.ok) {
        const to = data.targets.find((t) => t.areaId === targetAreaId)?.name ?? "";
        toast.success(
          res.split
            ? `${qty.toLocaleString("es-CL")} bandejas de ${selectedChip.species} → ${to}.`
            : `${selectedChip.species} movido a ${to}.`,
        );
        setSelectedKey(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo mover.");
      }
    } finally {
      setBusy(false);
    }
  };

  const mermar = async () => {
    if (!selectedChip) return;
    const qty = Math.max(1, Math.min(moveQty, selectedChip.trays));
    const full = qty >= selectedChip.trays;
    const ok = window.confirm(
      full
        ? `¿Mermar el lote completo de ${selectedChip.species} (${qty.toLocaleString("es-CL")} bandejas)? Se descarta de este sector.`
        : `¿Mermar ${qty.toLocaleString("es-CL")} bandejas de ${selectedChip.species}? Se descartan y el resto queda.`,
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await mermarScenarioLotPortion({
        scenarioId,
        lotId: selectedChip.lotId,
        stage: selectedChip.stage,
        trays: qty,
      });
      if (res.ok) {
        toast.success(
          `Merma registrada · ${qty.toLocaleString("es-CL")} bandejas de ${selectedChip.species}.`,
        );
        setSelectedKey(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo mermar.");
      }
    } finally {
      setBusy(false);
    }
  };

  const anyExpanded = expanded.size > 0;
  // Inbox = sólo lo que el FIFO no logró ubicar (por asignar).
  const porAsignar = data.contents.filter((c) => c.overflowTrays > 0);

  return (
    <DndContext
      id="sector-workspace"
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      {bar ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <div className="flex items-center gap-2">
            {bar.prevHref ? (
              <Link
                href={bar.prevHref}
                aria-label="Semana anterior"
                className="rounded p-1 hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span className="w-6" />
            )}
            <span className="font-medium tabular-nums">{bar.weekLabel}</span>
            {bar.nextHref ? (
              <Link
                href={bar.nextHref}
                aria-label="Semana siguiente"
                className="rounded p-1 hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="w-6" />
            )}
          </div>
          <div title="Lotes planificados de la semana vs capacidad de planificación.">
            <span className="text-muted-foreground">Plan semana: </span>
            <span className="font-medium tabular-nums">
              {bar.planTrays.toLocaleString("es-CL")} bandejas ({Math.round(bar.planPct)}%)
            </span>
          </div>
          <div title="Foto del último snapshot, medida contra la capacidad física de los mesones.">
            <span className="text-muted-foreground">
              Hoy real{snapshotDate ? ` (${snapshotDate})` : ""}:{" "}
            </span>
            <span className="font-medium tabular-nums">
              {bar.realTrays.toLocaleString("es-CL")} bandejas ({Math.round(bar.realPct)}% del físico)
            </span>
          </div>
          <div title="Capacidad de planificación del área (Vivero Planner) — la base del plan, las alertas y la proyección.">
            <span className="text-muted-foreground">Capacidad plan: </span>
            <span className="font-medium tabular-nums">
              {bar.planCapacity.toLocaleString("es-CL")} bandejas
            </span>
          </div>
          {!soloHoy ? (
            <label
              className="flex cursor-pointer select-none items-center gap-1.5"
              title="Pinta de violeta las bandejas ocupadas hoy que el plan libera esta semana."
            >
              <input
                type="checkbox"
                checked={marcarSalen}
                onChange={(e) => setMarcarSalen(e.target.checked)}
                className="h-4 w-4 accent-[#8b5cf6]"
              />
              Salidas
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: SEAT_LEAVE }}
              />
            </label>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEAT_FULL }} />
          ocupado hoy
        </span>
        {!soloHoy ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEAT_ENTER }} />
            entra según plan
          </span>
        ) : null}
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEAT_EMPTY }} />
          vacío
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEAT_HOVER }} />
          hover
        </span>
        {marcarSalen && !soloHoy ? (
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEAT_LEAVE }} />
            sale esta semana
          </span>
        ) : null}
        <button
          type="button"
          onClick={() => setSoloHoy((v) => !v)}
          className={cn(
            "ml-auto rounded-full border px-2.5 py-1 transition-colors",
            soloHoy
              ? "border-foreground bg-foreground font-medium text-background"
              : "hover:border-foreground/40 hover:text-foreground",
          )}
        >
          {soloHoy
            ? "Volver al plan de la semana"
            : `Solo hoy${snapshotDate ? ` (${snapshotDate})` : ""}`}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Plano estadio */}
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
            <span>Clic en un mesón para expandirlo; clic en una silla selecciona su lote.</span>
            {anyExpanded ? (
              <button
                type="button"
                onClick={() => setExpanded(new Set())}
                className="underline-offset-2 hover:underline"
              >
                Colapsar todo
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setExpanded(
                    new Set(
                      data.layout.modules.flatMap((m) => m.locations.map((l) => l.id)),
                    ),
                  )
                }
                className="underline-offset-2 hover:underline"
              >
                Expandir todo
              </button>
            )}
          </div>

          {data.layout.modules.map((m) => {
            const sides = [
              ...new Set(m.locations.map((l) => l.side).filter(Boolean)),
            ] as string[];
            const hasGeom =
              sides.length > 0 && m.locations.every((l) => l.side && l.rowNum !== null);
            const cells = hasGeom
              ? [...new Set(m.locations.map((l) => l.rowNum))]
                  .sort((a, b) => (a ?? 0) - (b ?? 0))
                  .flatMap((row) =>
                    sides.map((side) => {
                      const loc = m.locations.find(
                        (l) => l.side === side && l.rowNum === row,
                      );
                      return loc ? (
                        <MesonCell
                          key={loc.id}
                          loc={loc}
                          fill={data.fill[loc.id]}
                          soloHoy={soloHoy}
                          marcarSalen={marcarSalen}
                          expanded={expanded.has(loc.id)}
                          hoveredKey={hoveredKey}
                          selectedKey={selectedKey}
                          onToggle={() => toggleExpand(loc.id)}
                          onHover={setHoveredKey}
                          onSelect={selectLot}
                        />
                      ) : (
                        <div key={`${side}${row}`} className="h-12" />
                      );
                    }),
                  )
              : m.locations.map((loc) => (
                  <MesonCell
                    key={loc.id}
                    loc={loc}
                    fill={data.fill[loc.id]}
                    soloHoy={soloHoy}
                    marcarSalen={marcarSalen}
                    expanded={expanded.has(loc.id)}
                    hoveredKey={hoveredKey}
                    selectedKey={selectedKey}
                    onToggle={() => toggleExpand(loc.id)}
                    onHover={setHoveredKey}
                    onSelect={selectLot}
                  />
                ));
            return (
              <section key={m.id}>
                <h3 className="mb-2 text-sm font-medium text-muted-foreground">{m.name}</h3>
                <div
                  className={cn(
                    "grid items-start gap-1.5",
                    !hasGeom && "grid-cols-4 sm:grid-cols-6 md:grid-cols-8",
                  )}
                  style={
                    hasGeom
                      ? { gridTemplateColumns: `repeat(${sides.length}, minmax(0,1fr))` }
                      : undefined
                  }
                >
                  {cells}
                </div>
              </section>
            );
          })}

        </div>

        {/* Panel: en mobile arriba de los módulos; en desktop columna derecha. */}
        <aside
          data-keep-selection
          className="order-first lg:order-none lg:sticky lg:top-16 lg:self-start"
        >
          {pendingPin ? (
            <div className="mb-3 rounded-xl border border-[#185FA5]/50 bg-[#185FA5]/[0.06] p-3 dark:bg-[#185FA5]/10">
              <p className="text-[11px] text-muted-foreground">Confirmar movimiento</p>
              <p className="mt-0.5 text-sm font-medium">
                {pendingPin.chip.species} → mesón {pendingPin.code}
              </p>
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={confirmPin}
                  disabled={busy}
                  className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Check className="h-4 w-4" /> Confirmar
                </button>
                <button
                  type="button"
                  onClick={cancelPin}
                  disabled={busy}
                  className="flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
                  aria-label="Cancelar movimiento"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
            {/* Por asignar: lo que el FIFO no logró ubicar */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="flex items-center gap-1.5 text-xs font-medium">
                <Inbox className="h-3.5 w-3.5" /> Por asignar
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground">
                {porAsignar.length}
              </span>
            </div>
            {porAsignar.length ? (
              <>
                <div className="mx-3 mb-2 rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {data.overflowTrays.toLocaleString("es-CL")} bandejas no caben —
                  arrástralas a un mesón con espacio o muévelas.
                </div>
                {/* Cards arrastrables con padding. Mobile: fila horizontal. */}
                <div className="flex gap-2.5 overflow-x-auto border-t p-3 lg:max-h-[42vh] lg:flex-col lg:overflow-x-visible lg:overflow-y-auto">
                  {porAsignar.map((item) => {
                    const key = `${item.lotId}:${item.stage}`;
                    return (
                      <LotCard
                        key={key}
                        item={item}
                        selected={selectedKey === key}
                        onSelect={() => selectLot(key)}
                        onUnpin={() => unpin(item)}
                        disabled={busy}
                      />
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center gap-1.5 border-t px-4 py-5 text-[11px] text-muted-foreground">
                <PackageCheck className="h-4 w-4 opacity-60" /> Todo asignado en el
                sector.
              </div>
            )}

            {/* Selección: sólo el lote elegido (sin título, se subentiende) */}
            {selectedChip ? (
              <div className="border-t-4 border-t-muted/60 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{selectedChip.species}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {selectedChip.label}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedKey(null)}
                    aria-label="Quitar selección"
                    className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="mt-3 rounded-lg border bg-background p-2.5">
                  <div className="mb-1.5 flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground">Cantidad (bandejas)</span>
                    <button
                      type="button"
                      onClick={() => setMoveQty(selectedChip.trays)}
                      className="font-medium text-[#185FA5] underline-offset-2 hover:underline"
                    >
                      Todo ({selectedChip.trays.toLocaleString("es-CL")})
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Menos"
                      onClick={() => setMoveQty((q) => Math.max(1, q - 10))}
                      className="rounded-md border p-1.5 hover:bg-muted"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={selectedChip.trays}
                      value={moveQty}
                      onChange={(e) =>
                        setMoveQty(
                          Math.max(
                            1,
                            Math.min(selectedChip.trays, Number(e.target.value) || 1),
                          ),
                        )
                      }
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-center text-base font-semibold tabular-nums"
                    />
                    <button
                      type="button"
                      aria-label="Más"
                      onClick={() =>
                        setMoveQty((q) => Math.min(selectedChip.trays, q + 10))
                      }
                      className="rounded-md border p-1.5 hover:bg-muted"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={selectedChip.trays}
                    value={moveQty}
                    onChange={(e) => setMoveQty(Number(e.target.value))}
                    className="mt-2.5 w-full accent-[#185FA5]"
                  />
                  <p className="mt-1 text-center text-[11px] text-muted-foreground">
                    {moveQty >= selectedChip.trays
                      ? "Lote completo"
                      : `Parcial · quedan ${(selectedChip.trays - moveQty).toLocaleString("es-CL")}`}
                  </p>
                </div>

                <p className="mb-1.5 mt-3 text-[11px] font-medium text-muted-foreground">
                  Mover a sector
                </p>
                <div className="space-y-1.5">
                  {data.targets.length ? (
                    data.targets.map((t) => {
                      const fits = t.freeTrays >= moveQty;
                      return (
                        <button
                          key={t.areaId}
                          type="button"
                          disabled={busy}
                          onClick={() => move(t.areaId)}
                          className="group flex w-full items-center justify-between rounded-lg border bg-background px-3 py-2 text-left transition-colors hover:border-[#185FA5]/50 hover:bg-[#185FA5]/[0.04] disabled:opacity-50"
                        >
                          <div className="min-w-0">
                            <span className="block truncate text-sm font-medium">{t.name}</span>
                            <span
                              className={cn(
                                "block text-[11px] tabular-nums",
                                fits
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : "text-amber-600 dark:text-amber-400",
                              )}
                            >
                              {t.freeTrays > 0
                                ? `${t.freeTrays.toLocaleString("es-CL")} libres${fits ? "" : " · sobrecupo"}`
                                : "sin espacio"}
                            </span>
                          </div>
                          <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-[#185FA5]" />
                        </button>
                      );
                    })
                  ) : (
                    <p className="text-[11px] text-muted-foreground">
                      No hay otros sectores de esta etapa.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={busy}
                  onClick={mermar}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-900/50 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-4 w-4" /> Mermar {moveQty.toLocaleString("es-CL")}{" "}
                  band.
                </button>
              </div>
            ) : (
              <div className="border-t-4 border-t-muted/60 px-4 py-8 text-center text-[11px] text-muted-foreground">
                <Layers className="mx-auto mb-1 h-4 w-4 opacity-50" />
                Nada seleccionado.
              </div>
            )}
          </div>

          <p className="px-1 text-[11px] text-muted-foreground">
            {workingMode ? (
              <>
                Mesa de trabajo · los cambios no tocan el plan real hasta que los
                apruebes.
              </>
            ) : (
              <>
                Editando el escenario{" "}
                <span className="font-medium text-foreground">{scenarioName}</span>.
                El plan real no se modifica.
              </>
            )}
          </p>
        </aside>
      </div>

      <DragOverlay dropAnimation={null}>
        {dragging ? (
          <div
            data-keep-selection
            className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-lg"
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SEAT_FULL }} />
            {dragging.species} · {dragging.trays.toLocaleString("es-CL")} band.
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function MesonCell({
  loc,
  fill,
  soloHoy,
  marcarSalen,
  expanded,
  hoveredKey,
  selectedKey,
  onToggle,
  onHover,
  onSelect,
}: {
  loc: SectorWorkspaceData["layout"]["modules"][number]["locations"][number];
  fill?: { trays: number; parts: FillPart[] };
  /** capa: true = sólo la foto real del snapshot, sin plan */
  soloHoy: boolean;
  /** filtro: pinta de azul lo ocupado hoy que el plan libera esta semana */
  marcarSalen: boolean;
  expanded: boolean;
  hoveredKey: string | null;
  selectedKey: string | null;
  onToggle: () => void;
  onHover: (key: string | null) => void;
  onSelect: (key: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `loc:${loc.id}` });
  const planCap = loc.planCapacityTrays ?? 0;
  const physCap = loc.capacityTrays ?? planCap;
  // La grilla es la capacidad física; la cuota de plan queda marcada dentro.
  const gridCap = Math.max(physCap, planCap);
  const planTrays = fill?.trays ?? 0;
  const realTrays = loc.trays;
  // Diff por totales de mesón: la proyección FIFO no sabe qué lote real es cuál.
  const stay = Math.min(realTrays, planTrays);
  const leave = Math.max(0, realTrays - planTrays);
  const free = Math.max(0, planCap - planTrays);
  const parts = fill?.parts ?? [];
  const hasSelected = parts.some((p) => lotKey(p.lotId, p.stage) === selectedKey);
  const pctOf = (n: number) => (gridCap ? Math.round((n / gridCap) * 100) : 0);
  const quotaFull = planCap > 0 && planTrays >= planCap;

  // Sillas: una por bandeja (escaladas si el mesón es grande).
  const perCell = gridCap > 320 ? Math.ceil(gridCap / 320) : 1;
  const totalSeats = Math.max(1, Math.round(gridCap / perCell));
  const quotaSeat =
    !soloHoy && planCap > 0 && planCap < gridCap ? Math.round(planCap / perCell) : -1;

  type Seat = { part: FillPart | null; kind: "stay" | "enter" | "leave" | "empty" };
  let seats: Seat[] = [];
  const staySeats = Math.round(stay / perCell);
  if (soloHoy) {
    for (const s of loc.species) {
      const n = Math.round(s.trays / perCell);
      for (let i = 0; i < n; i++)
        seats.push({
          part: { label: s.name, trays: s.trays, lotId: null, stage: null },
          kind: "stay",
        });
    }
  } else {
    const partSeats: Seat[] = [];
    for (const p of parts) {
      const n = Math.round(p.trays / perCell);
      for (let i = 0; i < n; i++)
        partSeats.push({ part: p, kind: partSeats.length < staySeats ? "stay" : "enter" });
    }
    // Verde contiguo = ocupación de hoy: primero lo que permanece, luego lo
    // que sale (verde/azul), y al final lo que el plan agrega (ámbar).
    const leaveSeats: Seat[] = [];
    for (let i = 0; i < Math.round(leave / perCell); i++)
      leaveSeats.push({ part: null, kind: "leave" });
    seats = [
      ...partSeats.slice(0, staySeats),
      ...leaveSeats,
      ...partSeats.slice(staySeats),
    ];
  }
  seats = seats.slice(0, totalSeats);
  while (seats.length < totalSeats) seats.push({ part: null, kind: "empty" });

  const seatStyle = (s: Seat): React.CSSProperties => {
    if (s.kind === "leave")
      return { backgroundColor: marcarSalen ? SEAT_LEAVE : SEAT_FULL };
    if (!s.part) return { backgroundColor: SEAT_EMPTY };
    const key = lotKey(s.part.lotId, s.part.stage);
    if (key && key === selectedKey) return { backgroundColor: SEAT_SELECTED };
    if (key && key === hoveredKey) return { backgroundColor: SEAT_HOVER };
    if (s.kind === "enter") return { backgroundColor: SEAT_ENTER };
    return { backgroundColor: SEAT_FULL };
  };

  const enter = Math.max(0, planTrays - stay);
  const barFree = Math.max(0, gridCap - (soloHoy ? realTrays : planTrays + leave));

  return (
    <div
      ref={setNodeRef}
      data-keep-selection
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-card p-1.5 text-[11px] transition-colors",
        quotaFull && !soloHoy && "border-red-400/60",
        hasSelected && "border-[#185FA5]/60",
        // Al arrastrar encima: verde si hay espacio, rojo si está lleno.
        isOver && (free > 0 ? "ring-2 ring-emerald-500" : "ring-2 ring-red-500"),
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between px-0.5 tabular-nums hover:text-foreground"
      >
        <span className="font-medium">{loc.code}</span>
        <span
          className="text-muted-foreground"
          title={
            soloHoy
              ? "ocupación real vs capacidad física"
              : leave > 0
                ? "hoy → con lo que entra según plan → tras las salidas de la semana, sobre la capacidad física"
                : "hoy → plan de la semana, ambos sobre la capacidad física"
          }
        >
          {!gridCap ? (
            soloHoy ? (
              realTrays
            ) : (
              planTrays
            )
          ) : soloHoy ? (
            `${pctOf(realTrays)}%`
          ) : (
            <>
              {pctOf(realTrays)}→{pctOf(realTrays + enter)}
              {leave > 0 ? (
                <>
                  →
                  <span className="font-medium" style={{ color: SEAT_LEAVE }}>
                    {pctOf(planTrays)}
                  </span>
                </>
              ) : null}
              %
            </>
          )}
        </span>
      </button>
      {expanded ? (
        <div className="flex flex-wrap items-center gap-[2px]">
          {seats.map((s, i) => {
            const key = s.part ? lotKey(s.part.lotId, s.part.stage) : null;
            return (
              <React.Fragment key={i}>
                {i === quotaSeat ? (
                  <span
                    title={`cuota de plan: ${planCap.toLocaleString("es-CL")} bandejas`}
                    className="h-3 w-[2px] rounded-full bg-foreground/40"
                  />
                ) : null}
                <span
                  onMouseEnter={() => onHover(key)}
                  onMouseLeave={() => onHover(null)}
                  onClick={() => key && !s.part?.sim && onSelect(key)}
                  title={
                    s.kind === "leave"
                      ? "ocupado hoy · sale esta semana según el plan"
                      : s.part?.sim
                        ? `${s.part.label} · simulación`
                        : (s.part?.label ?? "vacío")
                  }
                  className={cn(
                    "h-3 w-3 rounded-[2px] transition-colors",
                    key && "cursor-pointer",
                  )}
                  style={seatStyle(s)}
                />
              </React.Fragment>
            );
          })}
        </div>
      ) : (
        <div className="flex h-3.5 overflow-hidden rounded-sm">
          {soloHoy ? (
            realTrays > 0 ? (
              <div
                style={{ flexGrow: realTrays, flexBasis: 0, backgroundColor: SEAT_FULL }}
              />
            ) : null
          ) : (
            <>
              {stay > 0 ? (
                <div
                  style={{
                    flexGrow: stay,
                    flexBasis: 0,
                    backgroundColor: hasSelected ? SEAT_SELECTED : SEAT_FULL,
                  }}
                />
              ) : null}
              {leave > 0 ? (
                <div
                  style={{
                    flexGrow: leave,
                    flexBasis: 0,
                    backgroundColor: marcarSalen ? SEAT_LEAVE : SEAT_FULL,
                  }}
                />
              ) : null}
              {enter > 0 ? (
                <div
                  style={{
                    flexGrow: enter,
                    flexBasis: 0,
                    backgroundColor: hasSelected ? SEAT_SELECTED : SEAT_ENTER,
                  }}
                />
              ) : null}
            </>
          )}
          {barFree > 0 ? (
            <div style={{ flexGrow: barFree, flexBasis: 0, backgroundColor: SEAT_EMPTY }} />
          ) : null}
        </div>
      )}
    </div>
  );
}

/**
 * Card de "Por asignar": la card completa es arrastrable (a un mesón) y
 * clickeable (abre el menú de selección). Sin flecha ni manija — se asume que
 * clic = menú y arrastrar = mover. dnd-kit distingue clic de drag por la
 * distancia de activación (6px).
 */
function LotCard({
  item,
  selected,
  onSelect,
  onUnpin,
  disabled,
}: {
  item: SectorLotChip;
  selected: boolean;
  onSelect: () => void;
  onUnpin: () => void;
  disabled: boolean;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: item.lotId,
    disabled: item.sim,
  });
  const isOverflow = item.overflowTrays > 0;
  const accent = item.sim
    ? SEAT_ENTER
    : selected
      ? SEAT_SELECTED
      : isOverflow
        ? "#e24b4a"
        : SEAT_FULL;
  return (
    <div
      ref={setNodeRef}
      {...(item.sim ? {} : attributes)}
      {...(item.sim ? {} : listeners)}
      role={item.sim ? undefined : "button"}
      tabIndex={item.sim ? undefined : 0}
      onClick={item.sim ? undefined : onSelect}
      onKeyDown={(e) => {
        if (!item.sim && (e.key === "Enter" || e.key === " ")) onSelect();
      }}
      aria-pressed={item.sim ? undefined : selected}
      title={
        item.sim
          ? "Orden simulada — se edita en el Simulador"
          : "Clic para el menú · arrastra a un mesón"
      }
      className={cn(
        "relative w-[230px] shrink-0 touch-none overflow-hidden rounded-lg border bg-card py-2.5 pl-4 pr-3 text-left shadow-sm transition-colors lg:w-auto",
        !item.sim && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-40",
        selected
          ? "border-[#185FA5]/60 bg-[#185FA5]/[0.06] dark:bg-[#185FA5]/10"
          : !item.sim && "hover:border-foreground/20 hover:bg-muted/40",
      )}
    >
      <span
        className="absolute inset-y-0 left-0 w-1.5"
        style={{ backgroundColor: accent }}
      />
      <div className="truncate text-sm font-medium leading-tight">{item.species}</div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground tabular-nums">
        <span>{item.trays.toLocaleString("es-CL")} band.</span>
        {item.variety ? <span>· {item.variety}</span> : null}
        {item.sim ? (
          <span
            className="max-w-40 truncate rounded border px-1.5 py-0.5 font-medium"
            style={{ borderColor: SEAT_ENTER, color: SEAT_ENTER }}
            title={`Simulación: ${item.simName ?? ""}`}
          >
            {item.simName ?? "Simulación"}
          </span>
        ) : null}
        {isOverflow ? (
          <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-950/60 dark:text-red-300">
            {item.overflowTrays.toLocaleString("es-CL")} sin espacio
          </span>
        ) : null}
        {item.pinnedCode ? (
          <span className="inline-flex items-center gap-0.5 rounded bg-primary/10 px-1.5 py-0.5 text-primary">
            <Pin className="h-2.5 w-2.5" />
            {item.pinnedCode}
            <span
              role="button"
              tabIndex={0}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                if (!disabled) onUnpin();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.stopPropagation();
                  if (!disabled) onUnpin();
                }
              }}
              aria-label="Quitar pin"
              className="ml-0.5 cursor-pointer"
            >
              <PinOff className="h-2.5 w-2.5 opacity-60 hover:opacity-100" />
            </span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
