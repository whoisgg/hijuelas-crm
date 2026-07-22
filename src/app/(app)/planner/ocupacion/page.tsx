import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { OccupancyTimeline } from "@/components/planner/occupancy-timeline";
import { SimulationToggle } from "@/components/planner/simulation-toggle";
import { WorkingChangesBanner } from "@/components/planner/working-changes-banner";
import { getTimelineData } from "@/lib/planner/occupancy-data";
import { getSimulations, loadedSimulationIds } from "@/lib/planner/simulation";
import { ensureWorkingScenario } from "@/lib/planner/working-scenario";
import { getWorkspaceDiff } from "@/lib/planner/workspace-diff";

export const metadata = { title: "Ocupación" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

export default async function OcupacionPage({
  searchParams,
}: {
  searchParams: Promise<{ sim?: string; off?: string; base?: string }>;
}) {
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

  const sp = await searchParams;
  const simOn = sp.sim === "1";

  // La timeline muestra por defecto la MESA DE TRABAJO del usuario (el plan
  // más sus movimientos sin aprobar); ?base=plan vuelve al plan vigente puro.
  const working = await ensureWorkingScenario(supabase, user.id);
  const viewPlan = sp.base === "plan" || !working;

  const [simulations, diff] = await Promise.all([
    getSimulations(supabase),
    working
      ? getWorkspaceDiff(supabase, working.id)
      : Promise.resolve({ count: 0, changes: [] }),
  ]);
  const loadedIds = simOn ? loadedSimulationIds(simulations, sp.off) : [];
  const offIds = simulations
    .filter((s) => s.loadable && !loadedIds.includes(s.id))
    .map((s) => s.id);
  const loadedTrays = simulations
    .filter((s) => loadedIds.includes(s.id))
    .reduce((sum, s) => sum + s.trays, 0);

  const data = await getTimelineData(supabase, {
    ...(viewPlan ? {} : { scenarioId: working!.id }),
    ...(loadedIds.length ? { addScenarioIds: loadedIds } : {}),
  });

  const simActive = simOn && loadedIds.length > 0;
  const simQuery = simActive
    ? `sim=1${offIds.length ? `&off=${offIds.join(",")}` : ""}`
    : null;

  const baseLabel = viewPlan
    ? "el plan vigente"
    : diff.count > 0
      ? "tu mesa de trabajo (plan + movimientos sin aprobar)"
      : "tu mesa de trabajo (igual al plan vigente)";

  return (
    <AppShell>
      <PageHeader
        title="Ocupación"
        description={
          simActive
            ? `${viewPlan ? "Plan vigente" : "Mesa de trabajo"} + ${loadedIds.length} ${loadedIds.length === 1 ? "simulación" : "simulaciones"} (${loadedTrays.toLocaleString("es-CL")} bandejas). Clic en una celda abre el sector con la simulación incluida.`
            : `Bandejas ocupadas por área y semana según ${baseLabel}. Clic en una celda abre el layout del sector.`
        }
        badge={simActive ? "Simulación" : undefined}
        actions={<SimulationToggle checked={simOn} simulations={simulations} />}
      />
      <div className="mt-4 space-y-4">
        <WorkingChangesBanner
          count={diff.count}
          changes={diff.changes}
          viewingPlan={viewPlan}
          query={simQuery}
        />
        {data ? (
          <OccupancyTimeline data={data} simQuery={simQuery} />
        ) : (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            No hay lotes cargados aún.{" "}
            <Link href="/planner/carga" className="text-primary underline-offset-2 hover:underline">
              Sube el Vivero Planner
            </Link>{" "}
            para ver la ocupación.
          </p>
        )}
      </div>
    </AppShell>
  );
}
