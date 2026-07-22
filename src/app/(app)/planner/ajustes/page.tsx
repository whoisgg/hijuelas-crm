import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  AjustesSectores,
  type AjustesSectorRow,
} from "@/components/planner/ajustes-sectores";
import {
  AjustesEspecies,
  type AjustesArea,
  type AjustesEspecieRow,
} from "@/components/planner/ajustes-especies";
import {
  AjustesParametros,
  type AjustesParametroRow,
} from "@/components/planner/ajustes-parametros";

export const metadata = { title: "Ajustes del Planner" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

const TABS = [
  { key: "sectores", label: "Sectores" },
  { key: "especies", label: "Especies" },
  { key: "calendario", label: "Calendario" },
  { key: "parametros", label: "Parámetros" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function AjustesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
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
  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "sectores") as TabKey;

  const [areasRes, modulesRes, locationsRes, speciesRes, calendarRes, paramsRes] =
    await Promise.all([
      supabase.from("planner_areas").select("*").order("priority"),
      supabase.from("planner_modules").select("id, area_id"),
      supabase.from("planner_locations").select("id, module_id, capacity_trays"),
      supabase.from("planner_species").select("*").order("priority"),
      supabase
        .from("planner_calendar_weeks")
        .select("year, week, campaign_week, start_date, end_date")
        .order("year")
        .order("week"),
      supabase.from("planner_parameters").select("key, value, comment").order("key"),
    ]);

  // Capacidad física por sector: mesones → módulos → área.
  const areaByModule = new Map((modulesRes.data ?? []).map((m) => [m.id, m.area_id]));
  const physByArea = new Map<number, { locations: number; trays: number }>();
  for (const loc of locationsRes.data ?? []) {
    const areaId = areaByModule.get(loc.module_id);
    if (areaId === undefined) continue;
    const agg = physByArea.get(areaId) ?? { locations: 0, trays: 0 };
    agg.locations += 1;
    agg.trays += loc.capacity_trays ?? 0;
    physByArea.set(areaId, agg);
  }

  const sectors: AjustesSectorRow[] = (areasRes.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    stage: a.stage,
    capacityTrays: a.capacity_trays,
    priority: a.priority,
    active: a.active,
    locations: physByArea.get(a.id)?.locations ?? 0,
    physicalTrays: physByArea.get(a.id)?.trays ?? 0,
  }));

  const areas: AjustesArea[] = (areasRes.data ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    stage: a.stage,
  }));

  const species: AjustesEspecieRow[] = (speciesRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    trayFormat: s.tray_format,
    rootingWeeks: s.rooting_weeks,
    maturationWeeks: s.maturation_weeks,
    predispatchWeeks: s.predispatch_weeks,
    rootingAreaId: s.rooting_area_id,
    maturationAreaId: s.maturation_area_id,
    predispatchAreaId: s.predispatch_area_id,
    priority: s.priority,
    active: s.active,
    masterLinked: s.master_species_id !== null,
  }));

  const parameters: AjustesParametroRow[] = paramsRes.data ?? [];

  // Calendario agrupado por año.
  const calendarByYear = new Map<
    number,
    { week: number; campaignWeek: number | null; start: string | null; end: string | null }[]
  >();
  for (const w of calendarRes.data ?? []) {
    const arr = calendarByYear.get(w.year) ?? [];
    arr.push({
      week: w.week,
      campaignWeek: w.campaign_week,
      start: w.start_date,
      end: w.end_date,
    });
    calendarByYear.set(w.year, arr);
  }
  const fmtDate = (d: string | null) =>
    d
      ? new Date(`${d}T00:00:00`).toLocaleDateString("es-CL", {
          day: "2-digit",
          month: "short",
        })
      : "—";

  const linkedSpecies = species.filter((s) => s.masterLinked).length;

  return (
    <AppShell>
      <PageHeader
        title="Ajustes"
        description="Maestros operacionales del Planner: sectores y capacidades, ficha de especie por etapa, calendario de campaña y parámetros. Los catálogos compartidos (especies, variedades y programas) se administran en Administración."
      />

      <div className="mt-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/planner/ajustes?tab=${t.key}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              tab === t.key
                ? "border-foreground bg-foreground font-medium text-background"
                : "text-muted-foreground hover:border-foreground/40 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {tab === "sectores" ? (
          <div className="space-y-2">
            <AjustesSectores sectors={sectors} />
            <p className="text-xs text-muted-foreground">
              La capacidad de planificación manda sobre el plan y las alertas; la
              física viene de los mesones del archivo de Hotelería.
            </p>
          </div>
        ) : null}

        {tab === "especies" ? (
          <div className="space-y-2">
            <AjustesEspecies species={species} areas={areas} />
            <p className="text-xs text-muted-foreground">
              {linkedSpecies} de {species.length} especies vinculadas a los maestros
              compartidos del CRM. La ficha define cómo el importador y el simulador
              derivan etapas y bandejas.
            </p>
          </div>
        ) : null}

        {tab === "calendario" ? (
          <div className="space-y-3">
            {[...calendarByYear.entries()].map(([year, weeks]) => (
              <details
                key={year}
                className="group/anio overflow-hidden rounded-lg border bg-card"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 transition-colors hover:bg-muted/40">
                  <span className="font-semibold">{year}</span>
                  <span className="text-xs text-muted-foreground">
                    {weeks.length} semanas · S{weeks[0]?.week} → S
                    {weeks[weeks.length - 1]?.week}
                  </span>
                </summary>
                <div className="overflow-x-auto border-t">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Semana</th>
                        <th className="px-3 py-2 text-right font-medium">Campaña</th>
                        <th className="px-3 py-2 text-left font-medium">Desde</th>
                        <th className="px-3 py-2 text-left font-medium">Hasta</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {weeks.map((w) => (
                        <tr key={w.week} className="hover:bg-muted/30">
                          <td className="px-3 py-1.5 tabular-nums">S{w.week}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                            {w.campaignWeek ?? "—"}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {fmtDate(w.start)}
                          </td>
                          <td className="px-3 py-1.5 text-muted-foreground">
                            {fmtDate(w.end)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            ))}
            <p className="text-xs text-muted-foreground">
              El calendario viene del Vivero Planner y se actualiza al subir un
              archivo nuevo en Carga.
            </p>
          </div>
        ) : null}

        {tab === "parametros" ? <AjustesParametros parameters={parameters} /> : null}
      </div>
    </AppShell>
  );
}
