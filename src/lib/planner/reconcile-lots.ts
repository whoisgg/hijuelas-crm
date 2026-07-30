import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import {
  diffLotPlan,
  recordLotPlanChanges,
  toLotPlanSnapshot,
  type LotPlanRawFields,
} from "@/lib/planner/lot-plan-history";

/**
 * Reconciliación automática plan ↔ inventario ("la realidad manda").
 *
 * Al subir el inventario puede aparecer material físicamente presente cuyo
 * único lote posible figura entrando a FUTURO en el plan — contradicción:
 * no puede haber llegado algo cuyo lote "aún no llega". Regla acordada con
 * el usuario (2026-07-30, ver Flujo Decision Plano Sector.excalidraw): el
 * sistema resuelve solo, sin preguntar:
 *
 *  · Si el material calza (variedad exacta o prefijo, mismos supuestos del
 *    plano) con un lote pendiente que entra dentro de ≤ HORIZON semanas →
 *    se ADELANTA la semana del lote para que quede "llegado" (semana
 *    vigente − 1), desplazando TODAS sus semanas para preservar duraciones,
 *    y se registra el cambio en el historial append-only.
 *  · Si el lote entra más allá del horizonte → NO se mueve solo (movería
 *    semanas de ocupación a gran escala); el plano lo muestra como material
 *    con identidad propia.
 *  · Si la variedad no tiene ningún lote → no se inventa nada.
 *
 * También desplaza los lotes espejo de las mesas de trabajo (escenarios
 * is_working) para que el plano refleje el ajuste sin re-sincronizar.
 */

type Supa = SupabaseClient<Database>;

/** Máximo de semanas a futuro que un lote puede adelantarse solo. */
export const RECONCILE_HORIZON_WEEKS = 4;

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[áàäâ]/g, "a")
    .replace(/[éèëê]/g, "e")
    .replace(/[íìïî]/g, "i")
    .replace(/[óòöô]/g, "o")
    .replace(/[úùüû]/g, "u")
    .replace(/ñ/g, "n")
    .replace(/\s+/g, " ");

/** exact = mismo nombre; prefix = maestro ⊂ texto crudo con límite de palabra. */
function varietyMatches(master: string | null, raw: string): boolean {
  const cv = norm(master ?? "");
  const tv = norm(raw);
  if (!cv) return false;
  if (cv === tv) return true;
  return tv.startsWith(cv) && /[\s-]/.test(tv[cv.length] ?? "");
}

const WEEK_FIELDS = [
  "start_week",
  "end_week",
  "rooting_start_week",
  "rooting_end_week",
  "maturation_start_week",
  "maturation_end_week",
  "predispatch_start_week",
  "predispatch_end_week",
] as const;

type LotRow = LotPlanRawFields & {
  id: number;
  lot_code: string;
  species_name: string;
  variety_name: string | null;
};

export type ReconciledLot = {
  lotCode: string;
  variety: string;
  area: string;
  fromWeek: number;
  toWeek: number;
};

