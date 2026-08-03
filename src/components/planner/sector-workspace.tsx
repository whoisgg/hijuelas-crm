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
import { AGE_COLORS, ageColor, ageLabel } from "@/components/planner/age-distribution";
import {
  mermarScenarioLotPortion,
  moveScenarioLotPortion,
  pinLotToLocation,
} from "@/lib/actions/planner-scenarios";
import {
  SEAT_GAP,
  mesonBoxWidthPx,
  seatColsFor,
  seatPadFor,
  seatRowsFor,
  seatWidthCss,
  targetAspectFor,
} from "@/lib/planner/seat-grid";
import type {
  FillPart,
  SectorLotChip,
  SectorWorkspaceData,
} from "@/lib/planner/scenario-workspace";

/**
 * Mesa de trabajo del sector, vista "estadio" única (realidad + plan):
 * cada mesón se expande a sus bandejas ("sillas") sobre su cuota de plan.
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

/**
 * Punto de rotación en el encabezado de un mesón.
 *
 * El porcentaje muestra el NETO, que es lo correcto para leer ocupación, pero
 * una semana en que sale un lote y entra otro se ve casi plana. Este punto marca
 * la dirección que el neto NO alcanza a mostrar, reusando el color que la
 * leyenda ya definió (ámbar = entra, violeta = sale): no hay símbolo nuevo que
 * el usuario tenga que aprender, y el detalle en bandejas está en el tooltip.
 */
function RotationDots({ colors }: { colors: readonly string[] }) {
  return (
    <span aria-hidden className="inline-flex gap-px align-middle">
      {colors.map((c) => (
        <span
          key={c}
          className="size-1 rounded-full"
          style={{ backgroundColor: c }}
        />
      ))}
    </span>
  );
}

/** Tope de sillas dibujadas por mesón: por encima, cada silla agrupa varias
 *  bandejas (`perCell`) en vez de reventar el DOM. */
const SEAT_MAX = 320;

type LayoutLoc = SectorWorkspaceData["layout"]["modules"][number]["locations"][number];

/**
 * Capacidad que dibuja la grilla del mesón: la CUOTA DE PLAN, no la capacidad
 * física. El área reparte su capacidad de planificación entre sus mesones (ver
 * layout-data) y esa cuota es la que manda en todo lo operativo — `freeOf`, el
 * drop de un lote y la timeline miden contra ella. Dibujar la capacidad física
 * dejaba una cola gris permanente (21% del mesón en Góticos) que se leía como
 * espacio libre pero rechazaba cualquier lote.
 *
 * Si hoy hay MÁS material del que la cuota permite, la grilla se estira hasta
 * lo real: esconder bandejas que están físicamente ahí sería peor.
 */
const gridCapOf = (
  loc: Pick<LayoutLoc, "capacityTrays" | "planCapacityTrays" | "trays">,
) => Math.max(loc.planCapacityTrays || loc.capacityTrays || 0, loc.trays);
const perCellOf = (gridCap: number) =>
  gridCap > SEAT_MAX ? Math.ceil(gridCap / SEAT_MAX) : 1;
const seatCountOf = (
  loc: Pick<LayoutLoc, "capacityTrays" | "planCapacityTrays" | "trays">,
) => {
  const cap = gridCapOf(loc);
  return Math.max(1, Math.round(cap / perCellOf(cap)));
};

type LayoutModule = SectorWorkspaceData["layout"]["modules"][number];

/** Lados presentes en el módulo (A/B en Góticos, C/D en el 2, …). */
const sidesOf = (m: LayoutModule) =>
  [...new Set(m.locations.map((l) => l.side).filter(Boolean))] as string[];

/** El módulo tiene geometría real (lado + fila) y se dibuja como plano. */
const isGeom = (m: LayoutModule) =>
  sidesOf(m).length > 0 && m.locations.every((l) => l.side && l.rowNum !== null);

/** Sillas que ocupan `trays` bandejas: cualquier cantidad > 0 pinta al menos
 *  una silla, aunque no alcance a llenarla. Con mesones grandes (una silla =
 *  hasta 44 bandejas) el redondeo hacia abajo hacía desaparecer del plano los
 *  lotes chicos. */
const seatsOf = (trays: number, perCell: number) =>
  trays > 0 ? Math.max(1, Math.round(trays / perCell)) : 0;

const lotKey = (lotId: number | null, stage: string | null) =>
  lotId !== null && stage ? `${lotId}:${stage}` : null;

/** minúsculas + sin tildes + sin espacios extra — para matchear especie/
 *  variedad entre fuentes con normalización distinta (inventario vs maestro). */
const normName = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/** exact = mismo nombre; prefix = el maestro es prefijo del texto crudo del
 *  inventario con límite de palabra ("York" ⊂ "York 6624" — el sufijo es del
 *  delivery note, no otra variedad). No se recorta nada del maestro, así que
 *  variedades que legítimamente terminan en números ("OB18064") no se ven
 *  afectadas. */
const varietyNameMatch = (
  master: string | null | undefined,
  raw: string,
): "exact" | "prefix" | null => {
  const cv = normName(master ?? "");
  const tv = normName(raw);
  if (!cv) return null;
  if (cv === tv) return "exact";
  if (tv.startsWith(cv) && /[\s-]/.test(tv[cv.length] ?? "")) return "prefix";
  return null;
};

/** Bandeja real de un mesón que ningún lote llegado del plan cubre, con el
 *  lote al que el sistema la atribuye automáticamente (null = sin candidato). */
type LeaveSlot = {
  name: string;
  variety: string | null;
  trays: number;
  chip: SectorLotChip | null;
};

/** Clave de selección para material real sin lote llegado — le da identidad
 *  propia (hover/clic como un lote) sin fusionarlo con un lote del plan. */
