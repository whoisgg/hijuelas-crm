import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { type AllocLot } from "@/lib/planner/allocate";
import { getSectorLayout, type SectorLayoutData } from "@/lib/planner/layout-data";

/**
 * Mesa de trabajo del sector dentro de un escenario: proyección FIFO sobre
 * los lotes del escenario, el inbox de lo que no cabe (con identidad para
 * moverlo) y los sectores de la misma etapa con espacio libre esa semana.
 */

type Stage = "rooting" | "maturation" | "predispatch";
const STAGES: Stage[] = ["rooting", "maturation", "predispatch"];

export type SectorLotChip = {
  lotId: number;
  stage: Stage;
  label: string;
  species: string;
  variety: string | null;
  trays: number;
  /** bandejas que no caben este semana (0 si el lote entra completo) */
  overflowTrays: number;
  /** mesón donde el usuario fijó el lote (null = automático FIFO) */
  pinnedLocationId: number | null;
  pinnedCode: string | null;
};

export type TargetSector = {
  areaId: number;
  name: string;
  freeTrays: number;
  capacity: number;
};

export type FillPart = {
  label: string;
  trays: number;
  lotId: number | null;
  stage: Stage | null;
};

export type SectorWorkspaceData = {
  layout: SectorLayoutData;
  fill: Record<number, { trays: number; parts: FillPart[] }>;
  /** todos los lotes del sector esa semana, agrupados, para mover */
  contents: SectorLotChip[];
  overflowTrays: number;
  overflowCount: number;
  targets: TargetSector[];
  stage: Stage | null;
};

type ScenarioLotRow = {
  id: number;
  lot_code: string;
  trays: number | null;
  rooting_area_id: number | null;
  rooting_start_week: number | null;
  rooting_end_week: number | null;
  maturation_area_id: number | null;
  maturation_start_week: number | null;
  maturation_end_week: number | null;
  predispatch_area_id: number | null;
  predispatch_start_week: number | null;
  predispatch_end_week: number | null;
  planner_species: { name: string } | null;
  planner_varieties: { name: string } | null;
};

function stageAreaId(lot: ScenarioLotRow, stage: Stage): number | null {
  return lot[`${stage}_area_id`] as number | null;
}
function stageActive(lot: ScenarioLotRow, stage: Stage, week: number): boolean {
  const start = lot[`${stage}_start_week`] as number | null;
  const end = lot[`${stage}_end_week`] as number | null;
  return start !== null && end !== null && week >= start && week <= end;
}

