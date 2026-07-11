import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { OccupancyTimeline } from "@/components/planner/occupancy-timeline";
import { ProjectionPicker } from "@/components/planner/projection-picker";
import { getTimelineData } from "@/lib/planner/occupancy-data";

export const metadata = { title: "Ocupación" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

export default async function OcupacionPage({
  searchParams,
}: {
  searchParams: Promise<{ proyeccion?: string }>;
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

  const proyeccionRaw = Number((await searchParams).proyeccion);
  const scenarioId = Number.isFinite(proyeccionRaw) && proyeccionRaw > 0
    ? proyeccionRaw
    : undefined;

  const [data, { data: scenarios }] = await Promise.all([
    getTimelineData(supabase, scenarioId ? { scenarioId } : {}),
    supabase
      .from("planner_scenarios")
      .select("id, name, status")
      .neq("status", "descartado")
      .order("created_at", { ascending: false }),
  ]);

  const active = scenarioId
    ? (scenarios ?? []).find((s) => s.id === scenarioId) ?? null
    : null;

  return (
    <AppShell>
      <PageHeader
        title="Ocupación"
        description={
          active
            ? `Proyección con el escenario "${active.name}" en lugar del plan vigente.`
            : "Bandejas ocupadas por área y semana según los lotes planificados. Clic en una celda abre el layout del sector."
        }
        badge={active ? "Proyección" : undefined}
        actions={
          <ProjectionPicker
            scenarios={scenarios ?? []}
            selectedId={scenarioId ?? null}
          />
        }
      />
      <div className="mt-4">
        {data ? (
          <OccupancyTimeline data={data} />
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
