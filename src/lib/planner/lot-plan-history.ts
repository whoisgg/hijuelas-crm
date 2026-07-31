import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Historial append-only de cambios al plan de un lote (Movimientos: vista
 * única). Dos orígenes escriben acá: la edición manual de /planner/lotes
 * (`updateLot`) y una nueva carga del Excel (`applyPlannerCore`). Cada
 * edición es un "batch" (change_batch_id) con una fila por campo que
 * cambió — así "3 modificaciones" en la UI cuenta batches, no campos.
 *
 * Nunca se actualiza ni se borra una fila (la tabla no tiene policy de
 * UPDATE/DELETE): corregir algo es agregar un batch nuevo, no tocar el
 * anterior.
 */

type Supa = SupabaseClient<Database>;

export type LotPlanSnapshot = {
  status: string;
  plants: number;
  trays: number | null;
  start_week: number;
  end_week: number | null;
  rooting_area: string | null;
  rooting_start_week: number | null;
  rooting_end_week: number | null;
  maturation_area: string | null;
  maturation_start_week: number | null;
  maturation_end_week: number | null;
  predispatch_area: string | null;
  predispatch_start_week: number | null;
  predispatch_end_week: number | null;
};

/** Forma cruda tal como vive en planner_lots (áreas como id, no nombre). */
export type LotPlanRawFields = {
  status: string;
  plants: number;
  trays: number | null;
  start_week: number;
  end_week: number | null;
  rooting_area_id: number | null;
  rooting_start_week: number | null;
  rooting_end_week: number | null;
  maturation_area_id: number | null;
  maturation_start_week: number | null;
  maturation_end_week: number | null;
  predispatch_area_id: number | null;
  predispatch_start_week: number | null;
  predispatch_end_week: number | null;
};

/** Resuelve los area_id de un lote crudo a nombre para poder diffear/mostrar. */
export function toLotPlanSnapshot(
  raw: LotPlanRawFields,
  areaNameById: Map<number, string>,
): LotPlanSnapshot {
  const nameOf = (id: number | null) => (id !== null ? (areaNameById.get(id) ?? null) : null);
  return {
    status: raw.status,
    plants: raw.plants,
    trays: raw.trays,
    start_week: raw.start_week,
    end_week: raw.end_week,
    rooting_area: nameOf(raw.rooting_area_id),
    rooting_start_week: raw.rooting_start_week,
    rooting_end_week: raw.rooting_end_week,
    maturation_area: nameOf(raw.maturation_area_id),
    maturation_start_week: raw.maturation_start_week,
    maturation_end_week: raw.maturation_end_week,
    predispatch_area: nameOf(raw.predispatch_area_id),
    predispatch_start_week: raw.predispatch_start_week,
    predispatch_end_week: raw.predispatch_end_week,
  };
}

export type FieldKey = keyof LotPlanSnapshot;

const WEEK_FIELDS = new Set<FieldKey>([
  "start_week",
  "end_week",
  "rooting_start_week",
  "rooting_end_week",
  "maturation_start_week",
  "maturation_end_week",
  "predispatch_start_week",
  "predispatch_end_week",
]);

// Orden de despliegue = orden de las etapas del lote.
const FIELD_ORDER: FieldKey[] = [
  "status",
  "plants",
  "trays",
  "start_week",
  "rooting_area",
  "rooting_start_week",
  "rooting_end_week",
  "maturation_area",
  "maturation_start_week",
  "maturation_end_week",
  "predispatch_area",
  "predispatch_start_week",
  "predispatch_end_week",
  "end_week",
];

const FIELD_LABELS: Record<FieldKey, string> = {
  status: "Estado",
  plants: "Plantas",
  trays: "Bandejas",
  start_week: "Semana de inicio",
  end_week: "Semana de término",
  rooting_area: "Área de enraizamiento",
  rooting_start_week: "Enraizamiento — inicio",
  rooting_end_week: "Enraizamiento — fin",
  maturation_area: "Área de maduración",
  maturation_start_week: "Maduración — inicio",
  maturation_end_week: "Maduración — fin",
  predispatch_area: "Área de predespacho",
  predispatch_start_week: "Predespacho — inicio",
  predispatch_end_week: "Predespacho — fin",
};

function formatValue(field: FieldKey, v: string | number | null): string {
  if (v === null) return "—";
  if (WEEK_FIELDS.has(field)) return `S${v}`;
  if (field === "plants" || field === "trays") return Number(v).toLocaleString("es-CL");
  return String(v);
}

/** Nombre de la columna cruda en planner_lots para cada campo del snapshot
 *  (las 3 áreas viven como *_area_id, resueltas a nombre solo para mostrar). */
export const RAW_COLUMN: Record<FieldKey, string> = {
  status: "status",
  plants: "plants",
  trays: "trays",
  start_week: "start_week",
  end_week: "end_week",
  rooting_area: "rooting_area_id",
  rooting_start_week: "rooting_start_week",
  rooting_end_week: "rooting_end_week",
  maturation_area: "maturation_area_id",
  maturation_start_week: "maturation_start_week",
  maturation_end_week: "maturation_end_week",
  predispatch_area: "predispatch_area_id",
  predispatch_start_week: "predispatch_start_week",
  predispatch_end_week: "predispatch_end_week",
};

