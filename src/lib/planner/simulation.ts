import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Simulaciones: grupos con nombre de órdenes extra (demanda what-if) que se
 * suman al plan vigente — nunca copias del plan. El ESTADO controla la carga
 * a Ocupación: borrador no se suma; desde "evaluacion" hacia adelante, sí.
 * Descartada queda fuera siempre.
 */

/** estados cuya demanda se suma a Ocupación cuando el checkbox está activo */
export const LOADABLE_STATUSES = ["evaluacion", "aprobado"] as const;

export type Simulation = {
  id: number;
  name: string;
  status: string;
  /** se suma a Ocupación (estado evaluacion o aprobado) */
  loadable: boolean;
  lots: number;
  trays: number;
};

export async function getSimulations(
  supabase: SupabaseClient<Database>,
): Promise<Simulation[]> {
  const { data: scenarios } = await supabase
    .from("planner_scenarios")
    .select("id, name, status")
    .eq("is_simulation", true)
    .neq("status", "descartado")
    .order("created_at", { ascending: true });
  if (!scenarios?.length) return [];

  const { data: lots } = await supabase
    .from("planner_scenario_lots")
    .select("scenario_id, trays")
    .in(
      "scenario_id",
      scenarios.map((s) => s.id),
    )
    .eq("status", "ACTIVO")
    .limit(10000);

  const agg = new Map<number, { lots: number; trays: number }>();
  for (const l of lots ?? []) {
    const a = agg.get(l.scenario_id) ?? { lots: 0, trays: 0 };
    a.lots += 1;
    a.trays += l.trays ?? 0;
    agg.set(l.scenario_id, a);
  }

  return scenarios.map((s) => ({
    id: s.id,
    name: s.name,
    status: s.status,
    loadable: (LOADABLE_STATUSES as readonly string[]).includes(s.status),
    lots: agg.get(s.id)?.lots ?? 0,
    trays: agg.get(s.id)?.trays ?? 0,
  }));
}

/**
 * Ids de simulaciones que se suman a Ocupación: cargables (por estado) menos
 * las apagadas puntualmente por el usuario (?off=1,2).
 */
export function loadedSimulationIds(
  simulations: Simulation[],
  offParam: string | undefined,
): number[] {
  const off = new Set(
    (offParam ?? "")
      .split(",")
      .map((v) => Number(v))
      .filter((v) => Number.isFinite(v)),
  );
  return simulations.filter((s) => s.loadable && !off.has(s.id)).map((s) => s.id);
}
