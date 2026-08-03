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
  /** código del lote suelto: el `label` ya lo trae, pero pegado a la especie;
   *  quien muestra la especie aparte lo necesita sin repetirla */
  lotCode: string;
  trays: number;
  /** semana en que el lote inicia esta etapa según el plan — material real
   *  nunca se atribuye a un lote que aún no llega (sería mezclar lo
   *  planificado con lo existente) */
  arrivalWeek: number;
  /** bandejas que no caben este semana (0 si el lote entra completo) */
  overflowTrays: number;
  /** mesón donde el usuario fijó el lote (null = automático FIFO) */
  pinnedLocationId: number | null;
  pinnedCode: string | null;
  /** orden del overlay de simulación (demanda what-if, no del plan) */
  sim: boolean;
  /** nombre de la simulación a la que pertenece (solo si sim) */
  simName: string | null;
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
  /** semana de inicio de esta etapa para el lote — decide si ya "llegó"
   *  (ocupado hoy) o si el plan lo trae a futuro, lote completo, sin
   *  partir una misma fila entre las dos categorías. */
  arrivalWeek: number;
  /** semana de inicio del LOTE completo (primera plantación) — distingue
   *  ingreso (etapa inicial: material nuevo, 0 m) de traslado (etapa
   *  posterior: el material trae su edad acumulada desde esta semana) */
  startWeek: number;
  /** especie/variedad del lote — cruza el plan con el material real del
   *  mesón para descontar lo ya cubierto al etiquetar sobrantes */
  species: string;
  variety: string | null;
  /** parte de una orden simulada */
  sim?: boolean;
};

export type SectorWorkspaceData = {
  layout: SectorLayoutData;
  fill: Record<number, { trays: number; parts: FillPart[] }>;
  /** todos los lotes del sector esa semana, agrupados, para mover */
  contents: SectorLotChip[];
  /** todos los lotes activos con etapa en este sector, cualquier semana —
   *  candidatos para "Identificar" cuando la ventana de plan ya cerró */
  areaLots: SectorLotChip[];
  overflowTrays: number;
  overflowCount: number;
  targets: TargetSector[];
  stage: Stage | null;
  /** semana-campaña que se está mirando (para decidir llegó/entra por lote) */
  week: number;
};

