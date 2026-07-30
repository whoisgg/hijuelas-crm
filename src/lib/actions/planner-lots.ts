"use server";

import { revalidatePath } from "next/cache";

import { requireModuleAccess } from "@/lib/access";
import {
  diffLotPlan,
  recordLotPlanChanges,
  toLotPlanSnapshot,
} from "@/lib/planner/lot-plan-history";

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
