/**
 * Motor de capacidad del Planner.
 *
 * Calcula bandejas ocupadas por área × semana-campaña sumando los lotes
 * activos en cada etapa (enraizamiento → maduración → predespacho), con
 * intervalos [inicio, fin] inclusivos en semanas-campaña continuas
 * (la semana 54 es la semana 1 del año siguiente).
 *
 * Paridad verificada contra 07_Capacidad_Semanal del Vivero Planner v1.1.
 */

export type CapacityStage = {
  /** Clave del área (id numérico en BD o nombre en tests). */
  areaKey: string | number | null;
  startWeek: number | null;
  endWeek: number | null;
};

export type CapacityLot = {
  trays: number | null;
  stages: CapacityStage[];
};

export type OccupancyMatrix = Map<string | number, Map<number, number>>;

/** Suma bandejas ocupadas por área × semana-campaña. */
export function computeOccupancy(lots: CapacityLot[]): OccupancyMatrix {
  const matrix: OccupancyMatrix = new Map();
  for (const lot of lots) {
    const trays = lot.trays ?? 0;
    if (!trays) continue;
    for (const stage of lot.stages) {
      if (stage.areaKey === null || stage.startWeek === null || stage.endWeek === null) {
        continue;
      }
      if (stage.endWeek < stage.startWeek) continue; // duraciones 0 / invertidas
      let areaRow = matrix.get(stage.areaKey);
      if (!areaRow) {
        areaRow = new Map();
        matrix.set(stage.areaKey, areaRow);
      }
      for (let w = stage.startWeek; w <= stage.endWeek; w++) {
        areaRow.set(w, (areaRow.get(w) ?? 0) + trays);
      }
    }
  }
  return matrix;
}

export type WeekOccupancy = {
  /** Semana-campaña continua (1..n; >53 cae en el año siguiente). */
  campaignWeek: number;
  /** Bandejas ocupadas por área. */
  byArea: Record<string, number>;
};

/**
 * Convierte la matriz a filas por semana para la UI (semanas como filas).
 * Incluye todas las semanas del rango [minWeek, maxWeek] aunque estén en 0.
 */
export function occupancyRows(
  matrix: OccupancyMatrix,
  areaKeys: (string | number)[],
  minWeek?: number,
  maxWeek?: number,
): WeekOccupancy[] {
  let lo = minWeek ?? Infinity;
  let hi = maxWeek ?? -Infinity;
  if (minWeek === undefined || maxWeek === undefined) {
    for (const areaRow of matrix.values()) {
      for (const w of areaRow.keys()) {
        if (w < lo) lo = w;
        if (w > hi) hi = w;
      }
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  const rows: WeekOccupancy[] = [];
  for (let w = lo; w <= hi; w++) {
    const byArea: Record<string, number> = {};
    for (const key of areaKeys) {
      byArea[String(key)] = matrix.get(key)?.get(w) ?? 0;
    }
    rows.push({ campaignWeek: w, byArea });
  }
  return rows;
}
