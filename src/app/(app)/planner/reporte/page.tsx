import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/planner/print-button";
import { getTimelineData } from "@/lib/planner/occupancy-data";
import { getPlanVsReal } from "@/lib/planner/plan-vs-real";

export const metadata = { title: "Week report" };
export const dynamic = "force-dynamic";

export default async function ReportePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getAccessProfile(supabase);
  if (!hasModuleAccess(profile, "planner")) {
    redirect("/apps");
  }

  const timeline = await getTimelineData(supabase);
  if (!timeline) {
    redirect("/planner/carga");
  }

  const current = timeline.weeks.find((w) => w.isCurrent) ?? timeline.weeks[0];
  const currentIdx = timeline.weeks.indexOf(current);
  const horizon = timeline.weeks.slice(currentIdx, currentIdx + 8);

  const [planVsReal, movements, dispatches] = await Promise.all([
    getPlanVsReal(supabase, timeline),
    supabase
      .from("planner_movements")
      .select(
        "id, type, week, trays, plants, notes, planner_lots(lot_code), to:planner_areas!planner_movements_area_to_id_fkey(name)",
      )
      .eq("year", current.year)
      .gte("week", Math.max(1, current.week - 1))
      .lte("week", current.week)
      .order("week"),
    supabase
      .from("planner_lots")
      .select("lot_code, plants, trays, predispatch_end_week, planner_species(name), planner_varieties(name)")
      .eq("status", "ACTIVO")
      .gte("predispatch_end_week", current.campaignWeek)
      .lte("predispatch_end_week", current.campaignWeek + 3)
      .order("predispatch_end_week")
      .limit(40),
  ]);

  type Rel = { name: string } | null;
  const rel = (v: unknown) => (v as Rel)?.name ?? "—";

  const alertCells = horizon.flatMap((w) =>
    timeline.areas
      .filter((a) => {
        const t = w.occupied[String(a.id)] ?? 0;
        return a.capacityTrays > 0 && t / a.capacityTrays >= timeline.maxUtilization;
      })
      .map((a) => ({
        week: w.week,
        year: w.year,
        area: a.name,
        pct: Math.round(((w.occupied[String(a.id)] ?? 0) / a.capacityTrays) * 100),
      })),
  );

  const generatedAt = new Date().toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <AppShell>
      <div className="print:pt-0">
        <PageHeader
          title={`Week report — S${current.week} · ${current.year}`}
          description={`Estado semanal de producción · generado el ${generatedAt}`}
          actions={<PrintButton />}
        />

        {/* Ocupación de la semana */}
        <h2 className="mt-6 text-sm font-medium">Ocupación de la semana</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border bg-card print:border-0">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Área</th>
                <th className="px-2 py-2 text-right font-medium">Capacidad</th>
                <th className="px-2 py-2 text-right font-medium">Plan</th>
                <th className="px-2 py-2 text-right font-medium">%</th>
                {planVsReal ? (
                  <>
                    <th className="px-2 py-2 text-right font-medium">Real</th>
                    <th className="px-2 py-2 text-right font-medium">Desvío</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {timeline.areas.map((a) => {
                const plan = current.occupied[String(a.id)] ?? 0;
                const pct = a.capacityTrays ? (plan / a.capacityTrays) * 100 : 0;
                const pvr = planVsReal?.rows.find((r) => r.areaId === a.id);
                return (
                  <tr key={a.id}>
                    <td className="px-3 py-1.5">{a.name}</td>
                    <td className="px-2 py-1.5 text-right">
                      {a.capacityTrays.toLocaleString("es-CL")}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {plan.toLocaleString("es-CL")}
                    </td>
                    <td
                      className={
                        "px-2 py-1.5 text-right font-medium" +
                        (pct >= timeline.maxUtilization * 100
                          ? " text-red-600 dark:text-red-400"
                          : "")
                      }
                    >
                      {Math.round(pct)}%
                    </td>
                    {planVsReal ? (
                      <>
                        <td className="px-2 py-1.5 text-right">
                          {pvr ? pvr.realTrays.toLocaleString("es-CL") : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {pvr
                            ? `${pvr.deltaTrays > 0 ? "+" : ""}${pvr.deltaTrays.toLocaleString("es-CL")}`
                            : "—"}
                        </td>
                      </>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Alertas próximas 8 semanas */}
        <h2 className="mt-6 text-sm font-medium">
          Alertas de capacidad — próximas 8 semanas
        </h2>
        {alertCells.length ? (
          <div className="mt-2 flex flex-wrap gap-2">
            {alertCells.map((c, i) => (
              <span
                key={i}
                className="rounded-md bg-red-50 px-2 py-1 text-xs font-medium text-red-700 dark:bg-red-950/40 dark:text-red-300"
              >
                S{c.week} · {c.area} · {c.pct}%
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">
            Sin semanas en alerta en el horizonte.
          </p>
        )}

        {/* Despachos programados */}
        <h2 className="mt-6 text-sm font-medium">
          Despachos programados (próximas 4 semanas)
        </h2>
        <div className="mt-2 overflow-x-auto rounded-lg border bg-card print:border-0">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Lote</th>
                <th className="px-2 py-2 text-left font-medium">Especie</th>
                <th className="px-2 py-2 text-left font-medium">Variedad</th>
                <th className="px-2 py-2 text-right font-medium">Plantas</th>
                <th className="px-2 py-2 text-right font-medium">Fin predespacho</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(dispatches.data ?? []).map((l, i) => (
                <tr key={i}>
                  <td className="px-3 py-1.5 font-mono">{l.lot_code}</td>
                  <td className="px-2 py-1.5">{rel(l.planner_species)}</td>
                  <td className="px-2 py-1.5">{rel(l.planner_varieties)}</td>
                  <td className="px-2 py-1.5 text-right">
                    {l.plants.toLocaleString("es-CL")}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    S{l.predispatch_end_week}
                  </td>
                </tr>
              ))}
              {(dispatches.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                    Sin despachos en el horizonte.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {/* Movimientos de la semana */}
        <h2 className="mt-6 text-sm font-medium">Movimientos registrados (S{Math.max(1, current.week - 1)}–S{current.week})</h2>
        <div className="mt-2 overflow-x-auto rounded-lg border bg-card print:border-0">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-2 py-2 text-left font-medium">Lote</th>
                <th className="px-2 py-2 text-left font-medium">Hacia</th>
                <th className="px-2 py-2 text-right font-medium">Semana</th>
                <th className="px-2 py-2 text-right font-medium">Bandejas</th>
                <th className="px-2 py-2 text-left font-medium">Notas</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(movements.data ?? []).map((m) => (
                <tr key={m.id}>
                  <td className="px-3 py-1.5 capitalize">{m.type}</td>
                  <td className="px-2 py-1.5 font-mono">
                    {(m.planner_lots as unknown as { lot_code: string } | null)?.lot_code ?? "—"}
                  </td>
                  <td className="px-2 py-1.5">{rel(m.to)}</td>
                  <td className="px-2 py-1.5 text-right">S{m.week}</td>
                  <td className="px-2 py-1.5 text-right">
                    {m.trays.toLocaleString("es-CL")}
                  </td>
                  <td className="px-2 py-1.5">{m.notes ?? ""}</td>
                </tr>
              ))}
              {(movements.data ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">
                    Sin movimientos registrados esta semana.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}
