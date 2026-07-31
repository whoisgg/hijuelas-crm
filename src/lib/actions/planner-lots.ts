"use server";

import { revalidatePath } from "next/cache";

import { requireModuleAccess } from "@/lib/access";
import {
  diffLotPlan,
  recordLotPlanChanges,
  toLotPlanSnapshot,
} from "@/lib/planner/lot-plan-history";
import { LOT_COLUMNS, signature, type LotRow } from "@/lib/planner/workspace-diff";

/**
 * Edición manual de lotes (E2.6): cambiar plantas, semana de inicio o
 * estado sin recargar el Excel. Mover la semana de inicio desplaza todas
 * las etapas por el mismo delta; cambiar plantas recalcula bandejas (ceil).
 *
 * Solo admin: es la única forma de tocar el plan vigente fuera de una carga
 * masiva, y queda auditada en planner_lot_plan_changes (ver Movimientos).
 */

async function requireAccess() {
  return requireModuleAccess("planner", "admin");
}

export type UpdateLotInput = {
  id: number;
  plants: number;
  startWeek: number;
  status: string;
  /** texto referencial del laboratorio (ej. código de lote de Alstro); opcional */
  plantCode?: string | null;
  /** índice del laboratorio, separado del plantcode; opcional */
  plantIndex?: string | null;
};

export async function updateLot(input: UpdateLotInput): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireAccess();

  if (!Number.isFinite(input.plants) || input.plants < 0) {
    return { ok: false, error: "Plantas inválidas." };
  }
  if (!Number.isFinite(input.startWeek) || input.startWeek < 1) {
    return { ok: false, error: "Semana inválida." };
  }

  const { data: lot } = await supabase
    .from("planner_lots")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (!lot) return { ok: false, error: "Lote no encontrado." };

  const areaIds = [lot.rooting_area_id, lot.maturation_area_id, lot.predispatch_area_id].filter(
    (id): id is number => id !== null,
  );
  const { data: areaRows } = areaIds.length
    ? await supabase.from("planner_areas").select("id, name").in("id", areaIds)
    : { data: [] };
  const areaName = new Map((areaRows ?? []).map((a) => [a.id, a.name]));

  const delta = input.startWeek - lot.start_week;
  const shift = (v: number | null) => (v === null ? null : v + delta);
  const trays = lot.tray_format
    ? Math.ceil(input.plants / lot.tray_format)
    : lot.trays;

  const next = {
    plants: Math.trunc(input.plants),
    trays,
    status: input.status,
    plant_code: input.plantCode === undefined ? lot.plant_code : input.plantCode,
    plant_index: input.plantIndex === undefined ? lot.plant_index : input.plantIndex,
    start_week: input.startWeek,
    end_week: shift(lot.end_week),
    rooting_start_week: shift(lot.rooting_start_week),
    rooting_end_week: shift(lot.rooting_end_week),
    maturation_start_week: shift(lot.maturation_start_week),
    maturation_end_week: shift(lot.maturation_end_week),
    predispatch_start_week: shift(lot.predispatch_start_week),
    predispatch_end_week: shift(lot.predispatch_end_week),
  };

  const { error } = await supabase.from("planner_lots").update(next).eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  // Ubicación semana a semana (planner_lot_weeks): se desplaza por el mismo
  // delta, plan y manual por igual — mismo criterio que ya aplica esta
  // función a las 3 etapas. Delete+insert (no update in-place) para no
  // pisar el unique(lot_id, campaign_week) a mitad de camino.
  if (delta !== 0) {
    const { data: weeks } = await supabase
      .from("planner_lot_weeks")
      .select("campaign_week, area_id, stage, source")
      .eq("lot_id", input.id);
    if (weeks?.length) {
      await supabase.from("planner_lot_weeks").delete().eq("lot_id", input.id);
      await supabase.from("planner_lot_weeks").insert(
        weeks.map((w) => ({
          lot_id: input.id,
          campaign_week: w.campaign_week + delta,
          area_id: w.area_id,
          stage: w.stage,
          source: w.source,
        })),
      );
    }
  }

  // Fast-forward a las mesas de trabajo: si la copia de ESTE lote en una
  // mesa sigue idéntica al plan de ANTES de este edit (el usuario no la
  // tocó ahí), se actualiza junto con el plan — así una corrección no le
  // genera un "cambio sin aprobar" fantasma a nadie. Si la mesa ya
  // divergía (el usuario sí movió/mermó ese lote), se deja intacta: es una
  // decisión real suya que debe seguir pasando por "Aprobar al plan".
  // Ambigua (lot_code duplicado, más de una fila) → se salta, sin adivinar.
  const { data: workingScenarios } = await supabase
    .from("planner_scenarios")
    .select("id")
    .eq("is_working", true);
  if (workingScenarios?.length) {
    const oldSig = signature(lot as unknown as LotRow);
    const mesaNext = {
      plants: next.plants,
      trays: next.trays,
      status: next.status,
      start_week: next.start_week,
      end_week: next.end_week,
      rooting_start_week: next.rooting_start_week,
      rooting_end_week: next.rooting_end_week,
      maturation_start_week: next.maturation_start_week,
      maturation_end_week: next.maturation_end_week,
      predispatch_start_week: next.predispatch_start_week,
      predispatch_end_week: next.predispatch_end_week,
    };
    for (const ws of workingScenarios) {
      const { data: mesaRows } = await supabase
        .from("planner_scenario_lots")
        .select(LOT_COLUMNS)
        .eq("scenario_id", ws.id)
        .eq("lot_code", lot.lot_code);
      if (mesaRows?.length === 1 && signature(mesaRows[0] as unknown as LotRow) === oldSig) {
        await supabase
          .from("planner_scenario_lots")
          .update(mesaNext)
          .eq("scenario_id", ws.id)
          .eq("lot_code", lot.lot_code);
      }
    }
  }

  // Áreas no cambian en esta edición (solo semanas/plantas/estado): se pasan
  // igual en el antes y el después, así que el diff naturalmente no las marca.
  const diffs = diffLotPlan(
    toLotPlanSnapshot(lot, areaName),
    toLotPlanSnapshot({ ...lot, ...next }, areaName),
  );
  await recordLotPlanChanges(supabase, {
    lotCode: lot.lot_code,
    diffs,
    source: "manual",
    userId,
  });

  revalidatePath("/planner");
  revalidatePath("/planner/ocupacion");
  revalidatePath("/planner/lotes");
  revalidatePath("/planner/movimientos");
  return { ok: true };
}
