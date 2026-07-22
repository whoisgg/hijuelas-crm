import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { type ScenarioRow } from "@/components/planner/scenarios-list";
import { ScenariosSection } from "@/components/planner/scenarios-section";

export const metadata = { title: "Simulador" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

/**
 * Simulador: tablero de simulaciones (grupos de órdenes what-if que se suman
 * al plan vigente). El estado controla la carga a Ocupación — borrador no se
 * suma; desde "En evaluación" hacia adelante, sí.
 */
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
    .select(
      "id, name, description, status, created_at, app_users(full_name), planner_scenario_lots(trays)",
    )
    .eq("is_simulation", true)
    .order("created_at", { ascending: false });

  const rows: ScenarioRow[] = (scenarios ?? []).map((s) => {
    const lots = (s.planner_scenario_lots as unknown as { trays: number | null }[] | null) ?? [];
    return {
      id: s.id,
      name: s.name,
      description: s.description,
      status: s.status,
      created_at: s.created_at,
      created_by_name:
        (s.app_users as unknown as { full_name: string | null } | null)?.full_name ?? null,
      lots_count: lots.length,
      trays_count: lots.reduce((sum, l) => sum + (l.trays ?? 0), 0),
    };
  });

  return (
    <AppShell>
      <PageHeader
        title="Simulador"
        description="Simulaciones: grupos de órdenes what-if que se suman al plan vigente. Borrador no se carga; desde «En evaluación» se suman a Ocupación con el checkbox «Incluir simulación»."
        actions={
          <Link
            href="/planner/ocupacion?sim=1"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Ver en Ocupación
          </Link>
        }
      />
      <div className="mt-6">
        <ScenariosSection scenarios={rows} />
      </div>
    </AppShell>
  );
}
