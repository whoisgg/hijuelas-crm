import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Diff mesa de trabajo vs plan vigente: cuántos lotes cambiaron y en qué.
 * No hay FK entre planner_scenario_lots y planner_lots (la mesa nace de una
 * copia), así que la comparación es por multiconjunto de firmas: las filas
 * idénticas en ambos lados se cancelan y lo que sobra se agrupa por código
 * base de lote (los partidos llevan sufijo «·M»).
 */

export type WorkspaceChange = {
  /** código base del lote (sin sufijos ·M de particiones) */
  code: string;
  /** resumen legible: "movido a TunelTek", "merma −120 band.", ... */
  description: string;
  planTrays: number;
  mesaTrays: number;
};

export type WorkspaceDiff = {
  count: number;
  changes: WorkspaceChange[];
};

const LOT_COLUMNS =
  "lot_code, species_id, variety_id, year, start_week, plants, tray_format, trays, rooting_area_id, rooting_weeks, rooting_start_week, rooting_end_week, maturation_area_id, maturation_weeks, maturation_start_week, maturation_end_week, predispatch_area_id, predispatch_weeks, predispatch_start_week, predispatch_end_week, end_week, status";

type LotRow = {
  lot_code: string;
  trays: number | null;
  rooting_area_id: number | null;
  maturation_area_id: number | null;
  predispatch_area_id: number | null;
} & Record<string, unknown>;

const SIGNATURE_FIELDS = LOT_COLUMNS.split(", ");

function signature(row: LotRow): string {
  return SIGNATURE_FIELDS.map((f) => String(row[f] ?? "∅")).join("|");
}

/** código base: los lotes partidos en la mesa llevan sufijo «·M» (repetible) */
function baseCode(code: string): string {
  return code.replace(/(·M)+$/u, "");
}

function areaIds(rows: LotRow[]): Set<number> {
  const ids = new Set<number>();
  for (const r of rows) {
    for (const f of ["rooting_area_id", "maturation_area_id", "predispatch_area_id"] as const) {
      const v = r[f];
      if (typeof v === "number") ids.add(v);
    }
  }
  return ids;
}

export async function getWorkspaceDiff(
  supabase: SupabaseClient<Database>,
  scenarioId: number,
): Promise<WorkspaceDiff> {
  const [planRes, mesaRes, areasRes] = await Promise.all([
    supabase.from("planner_lots").select(LOT_COLUMNS).limit(10000),
    supabase
      .from("planner_scenario_lots")
      .select(LOT_COLUMNS)
      .eq("scenario_id", scenarioId)
      .limit(10000),
    supabase.from("planner_areas").select("id, name"),
  ]);

  const plan = (planRes.data ?? []) as unknown as LotRow[];
  const mesa = (mesaRes.data ?? []) as unknown as LotRow[];
  const areaName = new Map((areasRes.data ?? []).map((a) => [a.id, a.name]));
  if (!plan.length && !mesa.length) return { count: 0, changes: [] };

  // Cancelar filas idénticas (multiconjunto: cuentan las repeticiones).
  const planBySig = new Map<string, LotRow[]>();
  for (const row of plan) {
    const sig = signature(row);
    const arr = planBySig.get(sig) ?? [];
    arr.push(row);
    planBySig.set(sig, arr);
  }
  const mesaLeft: LotRow[] = [];
  for (const row of mesa) {
    const sig = signature(row);
    const arr = planBySig.get(sig);
    if (arr?.length) arr.pop();
    else mesaLeft.push(row);
  }
  const planLeft = [...planBySig.values()].flat();
  if (!planLeft.length && !mesaLeft.length) return { count: 0, changes: [] };

  // Agrupar lo que sobra por código base y describir el cambio.
  const codes = new Map<string, { plan: LotRow[]; mesa: LotRow[] }>();
  const bucket = (code: string) => {
    const key = baseCode(code);
    const b = codes.get(key) ?? { plan: [], mesa: [] };
    codes.set(key, b);
    return b;
  };
  for (const row of planLeft) bucket(row.lot_code).plan.push(row);
  for (const row of mesaLeft) bucket(row.lot_code).mesa.push(row);

  const changes: WorkspaceChange[] = [...codes.entries()]
    .map(([code, b]) => {
      const planTrays = b.plan.reduce((s, r) => s + (r.trays ?? 0), 0);
      const mesaTrays = b.mesa.reduce((s, r) => s + (r.trays ?? 0), 0);
      const parts: string[] = [];

      const planAreas = areaIds(b.plan);
      const mesaAreas = areaIds(b.mesa);
      const movedTo = [...mesaAreas].filter((id) => !planAreas.has(id));
      if (b.mesa.length && !b.plan.length) {
        parts.push("nuevo en la mesa");
      } else if (!b.mesa.length) {
        parts.push(`merma total (−${planTrays.toLocaleString("es-CL")} band.)`);
      } else {
        if (movedTo.length) {
          parts.push(
            `movido a ${movedTo.map((id) => areaName.get(id) ?? `área ${id}`).join(", ")}`,
          );
        }
        if (mesaTrays !== planTrays) {
          const delta = mesaTrays - planTrays;
          parts.push(
            delta < 0
              ? `merma −${Math.abs(delta).toLocaleString("es-CL")} band.`
              : `+${delta.toLocaleString("es-CL")} band.`,
          );
        }
        if (b.mesa.length > Math.max(1, b.plan.length)) parts.push("partido");
        if (!parts.length) parts.push("modificado");
      }

      return { code, description: parts.join(" · "), planTrays, mesaTrays };
    })
    .sort((a, b) => a.code.localeCompare(b.code));

  return { count: changes.length, changes };
}
