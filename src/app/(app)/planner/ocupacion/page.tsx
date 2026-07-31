import Link from "next/link";
import { redirect } from "next/navigation";
import { Map as MapIcon, TableProperties } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { OccupancyTimeline } from "@/components/planner/occupancy-timeline";
import { SiteMap } from "@/components/planner/site-map";
import { SimulationToggle } from "@/components/planner/simulation-toggle";
import { WorkingChangesBanner } from "@/components/planner/working-changes-banner";
import { getTimelineData } from "@/lib/planner/occupancy-data";
import { getSimulations, loadedSimulationIds } from "@/lib/planner/simulation";
import { ensureWorkingScenario } from "@/lib/planner/working-scenario";
import { getWorkspaceDiff } from "@/lib/planner/workspace-diff";
import { buildSiteMapData, getAreaGeometry } from "@/lib/planner/site-map-data";

export const metadata = { title: "Ocupación" };
export const dynamic = "force-dynamic";

export default async function OcupacionPage({
  searchParams,
}: {
  searchParams: Promise<{ sim?: string; off?: string; base?: string; vista?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getAccessProfile(supabase);
  if (!hasModuleAccess(profile, "planner")) {
    redirect("/apps");
  }

  const sp = await searchParams;
  const simOn = sp.sim === "1";
  const vista = sp.vista === "mapa" ? "mapa" : "timeline";

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

  const geometryById = vista === "mapa" ? await getAreaGeometry(supabase) : null;
  const siteMap = data && geometryById ? buildSiteMapData(data, geometryById) : null;

  const simActive = simOn && loadedIds.length > 0;
  const simQuery = simActive
    ? `sim=1${offIds.length ? `&off=${offIds.join(",")}` : ""}`
    : null;

  const baseLabel = viewPlan
    ? "el plan vigente"
    : diff.count > 0
      ? "tu mesa de trabajo (plan + movimientos sin aprobar)"
      : "tu mesa de trabajo (igual al plan vigente)";

  // Tabs Timeline/Mapa preservan sim/off/base — solo agregan/quitan ?vista=mapa.
  const preserved = new URLSearchParams();
  if (sp.sim) preserved.set("sim", sp.sim);
  if (sp.off) preserved.set("off", sp.off);
  if (sp.base) preserved.set("base", sp.base);
  const hrefFor = (v: "timeline" | "mapa") => {
    const params = new URLSearchParams(preserved);
    if (v === "mapa") params.set("vista", "mapa");
    const qs = params.toString();
    return qs ? `/planner/ocupacion?${qs}` : "/planner/ocupacion";
  };
  const tabClass = (active: boolean) =>
    cn(
      "flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors",
      active
        ? "bg-foreground font-medium text-background"
        : "text-muted-foreground hover:text-foreground",
    );

  return (
    <AppShell>
      <PageHeader
        title="Ocupación"
        description={
          vista === "mapa"
            ? `Vista georreferenciada del sitio según ${baseLabel}.${siteMap?.weekLabel ? ` Semana vigente: ${siteMap.weekLabel}.` : ""} Clic en un sector abre su layout.`
            : simActive
              ? `${viewPlan ? "Plan vigente" : "Mesa de trabajo"} + ${loadedIds.length} ${loadedIds.length === 1 ? "simulación" : "simulaciones"} (${loadedTrays.toLocaleString("es-CL")} bandejas). Clic en una celda abre el sector con la simulación incluida.`
              : `Bandejas ocupadas por área y semana según ${baseLabel}. Clic en una celda abre el layout del sector.`
        }
        badge={simActive ? "Simulación" : undefined}
        actions={
          <>
            <div className="flex items-center gap-0.5 rounded-full border bg-muted/40 p-0.5 text-xs">
              <Link href={hrefFor("timeline")} className={tabClass(vista === "timeline")}>
                <TableProperties className="h-3.5 w-3.5" /> Timeline
              </Link>
              <Link href={hrefFor("mapa")} className={tabClass(vista === "mapa")}>
                <MapIcon className="h-3.5 w-3.5" /> Mapa
              </Link>
            </div>
            <SimulationToggle checked={simOn} simulations={simulations} />
          </>
        }
      />
      <div className="mt-4 space-y-4">
        <WorkingChangesBanner
          count={diff.count}
          changes={diff.changes}
          viewingPlan={viewPlan}
          query={simQuery}
        />
        {!data ? (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            No hay lotes cargados aún.{" "}
            <Link href="/planner/carga" className="text-primary underline-offset-2 hover:underline">
              Sube el Vivero Planner
            </Link>{" "}
            para ver la ocupación.
          </p>
        ) : vista === "mapa" ? (
          siteMap && siteMap.areas.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
              <SiteMap areas={siteMap.areas} alertAt={siteMap.alertAt} />
              {siteMap.undelimited.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Sin delimitar en el KMZ
                  </p>
                  {siteMap.undelimited.map((a) => (
                    <Link
                      key={a.id}
                      href={`/planner/sector/${a.id}`}
                      className="block rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted/40"
                    >
                      <div className="font-medium">{a.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round(a.pct)}% · {a.occupiedTrays.toLocaleString("es-CL")}/
                        {a.capacityTrays.toLocaleString("es-CL")} band.
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="rounded-lg border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
              Sin geometría cargada todavía.
            </p>
          )
        ) : (
          <OccupancyTimeline data={data} simQuery={simQuery} />
        )}
      </div>
    </AppShell>
  );
}
