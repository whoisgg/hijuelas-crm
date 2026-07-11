import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { SectorLayout } from "@/components/planner/sector-layout";
import { getSectorLayout, getSectorPlanFill } from "@/lib/planner/layout-data";
import { getTimelineData } from "@/lib/planner/occupancy-data";
import { cn } from "@/lib/utils";

export const metadata = { title: "Layout por sector" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

export default async function SectorPage({
  params,
  searchParams,
}: {
  params: Promise<{ areaId: string }>;
  searchParams: Promise<{ week?: string; vista?: string }>;
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

  const areaId = Number((await params).areaId);
  if (!Number.isFinite(areaId)) notFound();

  const [layout, timeline] = await Promise.all([
    getSectorLayout(supabase, areaId),
    getTimelineData(supabase),
  ]);
  if (!layout) notFound();

  const sp = await searchParams;
  const weekParam = Number(sp.week);
  const vista: "plan" | "real" = sp.vista === "real" ? "real" : "plan";
  const weeks = timeline?.weeks ?? [];
  const week =
    weeks.find((w) => w.campaignWeek === weekParam) ??
    weeks.find((w) => w.isCurrent) ??
    weeks[0] ??
    null;

  // Proyección anclada en la foto real: parte del snapshot y rellena los
  // vacíos con los lotes que llegan (FIFO), sin reordenar lo existente.
  const currentWeek =
    weeks.find((w) => w.isCurrent)?.campaignWeek ?? week?.campaignWeek ?? 1;
  const planFill = week
    ? await getSectorPlanFill(supabase, areaId, week.campaignWeek, currentWeek, layout)
    : null;

  const planTrays = week?.occupied[String(areaId)] ?? 0;
  const planPct = layout.area.capacityTrays
    ? (planTrays / layout.area.capacityTrays) * 100
    : 0;
  const realPct = layout.totals.capacity
    ? (layout.totals.trays / layout.totals.capacity) * 100
    : 0;
  const alertAt = timeline?.maxUtilization ?? 0.95;

  const idx = week ? weeks.findIndex((w) => w.campaignWeek === week.campaignWeek) : -1;
  const prev = idx > 0 ? weeks[idx - 1] : null;
  const next = idx >= 0 && idx < weeks.length - 1 ? weeks[idx + 1] : null;

  const snapshotDate = layout.snapshotDate
    ? new Date(layout.snapshotDate).toLocaleDateString("es-CL", {
        day: "2-digit",
        month: "short",
      })
    : null;

  return (
    <AppShell>
      <PageHeader
        title={layout.area.name}
        description={
          vista === "plan"
            ? "Proyección anclada en la foto real: lo puesto no se mueve (y se libera cuando su especie termina la etapa); los lotes que llegan rellenan los vacíos en orden FIFO. Lo que no cabe aparece como sobrecupo."
            : `Hoy: la foto real del snapshot${snapshotDate ? ` del ${snapshotDate}` : ""} por mesón — no cambia con la semana seleccionada.`
        }
        actions={
          <Link
            href="/planner/ocupacion"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Ocupación
          </Link>
        }
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
        {week ? (
          <div className="flex items-center gap-2">
            {prev ? (
              <Link
                href={`/planner/sector/${areaId}?week=${prev.campaignWeek}&vista=${vista}`}
                aria-label="Semana anterior"
                className="rounded p-1 hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span className="w-6" />
            )}
            <span className="font-medium tabular-nums">
              S{week.week} · {week.year}
            </span>
            {next ? (
              <Link
                href={`/planner/sector/${areaId}?week=${next.campaignWeek}&vista=${vista}`}
                aria-label="Semana siguiente"
                className="rounded p-1 hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="w-6" />
            )}
          </div>
        ) : null}
        <div>
          <span className="text-muted-foreground">Plan semana: </span>
          <span className="font-medium tabular-nums">
            {planTrays.toLocaleString("es-CL")} bandejas ({Math.round(planPct)}%)
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">
            Real (snapshot{snapshotDate ? ` ${snapshotDate}` : ""}):{" "}
          </span>
          <span className="font-medium tabular-nums">
            {layout.totals.trays.toLocaleString("es-CL")} bandejas ({Math.round(realPct)}%)
          </span>
        </div>
        <div title="Capacidad de planificación del área (Vivero Planner), repartida proporcionalmente entre los mesones.">
          <span className="text-muted-foreground">Capacidad: </span>
          <span className="font-medium tabular-nums">
            {layout.area.capacityTrays.toLocaleString("es-CL")} bandejas
          </span>
        </div>
        <div className="ml-auto flex rounded-md border p-0.5 text-xs">
          {(
            [
              ["plan", "Proyección"],
              ["real", "Hoy"],
            ] as const
          ).map(([key, label]) => (
            <Link
              key={key}
              href={`/planner/sector/${areaId}?week=${week?.campaignWeek ?? ""}&vista=${key}`}
              className={cn(
                "rounded px-2.5 py-1 transition-colors",
                vista === key
                  ? "bg-foreground font-medium text-background"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-6">
        {layout.modules.length ? (
          <SectorLayout
            data={layout}
            alertAt={alertAt}
            variant={vista}
            fill={
              vista === "plan" && planFill
                ? Object.fromEntries(planFill.byLocation)
                : undefined
            }
            overflow={
              vista === "plan" && planFill
                ? { trays: planFill.overflowTrays, items: planFill.overflow }
                : undefined
            }
          />
        ) : (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            Este sector no tiene ubicaciones cargadas. Sube el archivo de
            Hotelería en{" "}
            <Link href="/planner/carga" className="text-primary underline-offset-2 hover:underline">
              Carga
            </Link>
            .
          </p>
        )}
      </div>
    </AppShell>
  );
}
