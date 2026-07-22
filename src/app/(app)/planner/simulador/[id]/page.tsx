import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { AddScenarioLot } from "@/components/planner/add-scenario-lot";
import { LotsTable, type LotRow } from "@/components/planner/lots-table";
import { getTimelineData } from "@/lib/planner/occupancy-data";
import { getProgramByPlannerVarietyId } from "@/lib/planner/variety-programs";

export const metadata = { title: "Simulación" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

const STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador",
  evaluacion: "En evaluación",
  aprobado: "Confirmada",
  descartado: "Descartada",
};
const LOADS = new Set(["evaluacion", "aprobado"]);

/**
 * Detalle de una simulación: sus órdenes what-if. El estado se maneja en el
 * kanban del Simulador; aquí sólo se administra la demanda del grupo.
 */
export default async function SimulacionPage({
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
    .select("id, name, description, status, is_simulation")
    .eq("id", scenarioId)
    .maybeSingle();
  if (!scenario) notFound();

  const [{ data: lots }, { data: species }, timeline] = await Promise.all([
    supabase
      .from("planner_scenario_lots")
      .select(
        "id, lot_code, year, start_week, end_week, plants, trays, status, planner_species(name), planner_varieties(id, name), rooting:planner_areas!planner_scenario_lots_rooting_area_id_fkey(name)",
      )
      .eq("scenario_id", scenarioId)
      .order("start_week")
      .limit(2000),
    supabase.from("planner_species").select("id, name").eq("active", true).order("name"),
    getTimelineData(supabase),
  ]);
  const programByVarietyId = await getProgramByPlannerVarietyId(supabase);

  const lotRows: LotRow[] = (lots ?? []).map((l) => {
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

  const currentWeek = timeline?.weeks.find((w) => w.isCurrent);
  const loads = LOADS.has(scenario.status);

  return (
    <AppShell>
      <PageHeader
        title={scenario.name}
        badge={STATUS_LABEL[scenario.status] ?? scenario.status}
        description={
          scenario.description ??
          (loads
            ? "Esta simulación se suma a Ocupación cuando el checkbox «Incluir simulación» está activo."
            : "Borrador: sus órdenes no se suman a Ocupación hasta que la muevas a «En evaluación» en el tablero.")
        }
        actions={
          <div className="flex items-center gap-4">
            <Link
              href="/planner/ocupacion?sim=1"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Ver en Ocupación
            </Link>
            <Link
              href="/planner/simulador"
              className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Simulador
            </Link>
          </div>
        }
      />

      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Órdenes{lotRows.length ? ` (${lotRows.length})` : ""}
        </h2>
        <AddScenarioLot
          scenarioId={scenario.id}
          species={species ?? []}
          defaultWeek={currentWeek?.week ?? 1}
          year={currentWeek?.year ?? new Date().getFullYear()}
        />
      </div>
      <div className="mt-2">
        {lotRows.length ? (
          <LotsTable lots={lotRows} scenario />
        ) : (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Sin órdenes aún. Agrega demanda what-if — las etapas y sectores se
            derivan de la ficha de la especie.
          </p>
        )}
      </div>
    </AppShell>
  );
}