export async function getScenarioWorkspace(
  supabase: SupabaseClient<Database>,
  scenarioId: number,
  areaId: number,
  week: number,
): Promise<SectorWorkspaceData | null> {
  const layout = await getSectorLayout(supabase, areaId);
  if (!layout) return null;

  const { data: areas } = await supabase
    .from("planner_areas")
    .select("id, name, stage, capacity_trays")
    .eq("active", true);
  const areaById = new Map((areas ?? []).map((a) => [a.id, a]));
  const thisStage = areaById.get(areaId)?.stage as string | undefined;

  const { data: lots } = await supabase
    .from("planner_scenario_lots")
    .select(
      "id, lot_code, trays, rooting_area_id, rooting_start_week, rooting_end_week, maturation_area_id, maturation_start_week, maturation_end_week, predispatch_area_id, predispatch_start_week, predispatch_end_week, planner_species(name), planner_varieties(name)",
    )
    .eq("scenario_id", scenarioId)
    .eq("status", "ACTIVO")
    .limit(10000);

  const rows = (lots ?? []) as unknown as ScenarioLotRow[];

  // Lotes presentes en ESTE sector esta semana (por la etapa que corresponda).
  const here: { row: ScenarioLotRow; stage: Stage }[] = [];
  for (const row of rows) {
    for (const stage of STAGES) {
      if (stageAreaId(row, stage) === areaId && stageActive(row, stage, week)) {
        here.push({ row, stage });
        break;
      }
    }
  }

  // Pins manuales: lote (por etapa) → mesón fijado por el usuario.
  const { data: pinRows } = await supabase
    .from("planner_scenario_lot_pins")
    .select("scenario_lot_id, stage, location_id")
    .eq("scenario_id", scenarioId);
  const locIdsHere = new Set(
    layout.modules.flatMap((m) => m.locations.map((l) => l.id)),
  );
  const pinByLot = new Map<string, number>();
  for (const p of pinRows ?? []) {
    if (locIdsHere.has(p.location_id)) {
      pinByLot.set(`${p.scenario_lot_id}:${p.stage}`, p.location_id);
    }
  }

  const orderedLocations = layout.modules.flatMap((m) =>
    m.locations.map((l) => ({ id: l.id, capacityTrays: l.planCapacityTrays ?? 0 })),
  );

  const items: AllocLot[] = here
    .filter(({ row }) => (row.trays ?? 0) > 0)
    .map(({ row, stage }) => ({
      label: `${row.planner_species?.name ?? "¿?"}${row.planner_varieties?.name ? ` ${row.planner_varieties.name}` : ""} · ${row.lot_code}`,
      trays: row.trays ?? 0,
      arrivalWeek: (row[`${stage}_start_week`] as number | null) ?? week,
      ref: { lotId: row.id, stage },
    }));

  // Colocación pin-aware: primero los lotes fijados en su mesón, luego el
  // FIFO rellena la capacidad restante en orden físico.
  const usedByLoc = new Map<number, number>();
  const partsByLoc = new Map<number, { label: string; trays: number; ref: AllocLot["ref"] }[]>();
  const overflowByLot = new Map<number, number>();
  const place = (locId: number, it: AllocLot, take: number) => {
    usedByLoc.set(locId, (usedByLoc.get(locId) ?? 0) + take);
    const arr = partsByLoc.get(locId) ?? [];
    arr.push({ label: it.label, trays: take, ref: it.ref });
    partsByLoc.set(locId, arr);
  };
  const capOf = (locId: number) =>
    orderedLocations.find((l) => l.id === locId)?.capacityTrays ?? 0;

  const queue: AllocLot[] = [];
  for (const it of items) {
    const pin = it.ref ? pinByLot.get(`${it.ref.lotId}:${it.ref.stage}`) : undefined;
    if (pin !== undefined) {
      const free = Math.max(0, capOf(pin) - (usedByLoc.get(pin) ?? 0));
      const take = Math.min(free, it.trays);
      if (take > 0) place(pin, it, take);
      if (it.trays - take > 0) queue.push({ ...it, trays: it.trays - take });
    } else {
      queue.push(it);
    }
  }
  queue.sort((a, b) => a.arrivalWeek - b.arrivalWeek || a.label.localeCompare(b.label));
  let li = 0;
  for (const it of queue) {
    let rem = it.trays;
    while (rem > 0) {
      if (li >= orderedLocations.length) {
        overflowByLot.set(it.ref!.lotId, (overflowByLot.get(it.ref!.lotId) ?? 0) + rem);
        break;
      }
      const loc = orderedLocations[li];
      const free = loc.capacityTrays - (usedByLoc.get(loc.id) ?? 0);
      if (free <= 0) {
        li++;
        continue;
      }
      const take = Math.min(free, rem);
      place(loc.id, it, take);
      rem -= take;
    }
  }

  const fill: SectorWorkspaceData["fill"] = {};
  for (const [locId, parts] of partsByLoc) {
    fill[locId] = {
      trays: usedByLoc.get(locId) ?? 0,
      parts: parts.map((p) => ({
        label: p.label,
        trays: p.trays,
        lotId: p.ref?.lotId ?? null,
        stage: (p.ref?.stage as Stage | undefined) ?? null,
      })),
    };
  }
  const overflowTraysTotal = [...overflowByLot.values()].reduce((s, v) => s + v, 0);
  const codeByLocId = new Map(
    layout.modules.flatMap((m) => m.locations.map((l) => [l.id, l.code] as const)),
  );

  // Contenido del sector: TODOS los lotes presentes esa semana, agrupados,
  // para moverlos. Los que no caben van primero (con su marca de sobrecupo).
  const contents: SectorLotChip[] = here
    .filter(({ row }) => (row.trays ?? 0) > 0)
    .map(({ row, stage }) => ({
      lotId: row.id,
      stage,
      label: `${row.planner_species?.name ?? "¿?"}${row.planner_varieties?.name ? ` ${row.planner_varieties.name}` : ""} · ${row.lot_code}`,
      species: row.planner_species?.name ?? "",
      variety: row.planner_varieties?.name ?? null,
      trays: row.trays ?? 0,
      overflowTrays: overflowByLot.get(row.id) ?? 0,
      pinnedLocationId: pinByLot.get(`${row.id}:${stage}`) ?? null,
      pinnedCode: (() => {
        const pid = pinByLot.get(`${row.id}:${stage}`);
        return pid ? (codeByLocId.get(pid) ?? null) : null;
      })(),
    }))
    .sort(
      (a, b) =>
        b.overflowTrays - a.overflowTrays || b.trays - a.trays ||
        a.label.localeCompare(b.label),
    );
  const overflowCount = contents.filter((c) => c.overflowTrays > 0).length;

  // Sectores de la misma etapa con espacio libre esta semana (ocupación
  // planificada del escenario vs capacidad de planificación).
  const usedByArea = new Map<number, number>();
  for (const row of rows) {
    for (const stage of STAGES) {
      const aid = stageAreaId(row, stage);
      if (aid !== null && stageActive(row, stage, week)) {
        usedByArea.set(aid, (usedByArea.get(aid) ?? 0) + (row.trays ?? 0));
      }
    }
  }
  const targets: TargetSector[] = (areas ?? [])
    .filter((a) => a.id !== areaId && a.stage === thisStage)
    .map((a) => {
      const free = a.capacity_trays - (usedByArea.get(a.id) ?? 0);
      return { areaId: a.id, name: a.name, freeTrays: free, capacity: a.capacity_trays };
    })
    .sort((a, b) => b.freeTrays - a.freeTrays);

  return {
    layout,
    fill,
    contents,
    overflowTrays: overflowTraysTotal,
    overflowCount,
    targets,
    stage: here[0]?.stage ?? null,
  };
}
