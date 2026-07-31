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
  /** [[lng,lat],...], null si el KMZ no la delimita (ej. HFM) */
  geometry: [number, number][] | null;
  capacityTrays: number;
  occupiedTrays: number;
  pct: number;
};

export type SiteMapData = {
  areas: SiteMapArea[];
  /** áreas activas sin geometría en el KMZ — se listan aparte */
  undelimited: SiteMapArea[];
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
  const current = timeline.weeks.find((w) => w.isCurrent) ?? timeline.weeks[0] ?? null;
  const occupiedByArea = current?.occupied ?? {};

  const all: SiteMapArea[] = timeline.areas.map((a) => {
    const occupied = occupiedByArea[String(a.id)] ?? 0;
    return {
      id: a.id,
      name: a.name,
      geometry: geometryById.get(a.id) ?? null,
      capacityTrays: a.capacityTrays,
      occupiedTrays: occupied,
      pct: a.capacityTrays ? (occupied / a.capacityTrays) * 100 : 0,
    };
  });

  return {
    areas: all.filter((a) => a.geometry !== null),
    undelimited: all.filter((a) => a.geometry === null),
    alertAt: timeline.maxUtilization,
    weekLabel: current ? `S${current.week} · ${current.year}` : null,
  };
}
