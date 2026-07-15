"use client";

import * as React from "react";
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
 * Mesa de trabajo del sector (dentro de un escenario), vista "estadio":
 * cada mesón se expande a sus bandejas ("sillas"). Gris = vacío, verde =
 * lleno, azul = hover del lote, y el lote seleccionado queda resaltado en
 * todos los mesones. Al seleccionar un lote se puede mover una cantidad
 * ajustable a otro sector (cae en su inbox de recepción). El inbox de la
 * derecha se arrastra sobre los mesones para fijar (pin) dentro del sector.
 */

const SEAT_EMPTY = "#c9ccd1";
const SEAT_FULL = "#2f9e44";
const SEAT_HOVER = "#378ADD";
const SEAT_SELECTED = "#185FA5";

const lotKey = (lotId: number | null, stage: string | null) =>
  lotId !== null && stage ? `${lotId}:${stage}` : null;

export function SectorWorkspace({
  scenarioId,
  scenarioName,
  data,
  initialLotCode = null,
  workingMode = false,
}: {
  scenarioId: number;
  scenarioName: string;
  data: SectorWorkspaceData;
  alertAt: number;
  /** código de lote a preseleccionar al entrar (viene del plano de proyección) */
  initialLotCode?: string | null;
  /** mesa de trabajo invisible: suaviza el copy (no menciona "escenario") */
  workingMode?: boolean;
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
  const allLocIds = React.useMemo(() => allLocs.map((l) => l.id), [allLocs]);

  const [busy, setBusy] = React.useState(false);
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
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: SEAT_SELECTED }} /> seleccionado
            </span>
          </div>
        </div>

        {/* Panel: en mobile arriba de los módulos; en desktop columna derecha. */}
        <aside className="order-first lg:order-none lg:sticky lg:top-16 lg:self-start">
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
          <div className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs shadow-lg">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: SEAT_FULL }} />
            {dragging.species} · {dragging.trays.toLocaleString("es-CL")} band.
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function seatColor(key: string | null, hoveredKey: string | null, selectedKey: string | null) {
  if (!key) return SEAT_EMPTY;
  if (key === selectedKey) return SEAT_SELECTED;
  if (key === hoveredKey) return SEAT_HOVER;
  return SEAT_FULL;
}

function MesonCell({
  loc,
  fill,
  expanded,
  hoveredKey,
  selectedKey,
  onToggle,
  onHover,
  onSelect,
}: {
  loc: SectorWorkspaceData["layout"]["modules"][number]["locations"][number];
  fill?: { trays: number; parts: FillPart[] };
  expanded: boolean;
  hoveredKey: string | null;
  selectedKey: string | null;
  onToggle: () => void;
  onHover: (key: string | null) => void;
  onSelect: (key: string | null) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `loc:${loc.id}` });
  const cap = loc.planCapacityTrays ?? 0;
  const trays = fill?.trays ?? 0;
  const pct = cap ? Math.round((trays / cap) * 100) : 0;
  const free = Math.max(0, cap - trays);
  const parts = fill?.parts ?? [];
  const hasSelected = parts.some((p) => lotKey(p.lotId, p.stage) === selectedKey);

  // Sillas: una por bandeja (escaladas si el mesón es grande).
  const perCell = cap > 320 ? Math.ceil(cap / 320) : 1;
  const seats: (FillPart | null)[] = [];
  for (const p of parts) {
    const n = Math.round(p.trays / perCell);
    for (let i = 0; i < n; i++) seats.push(p);
  }
  const totalSeats = Math.round(cap / perCell);
  while (seats.length < totalSeats) seats.push(null);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-card p-1.5 text-[11px] transition-colors",
        pct >= 100 && "border-red-400/60",
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
        <span className="text-muted-foreground">{cap ? `${pct}%` : trays}</span>
      </button>
      {expanded ? (
        <div className="flex flex-wrap gap-[2px]">
          {seats.map((p, i) => {
            const key = p ? lotKey(p.lotId, p.stage) : null;
            return (
              <span
                key={i}
                onMouseEnter={() => onHover(key)}
                onMouseLeave={() => onHover(null)}
                onClick={() => p && onSelect(key)}
                title={p?.label ?? "vacío"}
                className={cn("h-3 w-3 rounded-[2px] transition-colors", p && "cursor-pointer")}
                style={{ backgroundColor: seatColor(key, hoveredKey, selectedKey) }}
              />
            );
          })}
        </div>
      ) : (
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
  });
  const isOverflow = item.overflowTrays > 0;
  const accent = selected ? SEAT_SELECTED : isOverflow ? "#e24b4a" : SEAT_FULL;
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      aria-pressed={selected}
      title="Clic para el menú · arrastra a un mesón"
      className={cn(
        "relative w-[230px] shrink-0 cursor-grab touch-none overflow-hidden rounded-lg border bg-card py-2.5 pl-4 pr-3 text-left shadow-sm transition-colors active:cursor-grabbing lg:w-auto",
        isDragging && "opacity-40",
        selected
          ? "border-[#185FA5]/60 bg-[#185FA5]/[0.06] dark:bg-[#185FA5]/10"
          : "hover:border-foreground/20 hover:bg-muted/40",
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
