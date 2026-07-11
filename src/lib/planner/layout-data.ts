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
  capacityTrays: number | null;
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
  totals: { trays: number; capacity: number };
};

export type SectorPlanFill = {
  /** location id → ocupación proyectada (base real + llegadas) */
  byLocation: Map<number, { trays: number; detail: string }>;
  overflow: { label: string; trays: number }[];
  overflowTrays: number;
};

type StageLot = {
  label: string;
  species: string;
  trays: number;
  start: number;
  end: number;
};

/**
 * Proyección del plano anclada en la realidad:
 *
 *  1. La base es la foto real por mesón (último snapshot) — lo que está
 *     puesto no se reordena.
 *  2. Hacia adelante, la base se va vaciando según el plan de salida de su
 *     especie (si los lotes ya activos de esa especie terminan la etapa,
 *     esos mesones se liberan proporcionalmente).
 *  3. Los lotes que RECIÉN llegan (inician etapa después de la semana
 *     actual) rellenan los vacíos en orden FIFO, sin tocar lo existente.
 *  4. Lo que no cabe queda como sobrecupo.
 *
 * En la semana actual el resultado es exactamente la foto real.
 */
export async function getSectorPlanFill(
  supabase: SupabaseClient<Database>,
  areaId: number,
  targetWeek: number,
  currentWeek: number,
  layout: SectorLayoutData,
): Promise<SectorPlanFill> {
  const stageQuery = (stage: "rooting" | "maturation" | "predispatch") =>
    supabase
      .from("planner_lots")
      .select(
        `lot_code, trays, ${stage}_start_week, ${stage}_end_week, planner_species(name), planner_varieties(name)`,
      )
      .eq(`${stage}_area_id`, areaId)
      .eq("status", "ACTIVO")
      .not(`${stage}_start_week`, "is", null)
      .limit(2000);

  const [rooting, maturation, predispatch] = await Promise.all([
    stageQuery("rooting"),
    stageQuery("maturation"),
    stageQuery("predispatch"),
  ]);

  type Rel = { name: string } | null;
  const lots: StageLot[] = [];
  for (const [rows, startKey, endKey] of [
    [rooting.data, "rooting_start_week", "rooting_end_week"],
    [maturation.data, "maturation_start_week", "maturation_end_week"],
    [predispatch.data, "predispatch_start_week", "predispatch_end_week"],
  ] as const) {
    for (const row of rows ?? []) {
      const r = row as unknown as Record<string, unknown>;
      const species = (r.planner_species as Rel)?.name ?? "¿?";
      const variety = (r.planner_varieties as Rel)?.name;
      lots.push({
        label: `${species}${variety ? ` ${variety}` : ""} · ${r.lot_code as string}`,
        species: species.toLowerCase(),
        trays: (r.trays as number | null) ?? 0,
        start: (r[startKey] as number | null) ?? 0,
        end: (r[endKey] as number | null) ?? 0,
      });
    }
  }

  // Factor de permanencia por especie: cuánto de lo que HOY está puesto
  // sigue en el área en la semana objetivo, según los lotes ya activos.
  const oldActive = (species: string, week: number) =>
    lots
      .filter(
        (l) =>
          l.species === species &&
          l.start <= currentWeek &&
          l.start <= week &&
          l.end >= week,
      )
      .reduce((s, l) => s + l.trays, 0);

  const stayFactor = new Map<string, number>();
  const speciesInSnapshot = new Set<string>();
  for (const m of layout.modules) {
    for (const loc of m.locations) {
      for (const s of loc.species) speciesInSnapshot.add(s.name.toLowerCase());
    }
  }
  for (const sp of speciesInSnapshot) {
    const now = oldActive(sp, currentWeek);
    if (now <= 0) {
      // Especie en la foto sin plan asociado: se asume que permanece.
      stayFactor.set(sp, 1);
    } else {
      stayFactor.set(sp, Math.min(1, oldActive(sp, targetWeek) / now));
    }
  }

  // Base real por mesón, escalada por permanencia de cada especie.
  const base = new Map<number, { trays: number; parts: string[] }>();
  const orderedLocations: { id: number; capacityTrays: number }[] = [];
  for (const m of layout.modules) {
    for (const loc of m.locations) {
      orderedLocations.push({ id: loc.id, capacityTrays: loc.capacityTrays ?? 0 });
      let total = 0;
      const parts: string[] = [];
      for (const s of loc.species) {
        const kept = Math.round(s.trays * (stayFactor.get(s.name.toLowerCase()) ?? 1));
        if (kept > 0) {
          total += kept;
          parts.push(`${s.name}: ${kept}`);
        }
      }
      base.set(loc.id, { trays: total, parts });
    }
  }

  // Llegadas nuevas: lotes que inician etapa DESPUÉS de la semana actual y
  // están activos en la semana objetivo → rellenan los vacíos FIFO.
  const arrivals: AllocLot[] = lots
    .filter((l) => l.start > currentWeek && l.start <= targetWeek && l.end >= targetWeek && l.trays > 0)
    .map((l) => ({ label: l.label, trays: l.trays, arrivalWeek: l.start }));

  const gaps = orderedLocations.map((l) => ({
    id: l.id,
    capacityTrays: Math.max(0, l.capacityTrays - (base.get(l.id)?.trays ?? 0)),
  }));
  const alloc = allocateFifo(gaps, arrivals);

  const byLocation = new Map<number, { trays: number; detail: string }>();
  for (const loc of orderedLocations) {
    const b = base.get(loc.id) ?? { trays: 0, parts: [] };
    const a = alloc.byLocation.get(loc.id);
    const parts = [...b.parts, ...(a?.parts.map((p) => `+ ${p.label}: ${p.trays}`) ?? [])];
    byLocation.set(loc.id, {
      trays: b.trays + (a?.trays ?? 0),
      detail: parts.join(" · "),
    });
  }

  return {
    byLocation,
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
  let totalCapacity = 0;
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
        totalCapacity += planCapacity ?? 0;
        return {
          id: l.id,
          code: l.code,
          side: l.side,
          rowNum: l.row_num,
          capacityTrays: planCapacity,
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
    totals: { trays: totalTrays, capacity: totalCapacity },
  };
}
