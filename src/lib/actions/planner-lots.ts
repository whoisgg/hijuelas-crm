"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Edición manual de lotes (E2.6): cambiar plantas, semana de inicio o
 * estado sin recargar el Excel. Mover la semana de inicio desplaza todas
 * las etapas por el mismo delta; cambiar plantas recalcula bandejas (ceil).
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

export type UpdateLotInput = {
  id: number;
  plants: number;
  startWeek: number;
  status: string;
};

export async function updateLot(input: UpdateLotInput): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAccess();

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

  const delta = input.startWeek - lot.start_week;
  const shift = (v: number | null) => (v === null ? null : v + delta);
  const trays = lot.tray_format
    ? Math.ceil(input.plants / lot.tray_format)
    : lot.trays;

  const { error } = await supabase
    .from("planner_lots")
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

  revalidatePath("/planner");
  revalidatePath("/planner/ocupacion");
  revalidatePath("/planner/lotes");
  return { ok: true };
}
