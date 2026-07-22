import { redirect } from "next/navigation";
import { CalendarRange, SlidersHorizontal, Sprout, Warehouse } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  SettingsBack,
  SettingsRow,
  SettingsSection,
} from "@/components/design-system/settings-menu";
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

export const metadata = { title: "Datos maestros del Planner" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

const SECTIONS = ["sectores", "especies", "calendario", "parametros"] as const;
type SectionKey = (typeof SECTIONS)[number];

const SECTION_META: Record<SectionKey, { title: string; description: string }> = {
  sectores: {
    title: "Sectores",
    description:
      "Capacidad de planificación por sector (la física viene de los mesones de Hotelería).",
  },
  especies: {
    title: "Especies",
    description:
      "Ficha operacional por etapa: formato de bandeja, semanas y sector. Define cómo el importador y el simulador derivan etapas.",
  },
  calendario: {
    title: "Calendario",
    description:
      "Semanas de campaña ↔ fechas reales. Viene del Vivero Planner y se actualiza al subir un archivo nuevo en Carga.",
  },
  parametros: {
    title: "Parámetros",
    description: "Parámetros globales del modelo de ocupación.",
  },
};

export default async function PlannerMaestrosPage({
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
  const section: SectionKey | null =
    (SECTIONS.find((s) => s === sp.tab) as SectionKey | undefined) ?? null;

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
  const linkedSpecies = species.filter((s) => s.masterLinked).length;

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

  // ── Índice (menú de selección, mismo patrón de Kisei) ──
  if (!section) {
    const weeksTotal = [...calendarByYear.values()].reduce((s, w) => s + w.length, 0);
    return (
      <AppShell>
        <PageHeader
          title="Datos maestros"
          description="Maestros operacionales del Planner. Los catálogos compartidos (especies, variedades y programas) se administran en Administración → Datos maestros."
        />
        <div className="mx-auto mt-6 w-full max-w-2xl">
          <SettingsSection title="Operación">
            <SettingsRow
              href="/planner/maestros?tab=sectores"
              icon={Warehouse}
              iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
              label="Sectores"
              sub="Capacidad de planificación, prioridad y estado por sector"
              right={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {sectors.length}
                </span>
              }
            />
            <SettingsRow
              href="/planner/maestros?tab=especies"
              icon={Sprout}
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              label="Especies"
              sub={`Ficha operacional por etapa · ${linkedSpecies}/${species.length} vinculadas al maestro`}
              right={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {species.length}
                </span>
              }
            />
          </SettingsSection>

          <SettingsSection title="Modelo">
            <SettingsRow
              href="/planner/maestros?tab=calendario"
              icon={CalendarRange}
              iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              label="Calendario"
              sub="Semanas de campaña ↔ fechas reales (del Vivero Planner)"
              right={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {weeksTotal} sem
                </span>
              }
            />
            <SettingsRow
              href="/planner/maestros?tab=parametros"
              icon={SlidersHorizontal}
              iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
              label="Parámetros"
              sub="Utilización máxima, semanas del modelo y flags"
              right={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {parameters.length}
                </span>
              }
            />
          </SettingsSection>
        </div>
      </AppShell>
    );
  }

  // ── Subsección con volver ──
  return (
    <AppShell>
      <PageHeader
        title={SECTION_META[section].title}
        description={SECTION_META[section].description}
        actions={<SettingsBack href="/planner/maestros" label="Datos maestros" />}
      />
      <div className="mt-4">
        {section === "sectores" ? <AjustesSectores sectors={sectors} /> : null}

        {section === "especies" ? (
          <AjustesEspecies species={species} areas={areas} />
        ) : null}

        {section === "calendario" ? (
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
          </div>
        ) : null}

        {section === "parametros" ? <AjustesParametros parameters={parameters} /> : null}
      </div>
    </AppShell>
  );
}