export async function reconcileLotsWithInventory(
  supabase: Supa,
  uploadId: string,
  userId: string | null,
): Promise<{ adjusted: ReconciledLot[]; warnings: string[] }> {
  const warnings: string[] = [];
  const adjusted: ReconciledLot[] = [];

  // Semana-campaña vigente.
  const today = new Date().toISOString().slice(0, 10);
  const { data: curWeekRow } = await supabase
    .from("planner_calendar_weeks")
    .select("campaign_week")
    .lte("start_date", today)
    .gte("end_date", today)
    .maybeSingle();
  const curWeek = curWeekRow?.campaign_week;
  if (!curWeek) {
    warnings.push("Reconciliación omitida: el calendario no cubre la fecha actual.");
    return { adjusted, warnings };
  }

  // Material del upload, agrupado por área × especie × variedad.
  const [{ data: items }, { data: locs }, { data: mods }, { data: areas }] =
    await Promise.all([
      supabase
        .from("planner_inventory_items")
        .select("location_id, species_name, variety_name, trays")
        .eq("upload_id", uploadId)
        .gt("trays", 0)
        .limit(5000),
      supabase.from("planner_locations").select("id, module_id"),
      supabase.from("planner_modules").select("id, area_id"),
      supabase.from("planner_areas").select("id, name"),
    ]);
  const moduleArea = new Map((mods ?? []).map((m) => [m.id, m.area_id]));
  const locArea = new Map(
    (locs ?? []).map((l) => [l.id, moduleArea.get(l.module_id) ?? null]),
  );
  const areaNameById = new Map((areas ?? []).map((a) => [a.id, a.name]));

  type Group = { areaId: number; species: string; variety: string; trays: number };
  const groups = new Map<string, Group>();
  for (const it of items ?? []) {
    if (it.location_id === null || !it.variety_name || !it.species_name) continue;
    const areaId = locArea.get(it.location_id);
    if (!areaId) continue;
    const key = `${areaId}::${norm(it.species_name)}::${norm(it.variety_name)}`;
    const g = groups.get(key) ?? {
      areaId,
      species: it.species_name,
      variety: it.variety_name,
      trays: 0,
    };
    g.trays += it.trays;
    groups.set(key, g);
  }
  if (!groups.size) return { adjusted, warnings };

  // Lotes activos con sus etapas.
  const { data: lotRows } = await supabase
    .from("planner_lots")
    .select(
      "id, lot_code, status, plants, trays, start_week, end_week, rooting_area_id, rooting_start_week, rooting_end_week, maturation_area_id, maturation_start_week, maturation_end_week, predispatch_area_id, predispatch_start_week, predispatch_end_week, planner_species(name), planner_varieties(name)",
    )
    .eq("status", "ACTIVO")
    .limit(5000);
  const lots: LotRow[] = (lotRows ?? []).map((r) => {
    const rec = r as unknown as Record<string, unknown>;
    return {
      ...(r as unknown as LotPlanRawFields),
      id: r.id,
      lot_code: r.lot_code,
      species_name:
        (rec.planner_species as { name: string } | null)?.name ?? "",
      variety_name:
        (rec.planner_varieties as { name: string } | null)?.name ?? null,
    };
  });

  const stageStartInArea = (lot: LotRow, areaId: number): number | null => {
    if (lot.rooting_area_id === areaId) return lot.rooting_start_week;
    if (lot.maturation_area_id === areaId) return lot.maturation_start_week;
    if (lot.predispatch_area_id === areaId) return lot.predispatch_start_week;
    return null;
  };

  const shifted = new Set<number>();

  for (const g of groups.values()) {
    const candidates = lots.filter(
      (l) =>
        norm(l.species_name) === norm(g.species) &&
        varietyMatches(l.variety_name, g.variety) &&
        stageStartInArea(l, g.areaId) !== null,
    );
    if (!candidates.length) continue;

    // Los lotes ya desplazados en esta pasada tienen sus semanas actualizadas
    // en memoria, así que cuentan como llegados para los grupos siguientes.
    const arrived = candidates.some((l) => stageStartInArea(l, g.areaId)! < curWeek);
    if (arrived) continue;

    // Pendientes dentro del horizonte, el que entra antes / cantidad más parecida.
    const pending = candidates
      .filter((l) => {
        const s = stageStartInArea(l, g.areaId)!;
        return s >= curWeek && s - curWeek <= RECONCILE_HORIZON_WEEKS;
      })
      .sort((a, b) => {
        const sa = stageStartInArea(a, g.areaId)!;
        const sb = stageStartInArea(b, g.areaId)!;
        return (
          sa - sb ||
          Math.abs((a.trays ?? 0) - g.trays) - Math.abs((b.trays ?? 0) - g.trays)
        );
      });
    const lot = pending[0];
    if (!lot || shifted.has(lot.id)) continue;

    const fromWeek = stageStartInArea(lot, g.areaId)!;
    const delta = curWeek - 1 - fromWeek;
    if (delta >= 0) continue; // solo se adelanta, nunca se atrasa

    const before = toLotPlanSnapshot(lot, areaNameById);
    // Solo se desplazan las semanas desde la etapa adelantada en adelante —
    // etapas ya ocurridas (ej. enraizamiento de un lote que hoy está en
    // predespacho) no se reescriben.
    const patch: Partial<Record<(typeof WEEK_FIELDS)[number], number>> = {};
    for (const f of WEEK_FIELDS) {
      const v = lot[f];
      if (v !== null && v !== undefined && v >= fromWeek) {
        patch[f] = v + delta;
        (lot as unknown as Record<string, number>)[f] = v + delta;
      }
    }
    const { error } = await supabase.from("planner_lots").update(patch).eq("id", lot.id);
    if (error) {
      warnings.push(`Reconciliación de ${lot.lot_code} falló: ${error.message}`);
      continue;
    }
    shifted.add(lot.id);

    await recordLotPlanChanges(supabase, {
      lotCode: lot.lot_code,
      diffs: diffLotPlan(before, toLotPlanSnapshot(lot, areaNameById)),
      source: "carga",
      userId,
      uploadId,
    });

    // Espejo en las mesas de trabajo activas (mismo lot_code + misma etapa/área).
    const { data: working } = await supabase
      .from("planner_scenarios")
      .select("id")
      .eq("is_working", true);
    const workingIds = (working ?? []).map((w) => w.id);
    if (workingIds.length) {
      const { data: scenRows } = await supabase
        .from("planner_scenario_lots")
        .select(
          "id, start_week, end_week, rooting_area_id, rooting_start_week, rooting_end_week, maturation_area_id, maturation_start_week, maturation_end_week, predispatch_area_id, predispatch_start_week, predispatch_end_week",
        )
        .in("scenario_id", workingIds)
        .eq("lot_code", lot.lot_code)
        .eq("status", "ACTIVO");
      for (const sr of scenRows ?? []) {
        const inArea =
          sr.rooting_area_id === g.areaId ||
          sr.maturation_area_id === g.areaId ||
          sr.predispatch_area_id === g.areaId;
        if (!inArea) continue;
        const sPatch: Partial<Record<(typeof WEEK_FIELDS)[number], number>> = {};
        for (const f of WEEK_FIELDS) {
          const v = (sr as unknown as Record<string, number | null>)[f];
          if (v !== null && v !== undefined && v >= fromWeek) sPatch[f] = v + delta;
        }
        await supabase.from("planner_scenario_lots").update(sPatch).eq("id", sr.id);
      }
    }

    adjusted.push({
      lotCode: lot.lot_code,
      variety: lot.variety_name ?? g.variety,
      area: areaNameById.get(g.areaId) ?? String(g.areaId),
      fromWeek,
      toWeek: fromWeek + delta,
    });
  }

  return { adjusted, warnings };
}
