"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

/**
 * Movimientos reales del vivero: recepción (entra un lote), traslado
 * (cambia de área/etapa) y despacho (sale). Registro operativo que
 * complementa el plan; la comparación plan vs real usa el snapshot.
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

export type CreateMovementInput = {
  type: "recepcion" | "traslado" | "despacho";
  lotCode: string | null;
  areaFromId: number | null;
  areaToId: number | null;
  year: number;
  week: number;
  trays: number;
  plants: number;
  notes: string | null;
};

export async function createMovement(
  input: CreateMovementInput,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireAccess();

  if (!["recepcion", "traslado", "despacho"].includes(input.type)) {
    return { ok: false, error: "Tipo inválido." };
  }
  if (!Number.isFinite(input.week) || input.week < 1 || input.week > 53) {
    return { ok: false, error: "Semana inválida (1–53)." };
  }
  if (input.type === "traslado" && !input.areaToId) {
    return { ok: false, error: "Un traslado necesita área de destino." };
  }

  let lotId: number | null = null;
  if (input.lotCode) {
    const { data: lot } = await supabase
      .from("planner_lots")
      .select("id")
      .eq("lot_code", input.lotCode.trim())
      .limit(1)
      .maybeSingle();
    if (!lot) return { ok: false, error: `Lote "${input.lotCode}" no encontrado.` };
    lotId = lot.id;
  }

  const { error } = await supabase.from("planner_movements").insert({
    lot_id: lotId,
    type: input.type,
    area_from_id: input.areaFromId,
    area_to_id: input.areaToId,
    year: Math.trunc(input.year),
    week: Math.trunc(input.week),
    trays: Math.max(0, Math.trunc(input.trays)),
    plants: Math.max(0, Math.trunc(input.plants)),
    notes: input.notes,
    created_by: userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/planner/movimientos");
  return { ok: true };
}

export async function deleteMovement(id: number): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAccess();
  const { error } = await supabase.from("planner_movements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/planner/movimientos");
  return { ok: true };
}
