"use server";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { getSectorLayout, getSectorPlanFill } from "@/lib/planner/layout-data";
import { getScenarioWorkspace } from "@/lib/planner/scenario-workspace";
import { ensureWorkingScenario } from "@/lib/planner/working-scenario";

/**
 * Los 4 KPI del sector (Hoy · Ingresos · Salidas · Neto) para un área y una
 * semana, calculados con la MISMA fórmula que la barra de /planner/sector.
 *
 * Vive en una action y no en los datos del mapa a propósito: Ingresos y
 * Salidas son sumas **por mesón** (`Σ max(0, real − plan)` y `Σ max(0, plan −
 * real)`), no un diff de totales del área — un mesón que crece y otro que se
 * vacía se anularían y el movimiento bruto desaparecería. Eso obliga a repartir
 * el plan de la semana entre las ubicaciones (FIFO), que es trabajo por
 * sector: hacerlo para las 8 áreas × 64 semanas de una sería carísimo, y el
 * panel del mapa muestra un área a la vez.
 */

export type SectorWeekKpis = {
  /** foto real del inventario — NO depende de la semana */
  realTrays: number;
  realPct: number;
  /** bandejas que el plan suma respecto de la foto real, mesón a mesón */
  enterTrays: number;
  /** bandejas que el plan saca respecto de la foto real, mesón a mesón */
  leaveTrays: number;
  /** ocupación planificada de la semana = real − salidas + ingresos */
  planTrays: number;
  planPct: number;
  /** fecha del snapshot de inventario que define "Hoy" */
  snapshotDate: string | null;
};

export async function getSectorWeekKpis(
  areaId: number,
  campaignWeek: number,
  opts: { base?: "plan" | "working"; simIds?: number[] } = {},
): Promise<{ ok: true; kpis: SectorWeekKpis } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sin sesión." };

  const profile = await getAccessProfile(supabase);
  if (!hasModuleAccess(profile, "planner")) {
    return { ok: false, error: "Sin acceso al planner." };
  }

  const simScenarios = (opts.simIds ?? []).map((id) => ({ id, name: "" }));

  // Mesa de trabajo (lo que el mapa muestra por defecto) o plan vigente puro.
  const working =
    opts.base === "plan" ? null : await ensureWorkingScenario(supabase, user.id);

  const workspace = working
    ? await getScenarioWorkspace(supabase, working.id, areaId, campaignWeek, {
        ...(simScenarios.length ? { simScenarios } : {}),
      })
    : null;

  const layout = workspace?.layout ?? (await getSectorLayout(supabase, areaId));
  if (!layout) return { ok: false, error: "Sector sin layout." };

  // Sin mesa de trabajo, el reparto del plan se calcula igual que en el
  // fallback de solo lectura del sector.
  const fillByLoc: Map<number, number> = workspace
    ? new Map(
        Object.entries(workspace.fill).map(([id, f]) => [Number(id), f.trays]),
      )
    : new Map(
        [
          ...(
            await getSectorPlanFill(supabase, areaId, campaignWeek, layout)
          ).byLocation,
        ].map(([id, f]) => [id, f.trays]),
      );

  const locs = layout.modules.flatMap((m) => m.locations);
  let realTrays = 0;
  let planTrays = 0;
  let enterTrays = 0;
  let leaveTrays = 0;
  for (const l of locs) {
    const plan = fillByLoc.get(l.id) ?? 0;
    realTrays += l.trays;
    planTrays += plan;
    enterTrays += Math.max(0, plan - l.trays);
    leaveTrays += Math.max(0, l.trays - plan);
  }

  return {
    ok: true,
    kpis: {
      realTrays,
      // "Hoy" se mide contra la capacidad FÍSICA y el plan contra la de
      // PLANIFICACIÓN — dos denominadores distintos, igual que en el sector.
      realPct: layout.totals.physicalCapacity
        ? (realTrays / layout.totals.physicalCapacity) * 100
        : 0,
      enterTrays,
      leaveTrays,
      planTrays,
      planPct: layout.area.capacityTrays
        ? (planTrays / layout.area.capacityTrays) * 100
        : 0,
      snapshotDate: layout.snapshotDate,
    },
  };
}
