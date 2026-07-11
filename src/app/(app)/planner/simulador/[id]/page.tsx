import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { AddScenarioLot } from "@/components/planner/add-scenario-lot";
import { LotsTable, type LotRow } from "@/components/planner/lots-table";
import { OccupancyTimeline } from "@/components/planner/occupancy-timeline";
import { getTimelineData, type TimelineData } from "@/lib/planner/occupancy-data";

export const metadata = { title: "Escenario" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

function alertWeeksByArea(data: TimelineData): Map<number, number> {
  const map = new Map<number, number>();
  for (const w of data.weeks) {
    for (const a of data.areas) {
      const t = w.occupied[String(a.id)] ?? 0;
      if (a.capacityTrays > 0 && t / a.capacityTrays >= data.maxUtilization) {
        map.set(a.id, (map.get(a.id) ?? 0) + 1);
      }
    }
  }
  return map;
}

export default async function ScenarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const scenarioId = Number((await params).id);
  if (!Number.isFinite(scenarioId)) notFound();

  const { data: scenario } = await supabase
    .from("planner_scenarios")
    .select("id, name, description")
    .eq("id", scenarioId)
    .maybeSingle();
  if (!scenario) notFound();

  const [base, sim, { data: lots }, { data: species }] = await Promise.all([
    getTimelineData(supabase),
    getTimelineData(supabase, { scenarioId }),
    supabase
      .from("planner_scenario_lots")
      .select(
        "id, lot_code, year, start_week, end_week, plants, trays, status, planner_species(name), planner_varieties(name), rooting:planner_areas!planner_scenario_lots_rooting_area_id_fkey(name)",
      )
      .eq("scenario_id", scenarioId)
      .order("start_week")
      .limit(2000),
    supabase.from("planner_species").select("id, name").eq("active", true).order("name"),
  ]);

  const lotRows: LotRow[] = (lots ?? []).map((l) => ({
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

  const baseAlerts = base ? alertWeeksByArea(base) : new Map<number, number>();
  const simAlerts = sim ? alertWeeksByArea(sim) : new Map<number, number>();
  const currentWeek = base?.weeks.find((w) => w.isCurrent);

  return (
    <AppShell>
      <PageHeader
        title={scenario.name}
        description={scenario.description ?? "Escenario what-if sobre el plan vigente."}
        badge="Simulación"
        actions={
          <Link
            href="/planner/simulador"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Escenarios
          </Link>
        }
      />

      {sim && base ? (
        <div className="mt-4 overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">
                  Semanas en alerta (≥{Math.round(sim.maxUtilization * 100)}%)
                </th>
                {sim.areas.map((a) => (
                  <th key={a.id} className="px-2 py-2 text-center font-medium">
                    {a.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="tabular-nums">
              <tr>
                <td className="px-3 py-1.5 text-muted-foreground">Plan base</td>
                {sim.areas.map((a) => (
                  <td key={a.id} className="px-2 py-1.5 text-center">
                    {baseAlerts.get(a.id) ?? 0}
                  </td>
                ))}
              </tr>
              <tr className="border-t">
                <td className="px-3 py-1.5 text-muted-foreground">Este escenario</td>
                {sim.areas.map((a) => {
                  const b = baseAlerts.get(a.id) ?? 0;
                  const s = simAlerts.get(a.id) ?? 0;
                  return (
                    <td
                      key={a.id}
                      className={
                        "px-2 py-1.5 text-center font-medium " +
                        (s > b
                          ? "text-red-600 dark:text-red-400"
                          : s < b
                            ? "text-emerald-700 dark:text-emerald-400"
                            : "")
                      }
                    >
                      {s}
                      {s !== b ? ` (${s > b ? "+" : ""}${s - b})` : ""}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Ocupación del escenario
        </h2>
        <AddScenarioLot
          scenarioId={scenarioId}
          species={species ?? []}
          defaultWeek={currentWeek?.week ?? 1}
          year={currentWeek?.year ?? new Date().getFullYear()}
        />
      </div>
      <div className="mt-2">
        {sim ? (
          <OccupancyTimeline data={sim} />
        ) : (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            El escenario no tiene lotes activos.
          </p>
        )}
      </div>

      <h2 className="mt-8 text-sm font-medium text-muted-foreground">
        Lotes del escenario
      </h2>
      <div className="mt-2">
        <LotsTable lots={lotRows} scenario />
      </div>
    </AppShell>
  );
}