const matKey = (name: string, variety: string | null) =>
  `mat:${normName(name)}::${normName(variety ?? "")}`;

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

  /**
   * Geometría del estadio, decidida una vez para TODO EL SECTOR.
   *
   * Antes se calculaba por módulo y cada uno elegía sus propias filas y su
   * propio ancho de silla: Gótico 1 quedaba en cards de ~830px, Gótico 3 en
   * ~930 y Gótico 4 en ~710, con el pasillo variando para compensar. El plano
   * se leía desparejo de arriba a abajo (reporte del usuario). Con una sola
   * geometría todos los mesones del sector miden igual y las filas se alinean.
   *
   * Un mesón con menos cuota dibuja MENOS columnas dentro de esa card —
   * rectángulo más corto, sillas del mismo tamaño— que es la lectura correcta:
   * el tamaño del bloque es la capacidad, no el tamaño de la card.
   */
  const sectorGeom = React.useMemo(() => {
    const modules = data.layout.modules;
    const counts = allLocs.map(seatCountOf);
    const geom = modules.every(isGeom);
    const maxSides = Math.max(1, ...modules.map((m) => sidesOf(m).length));
    // Cuántas cards entran a lo ancho: los lados solo cuando el sector se
    // dibuja como rejilla lado × fila (Góticos, 2 lados). Con más lados
    // (TunelTek) el plano se agrupa por letra sobre la grilla genérica de 8,
    // así que el ancho de card —y con él la geometría de las sillas— es el
    // mismo de las zonas sin geometría.
    const cardsPerRow = geom && maxSides <= 2 ? maxSides : 8;
    // Con pocas cards por fila cada una es enorme y el tope de 12px por silla
    // deja media card vacía — el caso de Góticos (2 lados), que es el que hubo
    // que arreglar. Con la grilla de 8 la card ya es angosta y el tope no
    // muerde: esas zonas quedan como estaban.
    const wideCards = geom && cardsPerRow <= 2;
    const seatRows = seatRowsFor(counts, targetAspectFor(cardsPerRow, wideCards));
    const seatMaxCols = Math.max(
      1,
      ...counts.map((n) => seatColsFor(n, seatRows)),
    );
    return { seatRows, seatMaxCols, wideCards };
  }, [data.layout.modules, allLocs]);

  // Salidas/Ingresos totales del sector esta semana — alimentan el KPI del
  // header (el detalle por mesón sigue viviendo en cada MesonCell).
  const leaveTotal = React.useMemo(
    () =>
      allLocs.reduce(
        (s, l) => s + Math.max(0, l.trays - (data.fill[l.id]?.trays ?? 0)),
        0,
      ),
    [allLocs, data.fill],
  );
  const enterTotal = React.useMemo(
    () =>
      allLocs.reduce(
        (s, l) => s + Math.max(0, (data.fill[l.id]?.trays ?? 0) - l.trays),
        0,
      ),
    [allLocs, data.fill],
  );

  // Antigüedad del sector completo — alimenta el mensaje cuando el toggle
  // está activo, en vez de la tarjeta de estadística que había antes.
  const ageSummary = React.useMemo(() => {
    let trays = 0;
    let weighted = 0;
    for (const l of allLocs) {
      for (const b of l.ageBuckets) {
        trays += b.trays;
        weighted += b.trays * b.months;
      }
    }
    return { trays, avg: trays ? weighted / trays : null };
  }, [allLocs]);

  const [busy, setBusy] = React.useState(false);
  // Capa: false = realidad + plan de la semana; true = sólo la foto real.
  const [soloHoy, setSoloHoy] = React.useState(false);
  // Filtro: pinta de violeta las bandejas ocupadas hoy que el plan libera.
  // Activo por defecto — es la lectura más común del plano ("¿qué sale?").
  const [marcarSalen, setMarcarSalen] = React.useState(true);
  // Overlay: escribe los meses de antigüedad sobre cada silla ocupada hoy.
  const [mostrarEdad, setMostrarEdad] = React.useState(false);
  // Antigüedad de la última silla tocada (hover en desktop, tap en mobile) —
  // el title nativo no se ve en touch y es poco legible en desktop.
  const [ageHover, setAgeHover] = React.useState<number | null | undefined>(undefined);
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

  // Incluye los lotes fuera de la semana vigente (areaLots): una silla real
  // atribuida a una remesa atrasada también debe poder seleccionarse para
  // mover/mermar. contents pisa (trae el overflow real de la semana).
  const chipByKey = React.useMemo(() => {
    const m = new Map<string, SectorLotChip>();
    for (const c of data.areaLots) m.set(`${c.lotId}:${c.stage}`, c);
    for (const c of data.contents) m.set(`${c.lotId}:${c.stage}`, c);
    return m;
  }, [data.areaLots, data.contents]);
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
  // data-keep-selection. Escape deselecciona desde cualquier lado.
  React.useEffect(() => {
    if (!selectedKey) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target?.closest("[data-keep-selection]")) return;
      setSelectedKey(null);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedKey(null);
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [selectedKey]);

  // Atribución de material real a lotes del plan. Supuestos (definidos con
  // el usuario, 2026-07-30) — el sistema asigna solo, sin intervención:
  //
  // a. Variedad exacta manda (normalizado sin tildes: "Magica" ↔ "Mágica").
  // b. Si el maestro es PREFIJO del texto crudo del inventario con límite de
  //    palabra ("York" ⊂ "York 6624"), se asume esa variedad — el sufijo es
  //    del delivery note, no otra variedad. No se recorta nada del maestro,
  //    así que variedades que legítimamente terminan en números ("OB18064")
  //    no se ven afectadas.
  // c. Primero lotes activos ESTA semana; si no hay, lotes del sector en
  //    CUALQUIER semana (remesa atrasada cuya ventana de plan ya cerró —
  //    ej. "Dina" cerrada en semana 28/29, real todavía ahí en la 30).
  // d. Si aun así hay varios candidatos (o solo coincide la especie), gana
  //    el de cantidad más parecida a las bandejas reales.
  // e. Sin candidato llegado → la silla queda como material real informativo
  //    (el tooltip explica), sin panel ni acción — no hay nada que el
  //    usuario pueda decidir ahí.
  const sortCandidates = (a: SectorLotChip, b: SectorLotChip) =>
    Number(b.overflowTrays > 0) - Number(a.overflowTrays > 0) ||
    Number(!b.pinnedLocationId) - Number(!a.pinnedLocationId);
  const dedupeChips = (list: SectorLotChip[]) => {
    const byKey = new Map<string, SectorLotChip>();
    for (const c of list) byKey.set(`${c.lotId}:${c.stage}`, c);
    return [...byKey.values()];
  };
  const bySpecies = (list: SectorLotChip[], name: string) =>
    list.filter((c) => normName(c.species) === normName(name));

  /** Resuelve una entrada real (especie+variedad+bandejas) al mejor lote
   *  candidato aplicando los supuestos de arriba.
   *
   *  Invariante duro (regla del usuario): verde = presente al inicio de la
   *  semana; amarillo = lo que el plan trae durante la semana. Un mismo lote
   *  JAMÁS puede ser verde y amarillo a la vez, así que material real solo
   *  se atribuye a lotes que llegaron en semanas ANTERIORES (arrivalWeek <
   *  vigente). El material cuyo único lote entra esta semana o después queda
   *  como "material real" con identidad propia — seleccionable, pero nunca
   *  fusionado con el lote amarillo. */
  const resolveEntry = React.useCallback(
    (name: string, variety: string | null, trays: number): SectorLotChip | null => {
      const arrived = (list: SectorLotChip[]) =>
        list.filter((c) => c.arrivalWeek < data.week);
      const byCloseness = (a: SectorLotChip, b: SectorLotChip) =>
        Math.abs(a.trays - trays) - Math.abs(b.trays - trays) || sortCandidates(a, b);
      const tier = (list: SectorLotChip[], kind: "exact" | "prefix") =>
        variety
          ? bySpecies(list, name)
              .filter((c) => varietyNameMatch(c.variety, variety) === kind)
              .sort(byCloseness)
          : [];
      for (const list of [arrived(data.contents), arrived(data.areaLots)]) {
        const exact = tier(list, "exact");
        if (exact.length) return exact[0];
        const prefix = tier(list, "prefix");
        if (prefix.length) return prefix[0];
      }
      const loose = dedupeChips([
        ...bySpecies(arrived(data.contents), name),
        ...bySpecies(arrived(data.areaLots), name),
      ]).sort(byCloseness);
      return loose[0] ?? null;
    },
    [data.contents, data.areaLots, data.week],
  );

  // Asignación automática por mesón: al material real se le descuenta lo que
  // los lotes del plan YA llegados cubren (por especie+variedad, mismos
  // supuestos de match) y el sobrante se atribuye solo al mejor candidato.
  // El usuario no vincula nada a mano — la silla queda hovereable y
  // seleccionable como cualquier lote.
  const leaveSlotsByLoc = React.useMemo(() => {
    const map = new Map<number, LeaveSlot[]>();
    for (const m of data.layout.modules) {
      for (const loc of m.locations) {
        const parts = data.fill[loc.id]?.parts ?? [];
        const remaining = loc.species.map((s) => ({ ...s }));
        for (const p of parts) {
          if (p.arrivalWeek >= data.week) continue; // aún no llega: no cubre real
          let left = p.trays;
          for (const r of remaining) {
            if (left <= 0) break;
            if (normName(r.name) !== normName(p.species)) continue;
            if (p.variety && r.variety && !varietyNameMatch(p.variety, r.variety)) continue;
            const take = Math.min(left, r.trays);
            r.trays -= take;
            left -= take;
          }
        }
        map.set(
          loc.id,
          remaining
            .filter((r) => r.trays > 0)
            .map((r) => ({
              name: r.name,
              variety: r.variety,
              trays: r.trays,
              chip: resolveEntry(r.name, r.variety, r.trays),
            })),
        );
      }
    }
    return map;
  }, [data.layout.modules, data.fill, data.week, resolveEntry]);

  // Material real sin lote llegado, agrupado por especie+variedad — la
  // entidad seleccionable cuando ninguna atribución aplica. Da paridad de
  // interacción (hover/clic como cualquier lote) sin fusionar el material
  // con un lote amarillo.
  const selectedMaterial = React.useMemo(() => {
    if (!selectedKey?.startsWith("mat:")) return null;
    let name = "";
    let variety: string | null = null;
    let trays = 0;
    const locs: string[] = [];
    for (const m of data.layout.modules) {
      for (const loc of m.locations) {
        for (const sl of leaveSlotsByLoc.get(loc.id) ?? []) {
          if (sl.chip || matKey(sl.name, sl.variety) !== selectedKey) continue;
          name = sl.name;
          variety = sl.variety;
          trays += sl.trays;
          locs.push(`${loc.code} (${sl.trays.toLocaleString("es-CL")})`);
        }
      }
    }
    if (!name) return null;
    // El lote pendiente más probable (misma variedad, entra esta semana o
    // después) — para explicar el desfase con nombre y semana concretos.
    const pending =
      data.areaLots
        .filter(
          (c) =>
            normName(c.species) === normName(name) &&
            c.arrivalWeek >= data.week &&
            (!variety || varietyNameMatch(c.variety, variety) !== null),
        )
        .sort(
          (a, b) =>
            a.arrivalWeek - b.arrivalWeek ||
            Math.abs(a.trays - trays) - Math.abs(b.trays - trays),
        )[0] ?? null;
    return { name, variety, trays, locs, pending };
  }, [selectedKey, leaveSlotsByLoc, data.layout.modules, data.areaLots, data.week]);

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
      // Material real: expandir también los mesones donde está físicamente.
      if (key.startsWith("mat:")) {
        for (const [locId, slots] of leaveSlotsByLoc) {
          if (slots.some((sl) => !sl.chip && matKey(sl.name, sl.variety) === key)) {
            next.add(locId);
          }
        }
      }
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

  // Mensaje del toggle activo — hoy solo Antigüedad lo necesita (Salidas ya
  // muestra su número directo en el KPI, no hace falta repetirlo en texto).
  const statusMessage = mostrarEdad
    ? ageSummary.trays > 0
      ? `${ageSummary.trays.toLocaleString("es-CL")} bandejas con fecha · antigüedad promedio ${ageSummary.avg!.toFixed(1)} meses.`
      : "La foto activa no trae fechas de plantación."
    : null;

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
          <div
            className="flex items-center gap-1.5"
            title="Foto del último snapshot, medida contra la capacidad física de los mesones."
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SEAT_FULL }} />
            <span className="text-muted-foreground">
              Hoy{snapshotDate ? ` (${snapshotDate})` : ""}
            </span>
            <span className="font-semibold tabular-nums">
              {bar.realTrays.toLocaleString("es-CL")}
            </span>
            <span className="text-muted-foreground">({Math.round(bar.realPct)}%)</span>
          </div>
          {!soloHoy && !mostrarEdad ? (
            <div
              className="flex items-center gap-1.5"
              title="Bandejas que el plan trae esta semana en mesones que hoy no las tienen."
            >
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: SEAT_ENTER }}
              />
              <span className="text-muted-foreground">Ingresos</span>
              <span className="font-semibold tabular-nums">
                {enterTotal.toLocaleString("es-CL")}
              </span>
            </div>
          ) : null}
          {!soloHoy && !mostrarEdad ? (
            <label
              className="flex cursor-pointer select-none items-center gap-1.5"
              title="Bandejas ocupadas hoy que el plan libera esta semana. Pinta el plano de violeta."
            >
              <input
                type="checkbox"
                checked={marcarSalen}
                onChange={(e) => setMarcarSalen(e.target.checked)}
                className="h-4 w-4 accent-[#8b5cf6]"
              />
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: SEAT_LEAVE }}
              />
              <span className="text-muted-foreground">Salidas</span>
              <span className="font-semibold tabular-nums">
                {leaveTotal.toLocaleString("es-CL")}
              </span>
            </label>
          ) : null}
          <div
            className="flex items-center gap-1.5"
            title="Neto de la semana: Hoy + Ingresos − Salidas, contra capacidad de planificación."
          >
            <span className="h-2 w-2 shrink-0 rounded-full border border-muted-foreground/50" />
            <span className="text-muted-foreground">Neto</span>
            <span className="font-semibold tabular-nums">
              {bar.planTrays.toLocaleString("es-CL")}
            </span>
            <span className="text-muted-foreground">({Math.round(bar.planPct)}%)</span>
          </div>
          <label
            className="flex cursor-pointer select-none items-center gap-1.5"
            title="Colorea cada silla ocupada hoy según su antigüedad (0 a 6+ meses)."
          >
            <input
              type="checkbox"
              checked={mostrarEdad}
              onChange={(e) => setMostrarEdad(e.target.checked)}
              className="h-4 w-4 accent-foreground"
            />
            Antigüedad
          </label>
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
          {anyExpanded ? (
            <button
              type="button"
              onClick={() => setExpanded(new Set())}
              className="rounded-full border px-2.5 py-1 transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              Colapsar todo
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                setExpanded(
                  new Set(data.layout.modules.flatMap((m) => m.locations.map((l) => l.id))),
                )
              }
              className="rounded-full border px-2.5 py-1 transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              Expandir todo
            </button>
          )}
        </div>
      ) : null}

      {/* Swatches del plano: ocupación/plan por defecto, o la escala de
          antigüedad cuando ese toggle reemplaza la paleta. */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        {mostrarEdad ? (
          <span className="flex items-center gap-2">
            {AGE_COLORS.map((c, i) => (
              <span key={c} className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c }} />
                {i === AGE_COLORS.length - 1 ? "6+ m" : `${i} m`}
              </span>
            ))}
          </span>
        ) : (
          <>
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
            {/* Azul = TODAS las sillas del lote apuntado o seleccionado, no un
                estado del cursor: la leyenda nombra el lote, no el hover. */}
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SEAT_HOVER }} />
              lote
            </span>
          </>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Plano estadio */}
        <div className="space-y-5">
          {statusMessage || !bar ? (
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              {statusMessage ? <span>{statusMessage}</span> : null}
              {/* Sin barra de KPIs (modo simulador) no hay dónde más ponerlo — con
                  barra, el botón vive junto a "Solo hoy". */}
              {!bar ? (
                anyExpanded ? (
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
                        new Set(data.layout.modules.flatMap((m) => m.locations.map((l) => l.id))),
                      )
                    }
                    className="underline-offset-2 hover:underline"
                  >
                    Expandir todo
                  </button>
                )
              ) : null}
            </div>
          ) : null}

          {data.layout.modules.map((m) => {
            const sides = sidesOf(m);
            const hasGeom = isGeom(m);
            const { seatRows, seatMaxCols } = sectorGeom;
            const cell = (loc: LayoutLoc) => (
              <MesonCell
                key={loc.id}
                loc={loc}
                seatRows={seatRows}
                seatMaxCols={seatMaxCols}
                wideCards={sectorGeom.wideCards}
                fill={data.fill[loc.id]}
                week={data.week}
                soloHoy={soloHoy}
                marcarSalen={marcarSalen}
                mostrarEdad={mostrarEdad}
                onAgeHover={setAgeHover}
                expanded={expanded.has(loc.id)}
                hoveredKey={hoveredKey}
                selectedKey={selectedKey}
                onToggle={() => toggleExpand(loc.id)}
                onHover={setHoveredKey}
                onSelect={selectLot}
                leaveSlots={leaveSlotsByLoc.get(loc.id) ?? []}
              />
            );

            // Muchos lados (TunelTek: K…P): un bloque por letra en vez de una
            // rejilla lado × fila. Las filas no existen parejas en todos los
            // lados (K parte en la 3, O tiene 2 mesones, P uno solo), así que
            // la rejilla rectangular dejaba 22 de 60 celdas vacías. Con dos
            // lados (Góticos) la rejilla sí cierra y se conserva.
            if (hasGeom && !sectorGeom.wideCards) {
              return (
                <section key={m.id}>
                  <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                    {m.name}
                  </h3>
                  <div className="space-y-3">
                    {sides.map((side) => {
                      // `locations` ya viene ordenado por lado y luego por el
                      // número del código (ver `getSectorLayout`).
                      const locs = m.locations.filter((l) => l.side === side);
                      if (!locs.length) return null;
                      return (
                        <div key={side}>
                          <div className="mb-1 flex items-baseline gap-2">
                            <span className="text-xs font-semibold">{side}</span>
                            <span className="text-[11px] text-muted-foreground">
                              {locs.length}{" "}
                              {locs.length === 1 ? "mesón" : "mesones"}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 items-start gap-1.5 sm:grid-cols-6 md:grid-cols-8">
                            {locs.map(cell)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            }

            const cells = hasGeom
              ? [...new Set(m.locations.map((l) => l.rowNum))]
                  .sort((a, b) => (a ?? 0) - (b ?? 0))
                  .flatMap((row) =>
                    sides.map((side) => {
                      const loc = m.locations.find(
                        (l) => l.side === side && l.rowNum === row,
                      );
                      return loc ? (
                        cell(loc)
                      ) : (
                        <div key={`${side}${row}`} className="h-12" />
                      );
                    }),
                  )
              : m.locations.map(cell);
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
                      ? {
                          // Tope al ancho que el mesón realmente ocupa: con
                          // las sillas topadas en 12px, `1fr` dejaba media
                          // card vacía a la derecha. Sigue siendo
                          // `minmax(0, …)` para que en pantallas angostas la
                          // columna encoja.
                          gridTemplateColumns: `repeat(${sides.length}, minmax(0,${mesonBoxWidthPx(seatMaxCols)}px))`,
                          // Lo que sobra se vuelve el pasillo entre lados, en
                          // vez de un hueco muerto al final de la fila. El
                          // primer lado queda alineado con el título.
                          justifyContent: "space-between",
                        }
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
                    {/* El título ya dice la especie: acá solo variedad y código
                     *  de lote (el `label` del chip repite la especie). El
                     *  código lleva a la ficha del lote — por código, no por
                     *  id: estos chips son de `planner_scenario_lots` (mesa de
                     *  trabajo) y su id no es el de `planner_lots`. Las órdenes
                     *  simuladas no tienen ficha real. */}
                    <p className="truncate text-[11px] text-muted-foreground">
                      {selectedChip.variety ? `${selectedChip.variety} · ` : ""}
                      {selectedChip.sim ? (
                        selectedChip.lotCode
                      ) : (
                        <Link
                          href={`/planner/lotes/${encodeURIComponent(selectedChip.lotCode)}`}
                          className="font-medium text-[#185FA5] underline-offset-2 hover:underline"
                        >
                          {selectedChip.lotCode}
                        </Link>
                      )}
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
            ) : selectedMaterial ? (
              <div className="border-t-4 border-t-muted/60 px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {selectedMaterial.name}
                      {selectedMaterial.variety ? ` ${selectedMaterial.variety}` : ""}
                    </p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      Material real · sin lote llegado en el plan
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
                <div className="mt-2.5 space-y-1.5 text-[11px] text-muted-foreground">
                  <p>
                    <span className="font-medium text-foreground">
                      {selectedMaterial.trays.toLocaleString("es-CL")} band.
                    </span>{" "}
                    en {selectedMaterial.locs.join(", ")}
                  </p>
                  {selectedMaterial.pending ? (
                    <p>
                      Según el plan, el lote{" "}
                      <span className="font-medium text-foreground">
                        {selectedMaterial.pending.label}
                      </span>{" "}
                      recién entra en la S{selectedMaterial.pending.arrivalWeek} —
                      pero estas bandejas ya están acá. Si son de ese lote (llegó
                      adelantado), corrige su semana de inicio en{" "}
                      <Link
                        href="/planner/lotes"
                        className="font-medium text-[#185FA5] underline-offset-2 hover:underline"
                      >
                        Lotes
                      </Link>{" "}
                      y el plano las reconocerá solo.
                    </p>
                  ) : (
                    <p>
                      El plan no tiene ningún lote de esta variedad en el sector —
                      falta crearlo en{" "}
                      <Link
                        href="/planner/lotes"
                        className="font-medium text-[#185FA5] underline-offset-2 hover:underline"
                      >
                        Lotes
                      </Link>
                      .
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="border-t-4 border-t-muted/60 px-4 py-8 text-center text-[11px] text-muted-foreground">
                <Layers className="mx-auto mb-1 h-4 w-4 opacity-50" />
                Nada seleccionado.
              </div>
            )}
          </div>

          {mostrarEdad && ageHover !== undefined ? (
            <div className="mb-3 rounded-xl border bg-card px-4 py-3 shadow-sm">
              <p className="text-[11px] text-muted-foreground">Antigüedad</p>
              <p className="text-sm font-semibold">
                {ageHover !== null ? ageLabel(ageHover) : "sin fecha"}
              </p>
            </div>
          ) : null}

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
  seatRows,
  seatMaxCols,
  wideCards,
  fill,
  week,
  soloHoy,
  marcarSalen,
  mostrarEdad,
  onAgeHover,
  expanded,
  hoveredKey,
  selectedKey,
  onToggle,
  onHover,
  onSelect,
  leaveSlots,
}: {
  loc: LayoutLoc;
  /** filas del estadio, iguales para todo el sector (solo si `wideCards`) */
  seatRows: number;
  /** columnas del mesón más grande del sector: fija el ancho de silla */
  seatMaxCols: number;
  /**
   * Sector de pocas cards por fila (Góticos): el estadio se dibuja como un
   * rectángulo cerrado de columnas calculadas. En el resto se mantiene el
   * flujo original —sillas de 12px que envuelven según el ancho de la card—,
   * que en cards angostas da mesones altos y es como estaban.
   */
  wideCards: boolean;
  fill?: { trays: number; parts: FillPart[] };
  /** semana-campaña que se está mirando: decide qué lotes ya "llegaron" */
  week: number;
  /** capa: true = sólo la foto real del snapshot, sin plan */
  soloHoy: boolean;
  /** filtro: pinta de azul lo ocupado hoy que el plan libera esta semana */
  marcarSalen: boolean;
  /** overlay: escribe los meses de antigüedad sobre cada silla ocupada hoy */
  mostrarEdad: boolean;
  /** hover/tap de una silla en modo antigüedad — alimenta la tarjeta del panel */
  onAgeHover: (months: number | null) => void;
  expanded: boolean;
  hoveredKey: string | null;
  selectedKey: string | null;
  onToggle: () => void;
  onHover: (key: string | null) => void;
  onSelect: (key: string | null) => void;
  /** material real sin cubrir por el plan, ya atribuido automáticamente a su
   *  mejor lote candidato (chip null = material con identidad propia, se
   *  selecciona vía matKey) */
  leaveSlots: LeaveSlot[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `loc:${loc.id}` });
  const planCap = loc.planCapacityTrays ?? 0;
  const physCap = loc.capacityTrays ?? planCap;
  // La grilla es la cuota de plan (ver gridCapOf): mesón lleno = rectángulo
  // lleno, sin cola de capacidad física que el plan nunca puede usar.
  const gridCap = gridCapOf(loc);
  const planTrays = fill?.trays ?? 0;
  const realTrays = loc.trays;
  // Diff por totales de mesón: la proyección FIFO no sabe qué lote real es cuál.
  const stay = Math.min(realTrays, planTrays);
  const leave = Math.max(0, realTrays - planTrays);
  // Un mesón se mueve en UNA dirección: `enter` y `leave` salen del mismo diff
  // de totales con signo opuesto, así que nunca son ambos > 0. Por eso el
  // encabezado muestra `hoy ±delta → neto` y no una cadena de tres (el término
  // del medio repetía siempre el primero).
  const delta = planTrays - realTrays;
  const free = Math.max(0, planCap - planTrays);
  const parts = fill?.parts ?? [];
  const hasSelected =
    parts.some((p) => lotKey(p.lotId, p.stage) === selectedKey) ||
    leaveSlots.some(
      (sl) =>
        (sl.chip
          ? lotKey(sl.chip.lotId, sl.chip.stage)
          : matKey(sl.name, sl.variety)) === selectedKey,
    );
  const pctOf = (n: number) => (gridCap ? Math.round((n / gridCap) * 100) : 0);
  // El delta se saca de los extremos YA redondeados, no de las bandejas: así
  // `hoy ± delta = neto` cierra siempre en pantalla. Redondear cada término por
  // separado dejaba casos donde la resta no daba (50% −20 → 31%).
  const pctDelta = pctOf(planTrays) - pctOf(realTrays);

  // Flujo BRUTO del mesón. `leave`/`enter` de arriba son un diff de totales, así
  // que se anulan entre sí y una semana con rotación (sale un lote y entra otro)
  // se lee como si casi nada se moviera. Los lotes del plan sí traen su semana
  // de llegada, así que lo que ENTRA se puede separar de lo que se QUEDA, y de
  // ahí sale lo que realmente tiene que salir.
  const planEnterTrays = parts.reduce(
    (s, p) => (p.arrivalWeek >= week ? s + p.trays : s),
    0,
  );
  const planStayTrays = parts.reduce(
    (s, p) => (p.arrivalWeek < week ? s + p.trays : s),
    0,
  );
  const grossOut = Math.max(0, realTrays - planStayTrays);
  // El encabezado sigue mostrando el NETO (es lo correcto para ocupación); esto
  // solo marca que el neto esconde movimiento en los dos sentidos.
  const rotates = !soloHoy && planEnterTrays > 0 && grossOut > 0;
  const quotaFull = planCap > 0 && planTrays >= planCap;

  // Sillas: una por bandeja (escaladas si el mesón es grande).
  const perCell = perCellOf(gridCap);
  const totalSeats = Math.max(1, Math.round(gridCap / perCell));
  // Rectángulo del mesón: columnas propias, relleno para cerrar la última fila.
  const seatCols = seatColsFor(totalSeats, seatRows);
  const seatPad = seatPadFor(totalSeats, seatRows);

  type Seat = { part: FillPart | null; kind: "stay" | "enter" | "leave" | "empty" };
  let seats: Seat[] = [];
  if (soloHoy) {
    for (const s of loc.species) {
      const n = seatsOf(s.trays, perCell);
      const label = s.variety ? `${s.name} ${s.variety}` : s.name;
      for (let i = 0; i < n; i++)
        seats.push({
          part: {
            label,
            trays: s.trays,
            lotId: null,
            stage: null,
            arrivalWeek: week,
            startWeek: week,
            species: s.name,
            variety: s.variety,
          },
          kind: "stay",
        });
    }
  } else {
    // Kind por lote completo, no por conteo agregado del mesón: un lote ya
    // "llegó" (stay) si su semana de inicio de etapa es anterior a la que se
    // está mirando; si es la actual o futura, "entra" (enter) — el plan lo
    // trae esta semana o después. Nunca se parte un mismo lote entre los dos.
    const stayPartSeats: Seat[] = [];
    const enterPartSeats: Seat[] = [];
    for (const p of parts) {
      const n = seatsOf(p.trays, perCell);
      const kind: "stay" | "enter" = p.arrivalWeek < week ? "stay" : "enter";
      const bucket = kind === "stay" ? stayPartSeats : enterPartSeats;
      for (let i = 0; i < n; i++) bucket.push({ part: p, kind });
    }
    // Verde contiguo = ocupación de hoy: primero lo que permanece, luego lo
    // que sale (violeta), y al final lo que el plan agrega (ámbar).
    const leaveSeats: Seat[] = [];
    for (let i = 0; i < seatsOf(leave, perCell); i++)
      leaveSeats.push({ part: null, kind: "leave" });
    seats = [...stayPartSeats, ...leaveSeats, ...enterPartSeats];
  }
  seats = seats.slice(0, totalSeats);
  while (seats.length < totalSeats) seats.push({ part: null, kind: "empty" });

  // Material real por silla "sale esta semana": expande los slots ya
  // resueltos por el padre (sobrante real tras descontar lo que el plan
  // llegado cubre, cada uno atribuido automáticamente a su mejor lote) —
  // así una silla real se hoverea/selecciona como cualquier lote y solo cae
  // a "material con identidad propia" cuando no hay candidato alguno.
  const leaveEntrySeq: LeaveSlot[] = [];
  for (const sl of leaveSlots) {
    const n = seatsOf(sl.trays, perCell);
    for (let i = 0; i < n; i++) leaveEntrySeq.push(sl);
  }
  let leaveIdx = 0;
  const seatLeaveEntry: (LeaveSlot | null)[] = seats.map((s) =>
    s.kind === "leave"
      ? (leaveEntrySeq[leaveIdx++] ?? null)
      : null,
  );

  // Edades por VARIEDAD, tomadas directo del desglose REAL del mesón
  // (loc.species, mismo orden que la leyenda) — nunca de la identidad del
  // lote del plan. El lote que el FIFO de capacidad asigna a una silla
  // "ocupado hoy" (s.part) es una asignación de PLANIFICACIÓN (ver
  // getSectorPlanFill / diagrama "Flujo Decision Plano Sector"), no un match
  // de bandeja real — su variedad maestro puede no calzar textualmente con
  // la variedad cruda del inventario en ESE mesón (códigos de cruce sin
  // vincular, alias no registrados). Matchear por ahí dejaba sillas grises
  // "sin fecha" aunque el inventario sí tuviera fecha para esa variedad real.
  // Cada grupo real llena sus propias posiciones consecutivas; lo que sobra
  // sin fecha queda gris ahí mismo, nunca se mezcla entre grupos.
  const realSeats = Math.round(realTrays / perCell);
  const realAgeSeq: (number | null)[] = [];
  for (const sp of loc.species) {
    const q: (number | null)[] = [];
    for (const b of sp.ageBuckets) {
      const n = Math.round(b.trays / perCell);
      for (let i = 0; i < n; i++) q.push(b.months);
    }
    const total = Math.round(sp.trays / perCell);
    while (q.length < total) q.push(null); // sin fecha
    realAgeSeq.push(...q.slice(0, total));
  }
  const seatAges: (number | null)[] = seats.map((_s, i) =>
    i < realSeats ? (realAgeSeq[i] ?? null) : null,
  );
  /** Edad de una silla en modo Antigüedad: real (foto, por variedad) para lo
   *  presente; PROYECTADA para lo que el plan trae después de la foto — así
   *  la vista de edad ocupa lo mismo que la de ocupación aunque se mire una
   *  semana posterior al snapshot.
   *
   *  La proyección cuenta desde el INICIO DEL LOTE (su primera plantación),
   *  no desde la llegada a esta etapa: un traslado (maduración/predespacho)
   *  trae material con la edad acumulada desde el enraizamiento; solo un
   *  ingreso a su primera etapa parte en 0 m. */
  const seatAge = (s: Seat, i: number): number | null => {
    if (i < realSeats) return seatAges[i];
    if (s.part) {
      return Math.max(0, Math.floor(((week - s.part.startWeek) * 7) / 30.44));
    }
    return null;
  };
  /** clave de una silla — lote del plan (part), lote atribuido (slot.chip)
   *  o material real con identidad propia (matKey, cuando no hay lote
   *  llegado); null = silla vacía */
  const seatKey = (s: Seat, i: number): string | null => {
    if (s.part) return lotKey(s.part.lotId, s.part.stage);
    const slot = seatLeaveEntry[i];
    if (!slot) return null;
    return slot.chip
      ? lotKey(slot.chip.lotId, slot.chip.stage)
      : matKey(slot.name, slot.variety);
  };

  // Antigüedad activa: toma la paleta entera del mesón (0-6+ meses); sin ella,
  // vuelve a la paleta normal de ocupación/plan/salidas.
  const seatStyle = (s: Seat, i: number): React.CSSProperties => {
    // La selección/hover del lote de plan sigue funcionando en modo
    // antigüedad (mover/mermar no puede depender de apagar el toggle) — se
    // pinta encima de la paleta de edad para esas sillas puntuales.
    const key = seatKey(s, i);
    if (key && key === selectedKey) return { backgroundColor: SEAT_SELECTED };
    if (key && key === hoveredKey) return { backgroundColor: SEAT_HOVER };
    if (mostrarEdad) {
      // Silla ocupada hoy → edad real (gris = sin fecha). Llegado tras la
      // foto → edad proyectada desde su semana de llegada. Entrante → 0 m.
      if (i < realSeats) return { backgroundColor: ageColor(seatAges[i]) };
      const a = seatAge(s, i);
      if (a !== null) return { backgroundColor: ageColor(a) };
      return { backgroundColor: SEAT_EMPTY };
    }
    if (s.kind === "leave") return { backgroundColor: marcarSalen ? SEAT_LEAVE : SEAT_FULL };
    if (!s.part) return { backgroundColor: SEAT_EMPTY };
    if (s.kind === "enter") return { backgroundColor: SEAT_ENTER };
    return { backgroundColor: SEAT_FULL };
  };

  const enter = Math.max(0, planTrays - stay);
  const barFree = Math.max(0, gridCap - (soloHoy ? realTrays : planTrays + leave));
  const ageOccupied = loc.ageBuckets.reduce((s, b) => s + b.trays, 0);
  const ageFree = Math.max(0, gridCap - ageOccupied - (soloHoy ? 0 : enter));

  return (
    <div
      ref={setNodeRef}
      data-keep-selection
      className={cn(
        "flex flex-col gap-1 rounded-md border bg-card p-1.5 text-[11px] transition-colors",
        // Cuota llena: borde negro (foreground) — el rojo saturaba el plano.
        quotaFull && !soloHoy && "border-foreground/70",
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
          title={[
            // El tooltip va en BANDEJAS y se ramifica por el movimiento real,
            // no por el redondeado: un delta que en pantalla queda en 0 pp
            // igual se explica acá.
            soloHoy
              ? `hoy ${realTrays.toLocaleString("es-CL")} bandejas sobre la cuota de plan del mesón`
              : rotates
                ? // Rotación: el neto solo no alcanza, hay que decir las dos patas.
                  `hoy ${realTrays.toLocaleString("es-CL")} · según el plan salen ${grossOut.toLocaleString("es-CL")} y entran ${planEnterTrays.toLocaleString("es-CL")} → ${planTrays.toLocaleString("es-CL")} bandejas`
                : delta > 0
                  ? `hoy ${realTrays.toLocaleString("es-CL")} + entran ${delta.toLocaleString("es-CL")} según plan → ${planTrays.toLocaleString("es-CL")} bandejas`
                  : delta < 0
                    ? `hoy ${realTrays.toLocaleString("es-CL")} − salen ${(-delta).toLocaleString("es-CL")} esta semana → ${planTrays.toLocaleString("es-CL")} bandejas`
                    : "el plan de la semana deja el mesón igual que hoy",
            planCap && physCap && planCap !== physCap
              ? `cuota: ${planCap.toLocaleString("es-CL")} de ${physCap.toLocaleString("es-CL")} bandejas físicas`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          {!gridCap ? (
            soloHoy ? (
              realTrays
            ) : (
              planTrays
            )
          ) : soloHoy || pctDelta === 0 ? (
            // Sin movimiento visible no hay cadena: un solo número, el de hoy.
            // (Un delta que redondea a 0 pp igual se explica en el tooltip.)
            // Con rotación de neto cero van los dos puntos: el mesón se movió en
            // ambos sentidos aunque el porcentaje quede igual.
            <>
              {rotates ? (
                <>
                  <RotationDots colors={[SEAT_ENTER, SEAT_LEAVE]} />{" "}
                </>
              ) : null}
              {pctOf(realTrays)}%
            </>
          ) : (
            <>
              {pctOf(realTrays)}%{" "}
              {rotates ? (
                <>
                  <RotationDots
                    colors={[pctDelta > 0 ? SEAT_LEAVE : SEAT_ENTER]}
                  />{" "}
                </>
              ) : null}
              <span
                className="font-medium"
                style={{ color: pctDelta > 0 ? SEAT_ENTER : SEAT_LEAVE }}
              >
                {pctDelta > 0 ? "+" : "−"}
                {Math.abs(pctDelta)}
              </span>{" "}
              → {pctOf(planTrays)}%
            </>
          )}
        </span>
      </button>
      {expanded ? (
        // Dos geometrías, según cuánto espacio tiene la card:
        //  · `wideCards` (Góticos, 2 lados): rectángulo cerrado de columnas
        //    calculadas, que es lo que había que arreglar ahí.
        //  · el resto (TunelTek, Zona Oscura, Zona Clara, Módulos): el flujo
        //    original — sillas de 12px que envuelven según el ancho de la card.
        //    En cards angostas eso da mesones ALTOS, que es como estaban y como
        //    el usuario los quiere.
        <div
          className={wideCards ? "grid" : "flex flex-wrap items-center gap-[2px]"}
          style={
            wideCards
              ? {
                  gap: `${SEAT_GAP}px`,
                  gridTemplateColumns: `repeat(${seatCols}, ${seatWidthCss(seatMaxCols)})`,
                }
              : undefined
          }
        >
          {seats.map((s, i) => {
            const key = seatKey(s, i);
            return (
              <span
                key={i}
                onMouseEnter={() => {
                  onHover(key);
                  if (mostrarEdad) onAgeHover(seatAge(s, i));
                }}
                onMouseLeave={() => onHover(null)}
                onClick={() => {
                  if (key && !s.part?.sim) onSelect(key);
                  if (mostrarEdad) onAgeHover(seatAge(s, i));
                }}
                title={
                  mostrarEdad
                    ? undefined
                    : s.kind === "leave"
                      ? (() => {
                          const e = seatLeaveEntry[i];
                          const real = e
                            ? `${e.name}${e.variety ? ` ${e.variety}` : " (sin variedad)"}`
                            : "ocupado hoy";
                          return e?.chip
                            ? `${e.chip.label} · asignación automática (real: ${real})`
                            : `${real} · material real sin lote llegado en el plan`;
                        })()
                      : s.part?.sim
                        ? `${s.part.label} · simulación`
                        : (s.part?.label ?? "vacío")
                }
                className={cn(
                  "rounded-[2px] transition-colors",
                  // En grilla el ancho lo da la columna; envolviendo, la silla
                  // mide 12px fijos y son las columnas las que salen del ancho
                  // disponible.
                  wideCards ? "aspect-square" : "h-3 w-3 shrink-0",
                  (mostrarEdad || key) && "cursor-pointer",
                )}
                style={seatStyle(s, i)}
              />
            );
          })}
          {/* Celdas sin capacidad: cierran la última fila cuando la cuota no es
              múltiplo de las filas (a lo más filas-1). Solo en el rectángulo
              cerrado — envolviendo, la última fila queda corta y así estaba. */}
          {wideCards
            ? Array.from({ length: seatPad }, (_, i) => (
                <span
                  key={`pad-${i}`}
                  title="sin capacidad"
                  className="aspect-square rounded-[2px] bg-foreground/[0.07]"
                />
              ))
            : null}
        </div>
      ) : (
        <div className="flex h-3.5 overflow-hidden rounded-sm">
          {mostrarEdad ? (
            <>
              {[...loc.ageBuckets]
                .sort((a, b) => a.months - b.months)
                .map((b) => (
                  <div
                    key={b.months}
                    style={{ flexGrow: b.trays, flexBasis: 0, backgroundColor: ageColor(b.months) }}
                  />
                ))}
              {!soloHoy && enter > 0 ? (
                <div style={{ flexGrow: enter, flexBasis: 0, backgroundColor: ageColor(0) }} />
              ) : null}
              {ageFree > 0 ? (
                <div style={{ flexGrow: ageFree, flexBasis: 0, backgroundColor: SEAT_EMPTY }} />
              ) : null}
            </>
          ) : soloHoy ? (
            <>
              {realTrays > 0 ? (
                <div
                  style={{ flexGrow: realTrays, flexBasis: 0, backgroundColor: SEAT_FULL }}
                />
              ) : null}
              {barFree > 0 ? (
                <div style={{ flexGrow: barFree, flexBasis: 0, backgroundColor: SEAT_EMPTY }} />
              ) : null}
            </>
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
              {barFree > 0 ? (
                <div style={{ flexGrow: barFree, flexBasis: 0, backgroundColor: SEAT_EMPTY }} />
              ) : null}
            </>
          )}
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
          <>
            {/* Lote partido: parte quedó ubicada y parte no cabe. */}
            {item.trays - item.overflowTrays > 0 ? (
              <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                {(item.trays - item.overflowTrays).toLocaleString("es-CL")} ubicadas
              </span>
            ) : null}
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-950/60 dark:text-red-300">
              {item.overflowTrays.toLocaleString("es-CL")} sin espacio
            </span>
          </>
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
