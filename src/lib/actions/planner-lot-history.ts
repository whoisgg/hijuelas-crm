"use server";

import { revalidatePath } from "next/cache";

import { requireModuleAccess } from "@/lib/access";
import {
  RAW_COLUMN,
  diffLotPlan,
  parseValue,
  recordLotPlanChanges,
  toLotPlanSnapshot,
  type FieldKey,
} from "@/lib/planner/lot-plan-history";
import { LOT_COLUMNS, signature, type LotRow } from "@/lib/planner/workspace-diff";

/**
 * Revertir un cambio de plan (pestaña Historial de Movimientos): "no hay
 * eliminación, solo reversa o modificación" — revertir NO borra el batch
 * original, escribe uno NUEVO que deshace los valores. Solo el batch MÁS
 * RECIENTE de un lote es reversible (LIFO): revertir uno de en medio
 * reescribiría historia sobre ediciones posteriores que no se tocaron.
 */
export async function revertLotPlanChange(
  batchId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireModuleAccess("planner", "admin");

  const { data: rows } = await supabase
    .from("planner_lot_plan_changes")
    .select("lot_code, field, old_value")
    .eq("change_batch_id", batchId);
  if (!rows?.length) return { ok: false, error: "No se encontró el cambio." };
  const lotCode = rows[0].lot_code;

  const { data: latest } = await supabase
    .from("planner_lot_plan_changes")
    .select("change_batch_id")
    .eq("lot_code", lotCode)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latest && latest.change_batch_id !== batchId) {
    return {
      ok: false,
      error: "Hay cambios más recientes sobre este lote — no se puede revertir a mitad de camino.",
    };
  }

  const { data: lotRows } = await supabase.from("planner_lots").select("*").eq("lot_code", lotCode);
  if (!lotRows?.length) return { ok: false, error: "Lote no encontrado." };
  if (lotRows.length > 1) {
    return {
      ok: false,
      error: "Código de lote duplicado en el plan — no se puede revertir automáticamente.",
    };
  }
  const lot = lotRows[0];

  const { data: areaRows } = await supabase.from("planner_areas").select("id, name");
  const areaIdByName = new Map((areaRows ?? []).map((a) => [a.name, a.id]));
  const areaNameById = new Map((areaRows ?? []).map((a) => [a.id, a.name]));

  const patch: Record<string, string | number | null> = {};
  for (const r of rows) {
    const column = RAW_COLUMN[r.field as FieldKey];
    if (!column) continue;
    patch[column] = parseValue(r.field as FieldKey, r.old_value ?? "—", areaIdByName);
  }
  if (!Object.keys(patch).length) return { ok: false, error: "Nada que revertir." };

  const before = toLotPlanSnapshot(lot, areaNameById);
  const { error } = await supabase.from("planner_lots").update(patch).eq("id", lot.id);
  if (error) return { ok: false, error: error.message };

  // Semanas: si start_week vuelve a un valor previo, planner_lot_weeks se
  // desplaza igual que en updateLot (delete+insert por el unique lot_id+semana).
  if (typeof patch.start_week === "number" && patch.start_week !== lot.start_week) {
    const delta = patch.start_week - lot.start_week;
    const { data: weeks } = await supabase
      .from("planner_lot_weeks")
      .select("campaign_week, area_id, stage, source")
      .eq("lot_id", lot.id);
    if (weeks?.length) {
      await supabase.from("planner_lot_weeks").delete().eq("lot_id", lot.id);
      await supabase.from("planner_lot_weeks").insert(
        weeks.map((w) => ({
          lot_id: lot.id,
          campaign_week: w.campaign_week + delta,
          area_id: w.area_id,
          stage: w.stage,
          source: w.source,
        })),
      );
    }
  }

  // Mesas de trabajo: mismo fast-forward que updateLot — si la copia de este
  // lote en una mesa seguía idéntica al plan de ANTES de este revert, se
  // actualiza junto con él; si ya divergía (movimiento real del usuario), se
  // deja intacta.
  const { data: workingScenarios } = await supabase
    .from("planner_scenarios")
    .select("id")
    .eq("is_working", true);
  if (workingScenarios?.length) {
    const oldSig = signature(lot as unknown as LotRow);
    for (const ws of workingScenarios) {
      const { data: mesaRows } = await supabase
        .from("planner_scenario_lots")
        .select(LOT_COLUMNS)
        .eq("scenario_id", ws.id)
        .eq("lot_code", lotCode);
      if (mesaRows?.length === 1 && signature(mesaRows[0] as unknown as LotRow) === oldSig) {
        await supabase
          .from("planner_scenario_lots")
          .update(patch)
          .eq("scenario_id", ws.id)
          .eq("lot_code", lotCode);
      }
    }
  }

  const after = toLotPlanSnapshot({ ...lot, ...patch }, areaNameById);
  const diffs = diffLotPlan(before, after);
  await recordLotPlanChanges(supabase, {
    lotCode,
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
