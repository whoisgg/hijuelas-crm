import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { TimelineData } from "@/lib/planner/occupancy-data";

/**
 * Plan vs real: compara la ocupación planificada de la semana actual con la
 * foto del último snapshot de Hotelería, por área.
 */

export type PlanVsRealRow = {
  areaId: number;
  areaName: string;
  capacity: number;
  planTrays: number;
  realTrays: number;
  deltaTrays: number;
};

export type PlanVsReal = {
  week: { week: number; year: number };
  snapshotDate: string;
  rows: PlanVsRealRow[];
};

export async function getPlanVsReal(
  supabase: SupabaseClient<Database>,
  timeline: TimelineData,
): Promise<PlanVsReal | null> {
  const current = timeline.weeks.find((w) => w.isCurrent);
  if (!current) return null;

  const { data: lastUpload } = await supabase
    .from("planner_uploads")
    .select("id, created_at")
    .eq("kind", "hoteleria")
    .eq("status", "applied")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!lastUpload) return null;

  const { data: snapshot } = await supabase
    .from("planner_occupancy_snapshot")
    .select("trays, planner_locations(planner_modules(area_id))")
    .eq("upload_id", lastUpload.id)
    .limit(10000);

  const realByArea = new Map<number, number>();
  for (const row of snapshot ?? []) {
    const areaId = (
      row.planner_locations as unknown as {
        planner_modules: { area_id: number } | null;
      } | null
    )?.planner_modules?.area_id;
    if (!areaId) continue;
    realByArea.set(areaId, (realByArea.get(areaId) ?? 0) + row.trays);
  }
  if (!realByArea.size) return null;

  const rows: PlanVsRealRow[] = timeline.areas
    .filter((a) => realByArea.has(a.id) || (current.occupied[String(a.id)] ?? 0) > 0)
    .map((a) => {
      const plan = current.occupied[String(a.id)] ?? 0;
      const real = realByArea.get(a.id) ?? 0;
      return {
        areaId: a.id,
        areaName: a.name,
        capacity: a.capacityTrays,
        planTrays: plan,
        realTrays: real,
        deltaTrays: real - plan,
      };
    });

  return {
    week: { week: current.week, year: current.year },
    snapshotDate: lastUpload.created_at,
    rows,
  };
}
