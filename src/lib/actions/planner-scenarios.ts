"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Simulador de escenarios: copias sandbox del plan base para probar
 * what-if (mover lotes, cambiar cantidades, nueva demanda, cancelar)
 * sin tocar producción.
 */

const PLANNER_ROLES = new Set(["admin", "produccion"]);

async function requireAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser?.role || !PLANNER_ROLES.has(appUser.role)) {
    throw new Error("Sin permisos para el Planner.");
  }
  return { supabase, userId: user.id };
}

export async function createScenario(
  name: string,
  description: string | null,
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const { supabase, userId } = await requireAccess();
  const trimmed = name.trim();
  if (trimmed.length < 3) return { ok: false, error: "Nombre muy corto." };

  const { data: scenario, error } = await supabase
    .from("planner_scenarios")
    .insert({ name: trimmed, description, created_by: userId })
    .select("id")
    .single();
  if (error || !scenario) return { ok: false, error: error?.message };

  const { error: copyError } = await supabase.rpc(
    "planner_copy_lots_to_scenario",
    { p_scenario_id: scenario.id },
  );
  if (copyError) {
    await supabase.from("planner_scenarios").delete().eq("id", scenario.id);
    return { ok: false, error: `Copiando lotes: ${copyError.message}` };
  }

  revalidatePath("/planner/simulador");
  return { ok: true, id: scenario.id };
}

const SCENARIO_STATUSES = new Set(["borrador", "evaluacion", "aprobado", "descartado"]);

export async function updateScenarioStatus(
  id: number,
  status: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAccess();
  if (!SCENARIO_STATUSES.has(status)) return { ok: false, error: "Estado inválido." };
  const { error } = await supabase
    .from("planner_scenarios")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/planner/simulador");
  revalidatePath("/planner/ocupacion");
  return { ok: true };
}

export async function deleteScenario(id: number): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAccess();
  const { error } = await supabase.from("planner_scenarios").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/planner/simulador");
  return { ok: true };
}

export type UpdateScenarioLotInput = {
  id: number;
  plants: number;
  startWeek: number;
  status: string;
};

export async function updateScenarioLot(
  input: UpdateScenarioLotInput,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAccess();

  const { data: lot } = await supabase
    .from("planner_scenario_lots")
    .select("*")
    .eq("id", input.id)
    .maybeSingle();
  if (!lot) return { ok: false, error: "Lote no encontrado." };

  const delta = input.startWeek - lot.start_week;
  const shift = (v: number | null) => (v === null ? null : v + delta);
  const trays = lot.tray_format
    ? Math.ceil(input.plants / lot.tray_format)
    : lot.trays;

  const { error } = await supabase
    .from("planner_scenario_lots")
    .update({
      plants: Math.trunc(input.plants),
      trays,
      status: input.status,
      start_week: input.startWeek,
      end_week: shift(lot.end_week),
      rooting_start_week: shift(lot.rooting_start_week),
      rooting_end_week: shift(lot.rooting_end_week),
      maturation_start_week: shift(lot.maturation_start_week),
      maturation_end_week: shift(lot.maturation_end_week),
      predispatch_start_week: shift(lot.predispatch_start_week),
      predispatch_end_week: shift(lot.predispatch_end_week),
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/planner/simulador/${lot.scenario_id}`);
  return { ok: true };
}

/** Nueva demanda what-if: crea un lote en el escenario derivando las etapas
 * de la ficha de la especie. */
export type CreateScenarioLotInput = {
  scenarioId: number;
  speciesId: number;
  plants: number;
  startWeek: number;
  year: number;
};

export async function createScenarioLot(
  input: CreateScenarioLotInput,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAccess();

  const { data: species } = await supabase
    .from("planner_species")
    .select("*")
    .eq("id", input.speciesId)
    .maybeSingle();
  if (!species) return { ok: false, error: "Especie no encontrada." };
  if (input.plants <= 0) return { ok: false, error: "Plantas inválidas." };

  const trays = Math.ceil(input.plants / (species.tray_format || 50));
  const rootingStart = input.startWeek;
  const rootingEnd = rootingStart + Math.max(0, species.rooting_weeks - 1);
  const maturationStart = rootingEnd + 1;
  const maturationEnd = maturationStart + Math.max(0, species.maturation_weeks - 1);
  const predispatchStart = maturationEnd + 1;
  const predispatchEnd = predispatchStart + Math.max(0, species.predispatch_weeks - 1);

  const { error } = await supabase.from("planner_scenario_lots").insert({
    scenario_id: input.scenarioId,
    lot_code: `SIM-${input.year}-${input.startWeek}-${species.code ?? species.id}`,
    species_id: species.id,
    year: input.year,
    start_week: input.startWeek,
    plants: Math.trunc(input.plants),
    tray_format: species.tray_format,
    trays,
    rooting_area_id: species.rooting_area_id,
    rooting_weeks: species.rooting_weeks,
    rooting_start_week: species.rooting_weeks > 0 ? rootingStart : null,
    rooting_end_week: species.rooting_weeks > 0 ? rootingEnd : null,
    maturation_area_id: species.maturation_area_id,
    maturation_weeks: species.maturation_weeks,
    maturation_start_week: species.maturation_weeks > 0 ? maturationStart : null,
    maturation_end_week: species.maturation_weeks > 0 ? maturationEnd : null,
    predispatch_area_id: species.predispatch_area_id,
    predispatch_weeks: species.predispatch_weeks,
    predispatch_start_week: species.predispatch_weeks > 0 ? predispatchStart : null,
    predispatch_end_week: species.predispatch_weeks > 0 ? predispatchEnd : null,
    end_week: predispatchEnd,
    status: "ACTIVO",
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/planner/simulador/${input.scenarioId}`);
  return { ok: true };
}
