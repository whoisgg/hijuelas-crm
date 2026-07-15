import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { allocateFifo, type AllocLot } from "@/lib/planner/allocate";

/**
 * Datos del drill-down "layout por sector": módulos y mesones del área con
 * la ocupación del último snapshot de Hotelería (la foto real). El plan por
 * semana es a nivel área (la asignación por mesón llega en Fase 3).
 */

export type LayoutLocation = {
  id: number;
  code: string;
  side: string | null;
  rowNum: number | null;
  /** capacidad física del mesón (Hotelería) — base de la vista "Hoy" */
  capacityTrays: number | null;
  /** cuota de la capacidad de planificación — base de la Proyección */
  planCapacityTrays: number | null;
  trays: number;
  plants: number;
  species: { name: string; trays: number }[];
};

export type LayoutModule = {
  id: number;
  name: string;
  locations: LayoutLocation[];
};

export type SectorLayoutData = {
  area: { id: number; name: string; stage: string; capacityTrays: number };
  modules: LayoutModule[];
  snapshotDate: string | null;
  snapshotFile: string | null;
  totals: { trays: number; physicalCapacity: number; planCapacity: number };
};

export type SectorPlanFill = {
  /** location id → ocupación proyectada con el detalle de lotes FIFO */
  byLocation: Map<number, { trays: number; parts: { label: string; trays: number }[] }>;
  overflow: { label: string; trays: number }[];
  overflowTrays: number;
};

/**
 * Proyección "agarrar todo y repartir": los lotes que el plan pone en el
 * área esa semana se redistribuyen FIFO (por semana de llegada a la etapa)
 * sobre las cuotas de planificación de los mesones, en su orden físico.
 * Por construcción cuadra con la timeline: si el plan marca 114%, el plano
 * se llena y el 14% restante queda listado como sobrecupo.
 */
export async function getSectorPlanFill(
  supabase: SupabaseClient<Database>,
  areaId: number,
  targetWeek: number,
  layout: SectorLayoutData,
): Promise<SectorPlanFill> {
  const stageQuery = (stage: "rooting" | "maturation" | "predispatch") =>
    supabase
      .from("planner_lots")
      .select(
        `lot_code, trays, ${stage}_start_week, planner_species(name), planner_varieties(name)`,
      )
      .eq(`${stage}_area_id`, areaId)
      .eq("status", "ACTIVO")
      .lte(`${stage}_start_week`, targetWeek)
      .gte(`${stage}_end_week`, targetWeek)
      .limit(2000);

  const [rooting, maturation, predispatch] = await Promise.all([
    stageQuery("rooting"),
    stageQuery("maturation"),
    stageQuery("predispatch"),
  ]);

  type Rel = { name: string } | null;
  const lots: AllocLot[] = [];
  for (const [rows, startKey] of [
    [rooting.data, "rooting_start_week"],
    [maturation.data, "maturation_start_week"],
    [predispatch.data, "predispatch_start_week"],
  ] as const) {
    for (const row of rows ?? []) {
      const r = row as unknown as Record<string, unknown>;
      const species = (r.planner_species as Rel)?.name ?? "¿?";
      const variety = (r.planner_varieties as Rel)?.name;
      const trays = (r.trays as number | null) ?? 0;
      if (trays <= 0) continue;
      lots.push({
        label: `${species}${variety ? ` ${variety}` : ""} · ${r.lot_code as string}`,
        trays,
        arrivalWeek: (r[startKey] as number | null) ?? targetWeek,
      });
    }
  }

  const orderedLocations = layout.modules.flatMap((m) =>
    m.locations.map((l) => ({ id: l.id, capacityTrays: l.planCapacityTrays ?? 0 })),
  );
  const alloc = allocateFifo(orderedLocations, lots);

  return {
    byLocation: alloc.byLocation,
    overflow: alloc.overflow,
    overflowTrays: alloc.overflowTrays,
  };
}

