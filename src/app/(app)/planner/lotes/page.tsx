import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { LotsTable, type LotRow } from "@/components/planner/lots-table";
import { getProgramByPlannerVarietyId } from "@/lib/planner/variety-programs";

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

  const [{ data: lots }, programByVarietyId] = await Promise.all([
    supabase
      .from("planner_lots")
      .select(
        "id, lot_code, year, start_week, end_week, plants, trays, status, planner_species(name), planner_varieties(id, name), rooting:planner_areas!planner_lots_rooting_area_id_fkey(name)",
      )
      .order("start_week")
      .order("lot_code")
      .limit(2000),
    getProgramByPlannerVarietyId(supabase),
  ]);

  const rows: LotRow[] = (lots ?? []).map((l) => {
    const variety =
      (l.planner_varieties as unknown as { id: number; name: string } | null) ?? null;
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
      rooting_area: (l.rooting as unknown as { name: string } | null)?.name ?? null,
      status: l.status,
    };
  });

  return (
    <AppShell>
      <PageHeader
        title="Lotes"
        description="Asignaciones planificadas por lote y etapa. Edita plantas, semana de inicio o estado — la ocupación se recalcula al instante."
      />
      <div className="mt-6">
        <LotsTable lots={rows} />
      </div>
    </AppShell>
  );
}
