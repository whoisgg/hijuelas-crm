import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { LotsTable, type LotRow } from "@/components/planner/lots-table";

export const metadata = { title: "Lotes" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

export default async function LotesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser?.role || !PLANNER_ROLES.has(appUser.role)) {
    redirect("/dashboard");
  }

  const { data: lots } = await supabase
    .from("planner_lots")
    .select(
      "id, lot_code, year, start_week, end_week, plants, trays, status, planner_species(name), planner_varieties(name), rooting:planner_areas!planner_lots_rooting_area_id_fkey(name)",
    )
    .order("start_week")
    .order("lot_code")
    .limit(2000);

  const rows: LotRow[] = (lots ?? []).map((l) => ({
    id: l.id,
    lot_code: l.lot_code,
    species: (l.planner_species as unknown as { name: string } | null)?.name ?? "—",
    variety: (l.planner_varieties as unknown as { name: string } | null)?.name ?? null,
    year: l.year,
    start_week: l.start_week,
    end_week: l.end_week,
    plants: l.plants,
    trays: l.trays,
    rooting_area: (l.rooting as unknown as { name: string } | null)?.name ?? null,
    status: l.status,
  }));

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