export async function getSectorLayout(
  supabase: SupabaseClient<Database>,
  areaId: number,
): Promise<SectorLayoutData | null> {
  const { data: area } = await supabase
    .from("planner_areas")
    .select("id, name, stage, capacity_trays")
    .eq("id", areaId)
    .maybeSingle();
  if (!area) return null;

  const { data: modules } = await supabase
    .from("planner_modules")
    .select("id, name, sort, planner_locations(id, code, side, row_num, capacity_trays)")
    .eq("area_id", areaId)
    .order("sort");

  const { data: lastUpload } = await supabase
    .from("planner_uploads")
    .select("id, created_at, file_name")
    .eq("kind", "hoteleria")
    .eq("status", "applied")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const locationIds = (modules ?? []).flatMap((m) =>
    m.planner_locations.map((l) => l.id),
  );

  const occByLocation = new Map<
    number,
    { trays: number; plants: number; species: Map<string, number> }
  >();
  if (lastUpload && locationIds.length) {
    const { data: snapshot } = await supabase
      .from("planner_occupancy_snapshot")
      .select("location_id, species_name, trays, plants")
      .eq("upload_id", lastUpload.id)
      .in("location_id", locationIds);
    for (const row of snapshot ?? []) {
      let acc = occByLocation.get(row.location_id);
      if (!acc) {
        acc = { trays: 0, plants: 0, species: new Map() };
        occByLocation.set(row.location_id, acc);
      }
      acc.trays += row.trays;
      acc.plants += row.plants;
      if (row.species_name) {
        acc.species.set(
          row.species_name,
          (acc.species.get(row.species_name) ?? 0) + row.trays,
        );
      }
    }
  }

  // La capacidad que manda es la de planificación (Vivero Planner). La suma
  // física de los mesones (Hotelería) puede ser mayor; cada mesón usa su
  // cuota proporcional para que el plano sume exactamente la capacidad del
  // área y cuadre con la timeline y sus alertas.
  const physicalSum = (modules ?? []).reduce(
    (s, m) => s + m.planner_locations.reduce((x, l) => x + (l.capacity_trays ?? 0), 0),
    0,
  );
  const scale =
    physicalSum > 0 && area.capacity_trays > 0
      ? area.capacity_trays / physicalSum
      : 1;

  let totalTrays = 0;
  let totalPhysical = 0;
  let totalPlanCapacity = 0;
  const mods: LayoutModule[] = (modules ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    locations: m.planner_locations
      .slice()
      .sort((a, b) => {
        const na = Number(a.code.match(/\d+/)?.[0] ?? 0);
        const nb = Number(b.code.match(/\d+/)?.[0] ?? 0);
        return (
          (a.side ?? "").localeCompare(b.side ?? "") || na - nb ||
          a.code.localeCompare(b.code)
        );
      })
      .map((l) => {
        const occ = occByLocation.get(l.id);
        const planCapacity =
          l.capacity_trays !== null ? Math.round(l.capacity_trays * scale) : null;
        totalTrays += occ?.trays ?? 0;
        totalPhysical += l.capacity_trays ?? 0;
        totalPlanCapacity += planCapacity ?? 0;
        return {
          id: l.id,
          code: l.code,
          side: l.side,
          rowNum: l.row_num,
          capacityTrays: l.capacity_trays,
          planCapacityTrays: planCapacity,
          trays: occ?.trays ?? 0,
          plants: occ?.plants ?? 0,
          species: [...(occ?.species ?? new Map())]
            .map(([name, trays]) => ({ name, trays }))
            .sort((a, b) => b.trays - a.trays),
        };
      }),
  }));

  return {
    area: {
      id: area.id,
      name: area.name,
      stage: area.stage,
      capacityTrays: area.capacity_trays,
    },
    modules: mods.filter((m) => m.locations.length > 0),
    snapshotDate: lastUpload?.created_at ?? null,
    snapshotFile: lastUpload?.file_name ?? null,
    totals: {
      trays: totalTrays,
      physicalCapacity: totalPhysical,
      planCapacity: totalPlanCapacity,
    },
  };
}
