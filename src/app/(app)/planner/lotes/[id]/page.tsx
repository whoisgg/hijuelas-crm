import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { LotWeeksTable } from "@/components/planner/lot-weeks-table";
import { getLotWeeks } from "@/lib/actions/planner-lot-weeks";
import { getProgramByPlannerVarietyId } from "@/lib/planner/variety-programs";
import { currentLotLocation } from "@/lib/planner/lot-location";

export const dynamic = "force-dynamic";

export default async function LotDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getAccessProfile(supabase);
  if (!hasModuleAccess(profile, "planner")) {
    redirect("/apps");
  }
  const canEdit = hasModuleAccess(profile, "planner", "admin");

  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: lot },
    { data: orderedIds },
    weeksRes,
    { data: currentWeekRow },
  ] = await Promise.all([
    supabase
      .from("planner_lots")
      .select(
        `id, lot_code, year, start_week, end_week, plants, trays, status, plant_code, plant_index, planner_species(name), planner_varieties(id, name),
        rooting_start_week, rooting_end_week, maturation_start_week, maturation_end_week, predispatch_start_week, predispatch_end_week,
        rooting:planner_areas!planner_lots_rooting_area_id_fkey(name), maturation:planner_areas!planner_lots_maturation_area_id_fkey(name), predispatch:planner_areas!planner_lots_predispatch_area_id_fkey(name)`,
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("planner_lots").select("id").order("start_week").order("lot_code").limit(5000),
    getLotWeeks(id),
    supabase
      .from("planner_calendar_weeks")
      .select("campaign_week")
      .lte("start_date", today)
      .gte("end_date", today)
      .maybeSingle(),
  ]);
  if (!lot) notFound();

  const ids = (orderedIds ?? []).map((r) => r.id);
  const idx = ids.indexOf(id);
  const prevId = idx > 0 ? ids[idx - 1] : null;
  const nextId = idx >= 0 && idx < ids.length - 1 ? ids[idx + 1] : null;

  const variety =
    (lot.planner_varieties as unknown as { id: number; name: string } | null) ?? null;
  const program = variety
    ? (await getProgramByPlannerVarietyId(supabase)).get(variety.id) ?? null
    : null;
  const areaName = (rel: unknown) => (rel as { name: string } | null)?.name ?? null;
  const currentWeek = currentWeekRow?.campaign_week ?? null;
  const location = currentLotLocation(
    {
      rooting: {
        name: areaName(lot.rooting),
        startWeek: lot.rooting_start_week,
        endWeek: lot.rooting_end_week,
      },
      maturation: {
        name: areaName(lot.maturation),
        startWeek: lot.maturation_start_week,
        endWeek: lot.maturation_end_week,
      },
      predispatch: {
        name: areaName(lot.predispatch),
        startWeek: lot.predispatch_start_week,
        endWeek: lot.predispatch_end_week,
      },
    },
    currentWeek,
  );

  return (
    <AppShell>
      <PageHeader
        title={lot.lot_code}
        badge={lot.status}
        description={`${(lot.planner_species as unknown as { name: string } | null)?.name ?? "—"}${variety ? ` · ${variety.name}` : ""}${program ? ` · ${program}` : ""}`}
        actions={
          <div className="flex items-center gap-1">
            <Link
              href="/planner/lotes"
              className="mr-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Lotes
            </Link>
            {prevId ? (
              <Link
                href={`/planner/lotes/${prevId}`}
                aria-label="Lote anterior"
                className="rounded p-1.5 hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </Link>
            ) : (
              <span className="w-7" />
            )}
            {nextId ? (
              <Link
                href={`/planner/lotes/${nextId}`}
                aria-label="Lote siguiente"
                className="rounded p-1.5 hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span className="w-7" />
            )}
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
        <div>
          <span className="text-muted-foreground">Semanas: </span>
          <span className="font-medium tabular-nums">
            S{lot.start_week}
            {lot.end_week !== null ? ` → S${lot.end_week}` : ""}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Plantas: </span>
          <span className="font-medium tabular-nums">{lot.plants.toLocaleString("es-CL")}</span>
        </div>
        <div>
          <span className="text-muted-foreground">Bandejas: </span>
          <span className="font-medium tabular-nums">
            {lot.trays?.toLocaleString("es-CL") ?? "—"}
          </span>
        </div>
        <div>
          <span className="text-muted-foreground">Ubicación vigente: </span>
          <span className="font-medium">{location ?? "—"}</span>
        </div>
        {lot.plant_code || lot.plant_index ? (
          <div>
            <span className="text-muted-foreground">Plantcode: </span>
            <span className="font-mono text-xs">{lot.plant_code ?? "—"}</span>
            {lot.plant_index ? (
              <Badge variant="outline" className="ml-1.5 text-[10px]">
                index {lot.plant_index}
              </Badge>
            ) : null}
          </div>
        ) : null}
      </div>

      <h2 className="mb-2 text-sm font-medium text-muted-foreground">Ubicación por semana</h2>
      {weeksRes.ok ? (
        <LotWeeksTable
          lotId={id}
          initialWeeks={weeksRes.weeks ?? []}
          areas={weeksRes.areas ?? []}
          canEdit={canEdit}
        />
      ) : (
        <p className="rounded-lg border bg-card px-3 py-6 text-center text-sm text-destructive">
          {weeksRes.error ?? "No se pudo cargar."}
        </p>
      )}
    </AppShell>
  );
}
