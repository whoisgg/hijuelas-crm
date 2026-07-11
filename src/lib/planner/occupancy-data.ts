import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { computeOccupancy, occupancyRows } from "@/lib/planner/capacity";

/**
 * Arma los datos de la línea de tiempo de ocupación: áreas como columnas,
 * semanas-campaña como filas (motor con paridad verificada vs
 * 07_Capacidad_Semanal).
 */

export type TimelineArea = {
  id: number;
  name: string;
  stage: string;
  capacityTrays: number;
};

export type TimelineWeek = {
  campaignWeek: number;
  year: number;
  week: number;
  monthLabel: string; // "julio 2026"
  isCurrent: boolean;
  /** bandejas ocupadas por area id (como string por serialización) */
  occupied: Record<string, number>;
};

export type TimelineData = {
  areas: TimelineArea[];
  weeks: TimelineWeek[];
  maxUtilization: number; // ej. 0.95
  generatedFrom: { lots: number };
};

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export async function getTimelineData(
  supabase: SupabaseClient<Database>,
  opts: { scenarioId?: number } = {},
): Promise<TimelineData | null> {
  const lotColumns =
    "trays, status, rooting_area_id, rooting_start_week, rooting_end_week, maturation_area_id, maturation_start_week, maturation_end_week, predispatch_area_id, predispatch_start_week, predispatch_end_week";
  const lotsQuery = opts.scenarioId
    ? supabase
        .from("planner_scenario_lots")
        .select(lotColumns)
        .eq("scenario_id", opts.scenarioId)
        .eq("status", "ACTIVO")
        .limit(10000)
    : supabase
        .from("planner_lots")
        .select(lotColumns)
        .eq("status", "ACTIVO")
        .limit(10000);

  const [areasRes, lotsRes, paramsRes, calendarRes] = await Promise.all([
    supabase
      .from("planner_areas")
      .select("id, name, stage, capacity_trays, priority, active")
      .eq("active", true)
      .order("priority"),
    lotsQuery,
    supabase.from("planner_parameters").select("key, value"),
    supabase
      .from("planner_calendar_weeks")
      .select("campaign_week, year, week, start_date, end_date")
      .order("year")
      .order("week"),
  ]);

  const areasRaw = areasRes.data ?? [];
  const lots = lotsRes.data ?? [];
  if (!areasRaw.length || !lots.length) return null;

  // Orden de columnas: por etapa del flujo, luego prioridad.
  const stageOrder: Record<string, number> = {
    enraizamiento: 0,
    maduracion: 1,
    predespacho: 2,
  };
  const areas: TimelineArea[] = areasRaw
    .slice()
    .sort(
      (a, b) =>
        (stageOrder[a.stage] ?? 9) - (stageOrder[b.stage] ?? 9) ||
        a.priority - b.priority,
    )
    .map((a) => ({
      id: a.id,
      name: a.name,
      stage: a.stage,
      capacityTrays: a.capacity_trays,
    }));

  const maxUtilization = (() => {
    const raw = (paramsRes.data ?? []).find((p) =>
      p.key.toLowerCase().startsWith("utilización máx"),
    )?.value;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 && n <= 1 ? n : 0.95;
  })();

  const matrix = computeOccupancy(
    lots.map((l) => ({
      trays: l.trays,
      stages: [
        {
          areaKey: l.rooting_area_id,
          startWeek: l.rooting_start_week,
          endWeek: l.rooting_end_week,
        },
        {
          areaKey: l.maturation_area_id,
          startWeek: l.maturation_start_week,
          endWeek: l.maturation_end_week,
        },
        {
          areaKey: l.predispatch_area_id,
          startWeek: l.predispatch_start_week,
          endWeek: l.predispatch_end_week,
        },
      ],
    })),
  );

  const rows = occupancyRows(
    matrix,
    areas.map((a) => a.id),
  );
  if (!rows.length) return null;

  // Mapa semana-campaña → fecha real. El calendario cubre el año base;
  // más allá se extrapola sumando semanas de 7 días.
  const calendar = calendarRes.data ?? [];
  const byCampaign = new Map(
    calendar
      .filter((c) => c.campaign_week !== null)
      .map((c) => [c.campaign_week as number, c]),
  );
  const maxCal = calendar.reduce(
    (acc, c) => (c.campaign_week && c.campaign_week > acc.cw
      ? { cw: c.campaign_week, start: c.start_date, year: c.year }
      : acc),
    { cw: 0, start: null as string | null, year: 0 },
  );

  const today = new Date();
  const resolveWeek = (cw: number): { year: number; week: number; monthLabel: string; isCurrent: boolean } => {
    const cal = byCampaign.get(cw);
    if (cal) {
      const start = cal.start_date ? new Date(`${cal.start_date}T00:00:00`) : null;
      const end = cal.end_date ? new Date(`${cal.end_date}T23:59:59`) : null;
      const isCurrent = !!(start && end && today >= start && today <= end);
      const monthLabel = start
        ? `${MONTHS_ES[start.getMonth()]} ${start.getFullYear()}`
        : String(cal.year);
      return { year: cal.year, week: cal.week, monthLabel, isCurrent };
    }
    // Extrapolación más allá del calendario cargado.
    if (maxCal.start) {
      const start = new Date(`${maxCal.start}T00:00:00`);
      start.setDate(start.getDate() + (cw - maxCal.cw) * 7);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return {
        year: start.getFullYear(),
        week: cw - maxCal.cw > 0 ? cw - maxCal.cw : cw,
        monthLabel: `${MONTHS_ES[start.getMonth()]} ${start.getFullYear()}`,
        isCurrent: today >= start && today <= end,
      };
    }
    return { year: 0, week: cw, monthLabel: "", isCurrent: false };
  };

  const weeks: TimelineWeek[] = rows.map((r) => {
    const meta = resolveWeek(r.campaignWeek);
    return {
      campaignWeek: r.campaignWeek,
      year: meta.year,
      week: meta.week,
      monthLabel: meta.monthLabel,
      isCurrent: meta.isCurrent,
      occupied: r.byArea,
    };
  });

  return { areas, weeks, maxUtilization, generatedFrom: { lots: lots.length } };
}