type ScenarioLotRow = {
  id: number;
  scenario_id: number;
  lot_code: string;
  trays: number | null;
  start_week: number | null;
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
  opts: { simScenarios?: { id: number; name: string }[] } = {},
): Promise<SectorWorkspaceData | null> {
  const layout = await getSectorLayout(supabase, areaId);
  if (!layout) return null;

  const { data: areas } = await supabase
    .from("planner_areas")
    .select("id, name, stage, capacity_trays")
    .eq("active", true);
  const areaById = new Map((areas ?? []).map((a) => [a.id, a]));
  const thisStage = areaById.get(areaId)?.stage as string | undefined;

  const lotSelect =
    "id, scenario_id, lot_code, trays, start_week, rooting_area_id, rooting_start_week, rooting_end_week, maturation_area_id, maturation_start_week, maturation_end_week, predispatch_area_id, predispatch_start_week, predispatch_end_week, planner_species(name), planner_varieties(name)";
  const simIds = (opts.simScenarios ?? []).map((s) => s.id);
  const [{ data: lots }, simRes] = await Promise.all([
    supabase
      .from("planner_scenario_lots")
      .select(lotSelect)
      .eq("scenario_id", scenarioId)
      .eq("status", "ACTIVO")
      .limit(10000),
    simIds.length
      ? supabase
          .from("planner_scenario_lots")
          .select(lotSelect)
          .in("scenario_id", simIds)
          .eq("status", "ACTIVO")
          .limit(10000)
      : Promise.resolve({ data: null }),
  ]);

  const rows = (lots ?? []) as unknown as ScenarioLotRow[];
  const simRows = (simRes.data ?? []) as unknown as ScenarioLotRow[];
  const simLotIds = new Set(simRows.map((r) => r.id));
  const simNameByScenario = new Map((opts.simScenarios ?? []).map((s) => [s.id, s.name]));
  const simNameByLot = new Map(
    simRows.map((r) => [r.id, simNameByScenario.get(r.scenario_id) ?? "Simulación"]),
  );

  // Lotes presentes en ESTE sector esta semana (por la etapa que corresponda).
  // Las órdenes simuladas van al final: rellenan lo que el plan deja libre.
  const here: { row: ScenarioLotRow; stage: Stage }[] = [];
  for (const row of [...rows, ...simRows]) {
    for (const stage of STAGES) {
      if (stageAreaId(row, stage) === areaId && stageActive(row, stage, week)) {
        here.push({ row, stage });
        break;
      }
    }
  }

  // TODOS los lotes activos con alguna etapa en este sector, sin filtrar por
  // semana vigente — a diferencia de `here` (arriba). Sirve solo para
  // "Identificar": una remesa real puede seguir físicamente en el sector
  // aunque su ventana de plan ya haya terminado (atrasada) — sigue siendo
  // el mejor candidato exacto por especie+variedad, mejor que caer a
  // especie sola solo porque esta semana puntual no coincide.
  const areaAny: { row: ScenarioLotRow; stage: Stage }[] = [];
  for (const row of rows) {
    for (const stage of STAGES) {
      if (stageAreaId(row, stage) === areaId) {
        areaAny.push({ row, stage });
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

  type WorkItem = AllocLot & {
    sim: boolean;
    species: string;
    variety: string | null;
    startWeek: number;
  };
  const items: WorkItem[] = here
    .filter(({ row }) => (row.trays ?? 0) > 0)
    .map(({ row, stage }) => ({
      label: `${row.planner_species?.name ?? "¿?"}${row.planner_varieties?.name ? ` ${row.planner_varieties.name}` : ""} · ${row.lot_code}`,
      trays: row.trays ?? 0,
      arrivalWeek: (row[`${stage}_start_week`] as number | null) ?? week,
      startWeek: row.start_week ?? (row.rooting_start_week ?? week),
      ref: { lotId: row.id, stage },
      sim: simLotIds.has(row.id),
      species: row.planner_species?.name ?? "",
      variety: row.planner_varieties?.name ?? null,
    }));

  // Colocación pin-aware: primero los lotes fijados en su mesón, luego el
  // FIFO rellena la capacidad restante en orden físico.
  const usedByLoc = new Map<number, number>();
  const partsByLoc = new Map<
    number,
    {
      label: string;
      trays: number;
      ref: AllocLot["ref"];
      arrivalWeek: number;
      startWeek: number;
      species: string;
      variety: string | null;
    }[]
  >();
  const overflowByLot = new Map<number, number>();
  const place = (locId: number, it: WorkItem, take: number) => {
    usedByLoc.set(locId, (usedByLoc.get(locId) ?? 0) + take);
    const arr = partsByLoc.get(locId) ?? [];
    arr.push({
      label: it.label,
      trays: take,
      ref: it.ref,
      arrivalWeek: it.arrivalWeek,
      startWeek: it.startWeek,
      species: it.species,
      variety: it.variety,
    });
    partsByLoc.set(locId, arr);
  };
  const capOf = (locId: number) =>
    orderedLocations.find((l) => l.id === locId)?.capacityTrays ?? 0;

  const queue: WorkItem[] = [];
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
  // FIFO del plan primero; la simulación rellena el espacio que sobra.
  queue.sort(
    (a, b) =>
      Number(a.sim) - Number(b.sim) ||
      a.arrivalWeek - b.arrivalWeek ||
      a.label.localeCompare(b.label),
  );
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
        arrivalWeek: p.arrivalWeek,
        startWeek: p.startWeek,
        species: p.species,
        variety: p.variety,
        sim: p.ref ? simLotIds.has(p.ref.lotId) : false,
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
      lotCode: row.lot_code,
      trays: row.trays ?? 0,
      arrivalWeek: (row[`${stage}_start_week`] as number | null) ?? week,
      overflowTrays: overflowByLot.get(row.id) ?? 0,
      pinnedLocationId: pinByLot.get(`${row.id}:${stage}`) ?? null,
      pinnedCode: (() => {
        const pid = pinByLot.get(`${row.id}:${stage}`);
        return pid ? (codeByLocId.get(pid) ?? null) : null;
      })(),
      sim: simLotIds.has(row.id),
      simName: simNameByLot.get(row.id) ?? null,
    }))
    .sort(
      (a, b) =>
        b.overflowTrays - a.overflowTrays || b.trays - a.trays ||
        a.label.localeCompare(b.label),
    );
  const overflowCount = contents.filter((c) => c.overflowTrays > 0).length;

  // Mismo shape que `contents` pero sin filtrar por semana vigente — solo
  // para que "Identificar" pueda ofrecer un lote cuya ventana de plan ya
  // cerró como candidato exacto (remesa real atrasada), en vez de caer
  // directo a especie sola. No incluye órdenes de simulación (no son
  // compromiso real, no tiene sentido sugerirlas para material físico).
  const areaLots: SectorLotChip[] = areaAny
    .filter(({ row }) => (row.trays ?? 0) > 0 && !simLotIds.has(row.id))
    .map(({ row, stage }) => ({
      lotId: row.id,
      stage,
      label: `${row.planner_species?.name ?? "¿?"}${row.planner_varieties?.name ? ` ${row.planner_varieties.name}` : ""} · ${row.lot_code}`,
      species: row.planner_species?.name ?? "",
      variety: row.planner_varieties?.name ?? null,
      lotCode: row.lot_code,
      trays: row.trays ?? 0,
      arrivalWeek: (row[`${stage}_start_week`] as number | null) ?? week,
      overflowTrays: 0,
      pinnedLocationId: pinByLot.get(`${row.id}:${stage}`) ?? null,
      pinnedCode: (() => {
        const pid = pinByLot.get(`${row.id}:${stage}`);
        return pid ? (codeByLocId.get(pid) ?? null) : null;
      })(),
      sim: false,
      simName: null,
    }));

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
    areaLots,
    overflowTrays: overflowTraysTotal,
    overflowCount,
    targets,
    stage: here[0]?.stage ?? null,
    week,
  };
}