const AREA_FIELDS = new Set<FieldKey>(["rooting_area", "maturation_area", "predispatch_area"]);

/** Inverso de formatValue: recupera el valor crudo para escribir de vuelta a
 *  planner_lots al revertir un cambio. Los campos de área necesitan mapear
 *  nombre → id (areaIdByName); si el área no existe más, revierte a null en
 *  vez de fallar — mejor una silla sin área que un revert que no aplica. */
export function parseValue(
  field: FieldKey,
  formatted: string,
  areaIdByName: Map<string, number>,
): string | number | null {
  if (formatted === "—") return null;
  if (WEEK_FIELDS.has(field)) return Number(formatted.replace(/^S/, ""));
  if (field === "plants" || field === "trays") return Number(formatted.replace(/\./g, ""));
  if (AREA_FIELDS.has(field)) return areaIdByName.get(formatted) ?? null;
  return formatted;
}

export type PlanFieldDiff = {
  field: FieldKey;
  label: string;
  oldValue: string;
  newValue: string;
};

/** Compara dos snapshots ya resueltos (áreas como nombre) campo por campo. */
export function diffLotPlan(before: LotPlanSnapshot, after: LotPlanSnapshot): PlanFieldDiff[] {
  const diffs: PlanFieldDiff[] = [];
  for (const field of FIELD_ORDER) {
    const oldValue = formatValue(field, before[field]);
    const newValue = formatValue(field, after[field]);
    if (oldValue !== newValue) {
      diffs.push({ field, label: FIELD_LABELS[field], oldValue, newValue });
    }
  }
  return diffs;
}

/** Inserta un batch (una fila por campo) si hay diffs; no hace nada si la lista viene vacía. */
export async function recordLotPlanChanges(
  supabase: Supa,
  params: {
    lotCode: string;
    diffs: PlanFieldDiff[];
    source: "manual" | "carga";
    userId: string | null;
    uploadId?: string | null;
  },
): Promise<void> {
  if (params.diffs.length === 0) return;
  const changeBatchId = randomUUID();
  const rows = params.diffs.map((d) => ({
    lot_code: params.lotCode,
    change_batch_id: changeBatchId,
    source: params.source,
    field: d.field,
    old_value: d.oldValue,
    new_value: d.newValue,
    changed_by: params.userId,
    upload_id: params.uploadId ?? null,
  }));
  const { error } = await supabase.from("planner_lot_plan_changes").insert(rows);
  if (error) throw new Error(`Historial de cambios: ${error.message}`);
}

export type LotPlanChangeEvent = {
  batchId: string;
  source: "manual" | "carga";
  changedAt: string;
  changedByName: string | null;
  uploadFileName: string | null;
  fields: { label: string; oldValue: string | null; newValue: string | null }[];
};

/** Historial completo agrupado por lote → lista de batches, más reciente primero. */
export async function getLotPlanHistory(supabase: Supa): Promise<Map<string, LotPlanChangeEvent[]>> {
  const { data } = await supabase
    .from("planner_lot_plan_changes")
    .select(
      "lot_code, change_batch_id, source, field, old_value, new_value, created_at, app_users(full_name), planner_uploads(file_name)",
    )
    .order("created_at", { ascending: false })
    .limit(5000);

  const byLot = new Map<string, Map<string, LotPlanChangeEvent>>();
  for (const row of data ?? []) {
    let batches = byLot.get(row.lot_code);
    if (!batches) {
      batches = new Map();
      byLot.set(row.lot_code, batches);
    }
    let event = batches.get(row.change_batch_id);
    if (!event) {
      event = {
        batchId: row.change_batch_id,
        source: row.source as "manual" | "carga",
        changedAt: row.created_at,
        changedByName:
          (row.app_users as unknown as { full_name: string | null } | null)?.full_name ?? null,
        uploadFileName:
          (row.planner_uploads as unknown as { file_name: string } | null)?.file_name ?? null,
        fields: [],
      };
      batches.set(row.change_batch_id, event);
    }
    event.fields.push({
      label: FIELD_LABELS[row.field as FieldKey] ?? row.field,
      oldValue: row.old_value,
      newValue: row.new_value,
    });
  }

  const result = new Map<string, LotPlanChangeEvent[]>();
  for (const [lotCode, batches] of byLot) {
    result.set(
      lotCode,
      [...batches.values()].sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1)),
    );
  }
  return result;
}

export type PlanChangeLogEntry = LotPlanChangeEvent & {
  lotCode: string;
  /** el batch más reciente de SU lote — solo ese es reversible (LIFO, sin
   *  reescribir historia a mitad de camino) */
  isLatestForLot: boolean;
};

/** Historial global, más reciente primero — para la pestaña "Historial" de
 *  Movimientos (a diferencia de getLotPlanHistory, que lo agrupa por lote
 *  para el chevron dentro de cada fila). */
export async function getPlanChangeLog(supabase: Supa, limit = 300): Promise<PlanChangeLogEntry[]> {
  const byLot = await getLotPlanHistory(supabase);
  const flat: PlanChangeLogEntry[] = [];
  for (const [lotCode, events] of byLot) {
    events.forEach((event, i) => {
      flat.push({ ...event, lotCode, isLatestForLot: i === 0 });
    });
  }
  flat.sort((a, b) => (a.changedAt < b.changedAt ? 1 : -1));
  return flat.slice(0, limit);
}
