"use server";

import { revalidatePath } from "next/cache";

import { requireModuleAccess } from "@/lib/access";

/**
 * Ubicación semana a semana de un lote (planner_lot_weeks) — granularidad
 * más fina que las 3 etapas fijas de planner_lots. 'plan' es lo derivado de
 * esas 3 ventanas (backfill + updateLot); 'manual' es lo que el usuario
 * corrigió a mano acá, registrando qué pasó realmente esa semana. Con esto
 * poblado a través del tiempo se puede sacar el protocolo real por variedad
 * (promedio de semanas por etapa).
 */

export type LotWeekRow = {
  campaignWeek: number;
  areaId: number | null;
  areaName: string | null;
  stage: string;
  source: "plan" | "manual";
};

/** Ver la ubicación semana a semana solo requiere acceso al módulo (viewer);
 *  editarla (updateLotWeek) sí exige admin, igual que updateLot. */
export async function getLotWeeks(lotId: number): Promise<{
  ok: boolean;
  weeks?: LotWeekRow[];
  areas?: { id: number; name: string; stage: string }[];
  error?: string;
}> {
  const { supabase } = await requireModuleAccess("planner");

  const [{ data: weeks, error }, { data: areas }] = await Promise.all([
    supabase
      .from("planner_lot_weeks")
      .select("campaign_week, area_id, stage, source, planner_areas(name)")
      .eq("lot_id", lotId)
      .order("campaign_week"),
    supabase.from("planner_areas").select("id, name, stage").order("priority"),
  ]);
  if (error) return { ok: false, error: error.message };

  return {
    ok: true,
    weeks: (weeks ?? []).map((w) => ({
      campaignWeek: w.campaign_week,
      areaId: w.area_id,
      areaName: (w.planner_areas as unknown as { name: string } | null)?.name ?? null,
      stage: w.stage,
      source: w.source as "plan" | "manual",
    })),
    areas: areas ?? [],
  };
}

export async function updateLotWeek(input: {
  lotId: number;
  campaignWeek: number;
  areaId: number;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireModuleAccess("planner", "admin");

  const { data: area } = await supabase
    .from("planner_areas")
    .select("stage")
    .eq("id", input.areaId)
    .maybeSingle();
  if (!area) return { ok: false, error: "Sector no encontrado." };

  const { error } = await supabase.from("planner_lot_weeks").upsert(
    {
      lot_id: input.lotId,
      campaign_week: input.campaignWeek,
      area_id: input.areaId,
      stage: area.stage,
      source: "manual",
      updated_at: new Date().toISOString(),
      updated_by: userId,
    },
    { onConflict: "lot_id,campaign_week" },
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/planner/lotes");
  return { ok: true };
}
