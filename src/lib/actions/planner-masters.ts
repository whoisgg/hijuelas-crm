"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Maestros operacionales del Planner (/planner/ajustes): sectores y sus
 * capacidades, ficha de especie por etapa y parámetros globales. Los
 * catálogos compartidos (especies/variedades/programas del CRM) se
 * administran en /admin — acá solo lo que es propio del módulo.
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
  return { supabase };
}

export async function updatePlannerArea(input: {
  id: number;
  capacityTrays: number;
  priority: number;
  active: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAccess();
  if (input.capacityTrays < 0) return { ok: false, error: "Capacidad inválida." };

  const { error } = await supabase
    .from("planner_areas")
    .update({
      capacity_trays: Math.trunc(input.capacityTrays),
      priority: Math.trunc(input.priority),
      active: input.active,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/planner/ajustes");
  revalidatePath("/planner/ocupacion");
  return { ok: true };
}

export async function updatePlannerSpecies(input: {
  id: number;
  trayFormat: number;
  rootingWeeks: number;
  maturationWeeks: number;
  predispatchWeeks: number;
  rootingAreaId: number | null;
  maturationAreaId: number | null;
  predispatchAreaId: number | null;
  priority: number;
  active: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAccess();
  if (input.trayFormat <= 0) return { ok: false, error: "Formato de bandeja inválido." };
  if (input.rootingWeeks < 0 || input.maturationWeeks < 0 || input.predispatchWeeks < 0) {
    return { ok: false, error: "Las semanas no pueden ser negativas." };
  }

  const { error } = await supabase
    .from("planner_species")
    .update({
      tray_format: Math.trunc(input.trayFormat),
      rooting_weeks: Math.trunc(input.rootingWeeks),
      maturation_weeks: Math.trunc(input.maturationWeeks),
      predispatch_weeks: Math.trunc(input.predispatchWeeks),
      rooting_area_id: input.rootingAreaId,
      maturation_area_id: input.maturationAreaId,
      predispatch_area_id: input.predispatchAreaId,
      priority: Math.trunc(input.priority),
      active: input.active,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/planner/ajustes");
  return { ok: true };
}

export async function updatePlannerParameter(input: {
  key: string;
  value: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAccess();
  const value = input.value.trim();
  if (!value) return { ok: false, error: "Valor vacío." };

  const { error } = await supabase
    .from("planner_parameters")
    .update({ value, updated_at: new Date().toISOString() })
    .eq("key", input.key);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/planner/ajustes");
  revalidatePath("/planner/ocupacion");
  return { ok: true };
}
