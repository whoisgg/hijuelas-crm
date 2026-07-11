import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  ScenariosList,
  type ScenarioRow,
} from "@/components/planner/scenarios-list";

export const metadata = { title: "Simulador" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

export default async function SimuladorPage() {
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

  const { data: scenarios } = await supabase
    .from("planner_scenarios")
    .select("id, name, description, status, created_at, app_users(full_name), planner_scenario_lots(count)")
    .order("created_at", { ascending: false });

  const rows: ScenarioRow[] = (scenarios ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    status: s.status,
    created_at: s.created_at,
    created_by_name:
      (s.app_users as unknown as { full_name: string | null } | null)?.full_name ?? null,
    lots_count:
      (s.planner_scenario_lots as unknown as { count: number }[] | null)?.[0]?.count ?? 0,
  }));

  return (
    <AppShell>
      <PageHeader
        title="Simulador"
        description="Escenarios sandbox: copia el plan, prueba cambios y compara el impacto en capacidad — sin tocar producción."
      />
      <div className="mt-6">
        <ScenariosList scenarios={rows} />
      </div>
    </AppShell>
  );
}
