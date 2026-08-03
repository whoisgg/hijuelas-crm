import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { TimelineData } from "@/lib/planner/occupancy-data";

/**
 * Datos de la vista Mapa (tab dentro de /planner/ocupacion): geometría real
 * del KMZ V.H.Hardening.kmz (migración 00067) sobre la MISMA TimelineData
 * que ya usa la timeline — respeta lo que el usuario esté viendo (mesa de
 * trabajo, plan vigente, o + simulaciones), sin una segunda query.
 */

export type SiteMapArea = {
  id: number;
  name: string;
  /** enraizamiento | maduracion | predespacho */
  stage: string;
  /** [[lng,lat],...], null si el KMZ no la delimita (ej. HFM) */
  geometry: [number, number][] | null;
  capacityTrays: number;
};

/** Una semana del recorrido del slider. La ocupación va por semana y no por
 *  área para que el mapa recoloree cambiando un índice, sin re-render del
 *  servidor: son ~64 semanas × 8 áreas, nada de peso. */
export type SiteMapWeek = {
  campaignWeek: number;
  /** "S32 · 2026" */
  label: string;
  /** "agosto 2026" */
  monthLabel: string;
  isCurrent: boolean;
  /** bandejas ocupadas por área id (string por serialización) */
  occupied: Record<string, number>;
};

export type SiteMapData = {
  areas: SiteMapArea[];
  /** áreas activas sin geometría en el KMZ — se listan aparte */
  undelimited: SiteMapArea[];
  weeks: SiteMapWeek[];
  /** posición inicial del slider: la semana vigente */
  currentIndex: number;
  alertAt: number;
  weekLabel: string | null;
};

/** Geometría por área (solo lo nuevo de la migración 00067) — liviano,
 *  nombre/capacidad ya vienen en TimelineData. */
export async function getAreaGeometry(
  supabase: SupabaseClient<Database>,
): Promise<Map<number, [number, number][]>> {
  const { data } = await supabase
    .from("planner_areas")
    .select("id, geometry")
    .not("geometry", "is", null);
  const map = new Map<number, [number, number][]>();
  for (const a of data ?? []) {
    if (a.geometry) map.set(a.id, a.geometry as [number, number][]);
  }
  return map;
}

export function buildSiteMapData(
  timeline: TimelineData,
  geometryById: Map<number, [number, number][]>,
): SiteMapData {
  const all: SiteMapArea[] = timeline.areas.map((a) => ({
    id: a.id,
    name: a.name,
    stage: a.stage,
    geometry: geometryById.get(a.id) ?? null,
    capacityTrays: a.capacityTrays,
  }));

  const weeks: SiteMapWeek[] = timeline.weeks.map((w) => ({
    campaignWeek: w.campaignWeek,
    label: `S${w.week} · ${w.year}`,
    monthLabel: w.monthLabel,
    isCurrent: w.isCurrent,
    occupied: w.occupied,
  }));

  const currentIndex = Math.max(0, weeks.findIndex((w) => w.isCurrent));
  const current = weeks[currentIndex] ?? null;

  return {
    areas: all.filter((a) => a.geometry !== null),
    undelimited: all.filter((a) => a.geometry === null),
    weeks,
    currentIndex,
    alertAt: timeline.maxUtilization,
    weekLabel: current?.isCurrent ? current.label : null,
  };
}
