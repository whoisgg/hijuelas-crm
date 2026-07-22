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

/**
 * Simulación: grupo de órdenes what-if que se suma al plan vigente. Nace
 * vacío y en borrador — NO copia el plan (a diferencia de createScenario).
 */
export async function createSimulation(
  name: string,
  description: string | null,
): Promise<{ ok: boolean; id?: number; error?: string }> {
  const { supabase, userId } = await requireAccess();
  const trimmed = name.trim();
  if (trimmed.length < 3) return { ok: false, error: "Nombre muy corto." };

  const { data: sim, error } = await supabase
    .from("planner_scenarios")
    .insert({
      name: trimmed,
      description,
      created_by: userId,
      status: "borrador",
      is_simulation: true,
    })
    .select("id")
    .single();
  if (error || !sim) return { ok: false, error: error?.message };

  revalidatePath("/planner/simulador");
  revalidatePath("/planner/ocupacion");
  return { ok: true, id: sim.id };
}

/**
 * Aprobar la mesa de trabajo: el plan vigente (planner_lots) se reemplaza con
 * los lotes de la mesa del usuario en una sola transacción (RPC). Después de
 * aprobar, mesa y plan quedan idénticos (0 cambios sin aprobar).
 */
export async function approveWorkingScenario(): Promise<{
  ok: boolean;
  applied?: number;
  error?: string;
}> {
  const { supabase, userId } = await requireAccess();

  const { data: working } = await supabase
    .from("planner_scenarios")
    .select("id")
    .eq("is_working", true)
    .eq("created_by", userId)
    .maybeSingle();
  if (!working) return { ok: false, error: "No tienes mesa de trabajo." };

  const { data: applied, error } = await supabase.rpc(
    "planner_apply_scenario_to_plan",
    { p_scenario_id: working.id },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/planner/ocupacion");
  revalidatePath("/planner");
  return { ok: true, applied: applied ?? 0 };
}

/**
 * Descartar la mesa de trabajo: se elimina el escenario (cascade borra lotes
 * y pins) y el próximo load la recrea como copia fresca del plan vigente.
 * También sirve para re-sincronizar la mesa tras subir un Planner nuevo.
 */
export async function discardWorkingScenario(): Promise<{
  ok: boolean;
  error?: string;
}> {
  const { supabase, userId } = await requireAccess();

  const { data: working } = await supabase
    .from("planner_scenarios")
    .select("id")
    .eq("is_working", true)
    .eq("created_by", userId)
    .maybeSingle();
  if (!working) return { ok: false, error: "No tienes mesa de trabajo." };

  const { error } = await supabase
    .from("planner_scenarios")
    .delete()
    .eq("id", working.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/planner/ocupacion");
  return { ok: true };
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

/**
 * Mesa de trabajo: mueve lotes del escenario de un sector a otro (misma
 * etapa), cambiando el área de la etapa que los ubica en el sector origen.
 * Redistribuye el sobrecupo sin tocar el plan real.
 */
export type MoveScenarioLotsInput = {
  scenarioId: number;
  moves: { lotId: number; stage: "rooting" | "maturation" | "predispatch" }[];
  targetAreaId: number;
};

export async function moveScenarioLotsToArea(
  input: MoveScenarioLotsInput,
): Promise<{ ok: boolean; moved: number; error?: string }> {
  const { supabase } = await requireAccess();
  if (!input.moves.length) return { ok: false, moved: 0, error: "Nada que mover." };

  const { data: target } = await supabase
    .from("planner_areas")
    .select("id, stage")
    .eq("id", input.targetAreaId)
    .maybeSingle();
  if (!target) return { ok: false, moved: 0, error: "Sector destino no existe." };

  let moved = 0;
  for (const m of input.moves) {
    const col = `${m.stage}_area_id` as const;
    const { error } = await supabase
      .from("planner_scenario_lots")
      .update({ [col]: input.targetAreaId })
      .eq("id", m.lotId)
      .eq("scenario_id", input.scenarioId);
    if (error) return { ok: false, moved, error: error.message };
    moved++;
  }

  // La ruta del sector es force-dynamic y el cliente hace router.refresh(),
  // así que basta con revalidar el detalle del escenario.
  revalidatePath(`/planner/simulador/${input.scenarioId}`);
  return { ok: true, moved };
}

/**
 * Mueve una porción (cantidad ajustable de bandejas) de un lote del escenario
 * a otro sector de la misma etapa. Si mueve el lote completo, sólo cambia el
 * área de la etapa; si mueve una parte, parte el lote (crea uno nuevo con la
 * porción movida y reduce el original). El destino lo recibe en su inbox.
 */
export async function moveScenarioLotPortion(input: {
  scenarioId: number;
  lotId: number;
  stage: "rooting" | "maturation" | "predispatch";
  trays: number;
  targetAreaId: number;
}): Promise<{ ok: boolean; split?: boolean; error?: string }> {
  const { supabase } = await requireAccess();

  const { data: lot } = await supabase
    .from("planner_scenario_lots")
    .select("*")
    .eq("id", input.lotId)
    .eq("scenario_id", input.scenarioId)
    .maybeSingle();
  if (!lot) return { ok: false, error: "Lote no encontrado." };

  const { data: target } = await supabase
    .from("planner_areas")
    .select("id, stage")
    .eq("id", input.targetAreaId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Sector destino no existe." };

  const total = lot.trays ?? 0;
  const move = Math.max(0, Math.min(Math.trunc(input.trays), total));
  if (move <= 0) return { ok: false, error: "Cantidad inválida." };

  const col = `${input.stage}_area_id` as const;

  // Lote completo → sólo re-apuntar la etapa y soltar el pin (cambió de sector).
  if (move >= total) {
    const { error } = await supabase
      .from("planner_scenario_lots")
      .update({ [col]: input.targetAreaId })
      .eq("id", input.lotId)
      .eq("scenario_id", input.scenarioId);
    if (error) return { ok: false, error: error.message };
    await supabase
      .from("planner_scenario_lot_pins")
      .delete()
      .eq("scenario_id", input.scenarioId)
      .eq("scenario_lot_id", input.lotId)
      .eq("stage", input.stage);
    revalidatePath(`/planner/simulador/${input.scenarioId}`);
    return { ok: true, split: false };
  }

  // Porción → partir el lote: nuevo lote con lo movido, original reducido.
  const frac = move / total;
  const movedPlants = Math.round((lot.plants ?? 0) * frac);
  const rest = { ...(lot as Record<string, unknown>) };
  delete rest.id;
  delete rest.created_at;
  const { error: insertError } = await supabase
    .from("planner_scenario_lots")
    .insert({
      ...rest,
      lot_code: `${lot.lot_code}·M`,
      trays: move,
      plants: movedPlants,
      [col]: input.targetAreaId,
    });
  if (insertError) return { ok: false, error: insertError.message };

  const { error: updateError } = await supabase
    .from("planner_scenario_lots")
    .update({ trays: total - move, plants: (lot.plants ?? 0) - movedPlants })
    .eq("id", input.lotId)
    .eq("scenario_id", input.scenarioId);
  if (updateError) return { ok: false, error: updateError.message };

  revalidatePath(`/planner/simulador/${input.scenarioId}`);
  return { ok: true, split: true };
}

/**
 * Merma: descarta una cantidad de bandejas del lote en el escenario (plantas
 * perdidas / bajas). Si merma el lote completo, lo elimina; si es parcial,
 * reduce las bandejas y plantas. No toca el plan real (es la mesa de trabajo).
 */
export async function mermarScenarioLotPortion(input: {
  scenarioId: number;
  lotId: number;
  stage: "rooting" | "maturation" | "predispatch";
  trays: number;
}): Promise<{ ok: boolean; full?: boolean; error?: string }> {
  const { supabase } = await requireAccess();

  const { data: lot } = await supabase
    .from("planner_scenario_lots")
    .select("id, trays, plants")
    .eq("id", input.lotId)
    .eq("scenario_id", input.scenarioId)
    .maybeSingle();
  if (!lot) return { ok: false, error: "Lote no encontrado." };

  const total = lot.trays ?? 0;
  const merma = Math.max(0, Math.min(Math.trunc(input.trays), total));
  if (merma <= 0) return { ok: false, error: "Cantidad inválida." };

  // Merma total → eliminar el lote (y sus pins) del escenario.
  if (merma >= total) {
    await supabase
      .from("planner_scenario_lot_pins")
      .delete()
      .eq("scenario_id", input.scenarioId)
      .eq("scenario_lot_id", input.lotId);
    const { error } = await supabase
      .from("planner_scenario_lots")
      .delete()
      .eq("id", input.lotId)
      .eq("scenario_id", input.scenarioId);
    if (error) return { ok: false, error: error.message };
    revalidatePath(`/planner/simulador/${input.scenarioId}`);
    return { ok: true, full: true };
  }

  // Merma parcial → reducir bandejas y plantas proporcionalmente.
  const frac = merma / total;
  const mermaPlants = Math.round((lot.plants ?? 0) * frac);
  const { error } = await supabase
    .from("planner_scenario_lots")
    .update({ trays: total - merma, plants: (lot.plants ?? 0) - mermaPlants })
    .eq("id", input.lotId)
    .eq("scenario_id", input.scenarioId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/planner/simulador/${input.scenarioId}`);
  return { ok: true, full: false };
}

/**
 * Fija (pin) un lote a un mesón dentro del escenario: la proyección lo
 * coloca primero ahí y el FIFO rellena el resto. locationId null quita el pin.
 */
export async function pinLotToLocation(input: {
  scenarioId: number;
  lotId: number;
  stage: "rooting" | "maturation" | "predispatch";
  locationId: number | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAccess();

  if (input.locationId === null) {
    const { error } = await supabase
      .from("planner_scenario_lot_pins")
      .delete()
      .eq("scenario_id", input.scenarioId)
      .eq("scenario_lot_id", input.lotId)
      .eq("stage", input.stage);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("planner_scenario_lot_pins").upsert(
      {
        scenario_id: input.scenarioId,
        scenario_lot_id: input.lotId,
        stage: input.stage,
        location_id: input.locationId,
      },
      { onConflict: "scenario_lot_id,stage" },
    );
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/planner/simulador/${input.scenarioId}`);
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
  revalidatePath("/planner/simulador");
  revalidatePath("/planner/ocupacion");
  return { ok: true };
}
