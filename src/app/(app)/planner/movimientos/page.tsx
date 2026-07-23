import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  MovementsView,
  type MovementRow,
} from "@/components/planner/movements-view";
import { getTimelineData } from "@/lib/planner/occupancy-data";

export const metadata = { title: "Movimientos" };
export const dynamic = "force-dynamic";

export default async function MovimientosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getAccessProfile(supabase);
  if (!hasModuleAccess(profile, "planner")) {
    redirect("/apps");
  }

  const [{ data: movements }, { data: areas }, timeline] = await Promise.all([
    supabase
      .from("planner_movements")
      .select(
        "id, type, year, week, trays, plants, notes, created_at, planner_lots(lot_code), from:planner_areas!planner_movements_area_from_id_fkey(name), to:planner_areas!planner_movements_area_to_id_fkey(name), app_users(full_name)",
      )
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("planner_areas").select("id, name").eq("active", true).order("priority"),
    getTimelineData(supabase),
  ]);

  const rows: MovementRow[] = (movements ?? []).map((m) => ({
    id: m.id,
    type: m.type,
    lot_code: (m.planner_lots as unknown as { lot_code: string } | null)?.lot_code ?? null,
    area_from: (m.from as unknown as { name: string } | null)?.name ?? null,
    area_to: (m.to as unknown as { name: string } | null)?.name ?? null,
    year: m.year,
    week: m.week,
    trays: m.trays,
    plants: m.plants,
    notes: m.notes,
    created_by_name:
      (m.app_users as unknown as { full_name: string | null } | null)?.full_name ?? null,
    created_at: m.created_at,
  }));

  const current = (timeline?.weeks ?? []).find((w) => w.isCurrent);

  return (
    <AppShell>
      <PageHeader
        title="Movimientos"
        description="Recepciones, traslados y despachos reales — el registro operativo que complementa el plan."
      />
      <div className="mt-6">
        <MovementsView
          movements={rows}
          areas={areas ?? []}
          defaultYear={current?.year ?? new Date().getFullYear()}
          defaultWeek={current?.week ?? 1}
        />
      </div>
    </AppShell>
  );
}
