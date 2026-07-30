import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { LotsTable, type LotRow } from "@/components/planner/lots-table";
import { getProgramByPlannerVarietyId } from "@/lib/planner/variety-programs";
import { currentLotLocation } from "@/lib/planner/lot-location";

export const metadata = { title: "Lotes" };
export const dynamic = "force-dynamic";

export default async function LotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getAccessProfile(supabase);
  if (!hasModuleAccess(profile, "planner")) {
    redirect("/apps");
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: lots }, programByVarietyId, { data: currentWeekRow }] = await Promise.all([
    supabase
      .from("planner_lots")
      .select(
        `id, lot_code, year, start_week, end_week, plants, trays, status, plant_code, plant_index, planner_species(name), planner_varieties(id, name),
        rooting_start_week, rooting_end_week, maturation_start_week, maturation_end_week, predispatch_start_week, predispatch_end_week,
        rooting:planner_areas!planner_lots_rooting_area_id_fkey(name), maturation:planner_areas!planner_lots_maturation_area_id_fkey(name), predispatch:planner_areas!planner_lots_predispatch_area_id_fkey(name)`,
      )
      .order("start_week")
      .order("lot_code")
      .limit(2000),
    getProgramByPlannerVarietyId(supabase),
    supabase
      .from("planner_calendar_weeks")
      .select("campaign_week")
      .lte("start_date", today)
      .gte("end_date", today)
      .maybeSingle(),
  ]);
  const currentWeek = currentWeekRow?.campaign_week ?? null;

  const rows: LotRow[] = (lots ?? []).map((l) => {
    const variety =
      (l.planner_varieties as unknown as { id: number; name: string } | null) ?? null;
    const areaName = (rel: unknown) => (rel as { name: string } | null)?.name ?? null;
    return {
      id: l.id,
      lot_code: l.lot_code,
      species: (l.planner_species as unknown as { name: string } | null)?.name ?? "—",
      variety: variety?.name ?? null,
      program: variety ? (programByVarietyId.get(variety.id) ?? null) : null,
      year: l.year,
      start_week: l.start_week,
      end_week: l.end_week,
      plants: l.plants,
      trays: l.trays,
      location: currentLotLocation(
        {
          rooting: {
            name: areaName(l.rooting),
            startWeek: l.rooting_start_week,
            endWeek: l.rooting_end_week,
          },
          maturation: {
            name: areaName(l.maturation),
            startWeek: l.maturation_start_week,
            endWeek: l.maturation_end_week,
          },
          predispatch: {
            name: areaName(l.predispatch),
            startWeek: l.predispatch_start_week,
            endWeek: l.predispatch_end_week,
          },
        },
        currentWeek,
      ),
      status: l.status,
      plantCode: l.plant_code,
      plantIndex: l.plant_index,
    };
  });

  return (
    <AppShell>
      <PageHeader
        title="Lotes"
        description="Asignaciones planificadas por lote y etapa. Edita plantas, semana de inicio o estado — la ocupación se recalcula al instante."
      />
      <div className="mt-6">
        <LotsTable lots={rows} canEdit={hasModuleAccess(profile, "planner", "admin")} />
      </div>
    </AppShell>
  );
}
