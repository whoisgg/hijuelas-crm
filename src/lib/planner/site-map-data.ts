import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { getTimelineData } from "@/lib/planner/occupancy-data";

/**
 * Datos de la vista georreferenciada (/planner/mapa): geometría real del
 * KMZ V.H.Hardening.kmz (migración 00067) + ocupación de la semana vigente,
 * mismo dato que ya usa la timeline de Ocupación — un solo modelo mental
 * entre las dos vistas.
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

export async function getSiteMapData(
  supabase: SupabaseClient<Database>,
): Promise<SiteMapData | null> {
  const [{ data: areaRows }, timeline] = await Promise.all([
    supabase
      .from("planner_areas")
      .select("id, name, capacity_trays, geometry")
      .eq("active", true)
      .order("priority"),
    getTimelineData(supabase),
  ]);
  if (!areaRows) return null;

  const current = timeline?.weeks.find((w) => w.isCurrent) ?? null;
  const occupiedByArea = current?.occupied ?? {};

  const all: SiteMapArea[] = areaRows.map((a) => {
    const occupied = occupiedByArea[String(a.id)] ?? 0;
    return {
      id: a.id,
      name: a.name,
      geometry: (a.geometry as [number, number][] | null) ?? null,
      capacityTrays: a.capacity_trays,
      occupiedTrays: occupied,
      pct: a.capacity_trays ? (occupied / a.capacity_trays) * 100 : 0,
    };
  });

  return {
    areas: all.filter((a) => a.geometry !== null),
    undelimited: all.filter((a) => a.geometry === null),
    alertAt: timeline?.maxUtilization ?? 0.95,
    weekLabel: current ? `S${current.week} · ${current.year}` : null,
  };
}
