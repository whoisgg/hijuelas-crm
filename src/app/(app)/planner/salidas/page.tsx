import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, FileText, Truck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { getSalidasData, type SalidaEvent } from "@/lib/planner/salidas-data";

export const metadata = { title: "Salidas del Planner" };
export const dynamic = "force-dynamic";

const FILTERS = [
  { key: "todas", label: "Todas" },
  { key: "despachos", label: "Despachos" },
  { key: "etapas", label: "Cambios de sección" },
] as const;
type FilterKey = (typeof FILTERS)[number]["key"];

export default async function SalidasPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; historial?: string }>;
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
  const filter: FilterKey =
    (FILTERS.find((f) => f.key === sp.tipo)?.key as FilterKey | undefined) ?? "todas";
  const historial = sp.historial === "1";

  const data = await getSalidasData(supabase);

  const keepKind = (e: SalidaEvent) =>
    filter === "todas" ||
    (filter === "despachos" && e.kind === "despacho") ||
    (filter === "etapas" && e.kind === "etapa");

  const weeks = (data?.weeks ?? [])
    .filter(
      (w) =>
        historial ||
        data?.currentCampaignWeek === null ||
        w.campaignWeek >= (data?.currentCampaignWeek ?? 0),
    )
    .map((w) => ({ ...w, events: w.events.filter(keepKind) }))
    .filter((w) => w.events.length > 0);

  const qs = (patch: { tipo?: string; historial?: string }) => {
    const params = new URLSearchParams();
    const tipo = patch.tipo ?? (filter !== "todas" ? filter : "");
    const hist = patch.historial ?? (historial ? "1" : "");
    if (tipo && tipo !== "todas") params.set("tipo", tipo);
    if (hist === "1") params.set("historial", "1");
    const s = params.toString();
    return `/planner/salidas${s ? `?${s}` : ""}`;
  };

  return (
    <AppShell>
      <PageHeader
        title="Salidas"
        description="Salidas programadas según el plan vigente: cambios de sección entre etapas de crecimiento y despachos finales, con su contrato/cliente del CRM cuando la variedad permite cruzarlos."
      />

      {data ? (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border bg-card px-4 py-3 text-sm">
            <div>
              <span className="text-muted-foreground">Despachos: </span>
              <span className="font-medium tabular-nums">
                {data.totals.despachos.toLocaleString("es-CL")} (
                {data.totals.despachoTrays.toLocaleString("es-CL")} band.)
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Con contrato asociado: </span>
              <span className="font-medium tabular-nums">
                {data.totals.despachosConContrato.toLocaleString("es-CL")} /{" "}
                {data.totals.despachos.toLocaleString("es-CL")}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Cambios de sección: </span>
              <span className="font-medium tabular-nums">
                {data.totals.cambiosEtapa.toLocaleString("es-CL")}
              </span>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <Link
                key={f.key}
                href={qs({ tipo: f.key })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  filter === f.key
                    ? "border-foreground bg-foreground font-medium text-background"
                    : "text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                )}
              >
                {f.label}
              </Link>
            ))}
            <Link
              href={qs({ historial: historial ? "" : "1" })}
              className="ml-auto text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {historial ? "Ocultar semanas pasadas" : "Mostrar semanas pasadas"}
            </Link>
          </div>

          <div className="mt-4 space-y-4">
            {weeks.map((w) => (
              <section key={w.campaignWeek}>
                <h3 className="mb-1.5 flex items-baseline gap-2 px-1">
                  <span
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      w.campaignWeek === data.currentCampaignWeek && "text-primary",
                    )}
                  >
                    {w.weekLabel}
                    {w.campaignWeek === data.currentCampaignWeek ? " · hoy" : ""}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {w.events.length} {w.events.length === 1 ? "salida" : "salidas"}
                  </span>
                </h3>
                <div className="divide-y overflow-hidden rounded-lg border bg-card">
                  {w.events.map((e, i) => (
                    <div
                      key={`${e.lotId}-${e.kind}-${i}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3.5 py-2.5 text-sm"
                    >
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                          e.kind === "despacho"
                            ? "bg-[#8b5cf6]/10 text-[#7c3aed] dark:text-[#a78bfa]"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {e.kind === "despacho" ? (
                          <>
                            <Truck className="h-3 w-3" /> Despacho
                          </>
                        ) : (
                          "Cambio de sección"
                        )}
                      </span>

                      <div className="min-w-0 flex-1">
                        <span className="font-medium">
                          {e.species}
                          {e.variety ? ` ${e.variety}` : ""}
                        </span>
                        <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                          {e.lotCode}
                        </span>
                      </div>

                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {e.trays.toLocaleString("es-CL")} band.
                      </span>

                      <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
                        {e.fromArea}
                        <ArrowRight className="h-3 w-3" />
                        {e.kind === "despacho" ? (
                          <span className="font-medium text-foreground">Despacho</span>
                        ) : (
                          e.toArea
                        )}
                      </span>

                      {e.kind === "despacho" ? (
                        <span className="flex w-full flex-wrap items-center gap-1.5 pl-0 sm:w-auto sm:pl-1">
                          {e.matches.length ? (
                            e.matches.map((m) => (
                              <Link
                                key={m.contractId}
                                href={`/contratos/${m.contractId}`}
                                title={`${m.clientName} · ${m.qtyPlants.toLocaleString("es-CL")} plantas${m.deliveryWeek ? ` · S${m.deliveryWeek}` : ""}`}
                                className="inline-flex max-w-56 items-center gap-1 truncate rounded-full border border-[#8b5cf6]/40 bg-[#8b5cf6]/[0.06] px-2 py-0.5 text-[11px] text-foreground transition-colors hover:border-[#8b5cf6]"
                              >
                                <FileText className="h-3 w-3 shrink-0 text-[#8b5cf6]" />
                                <span className="truncate">
                                  {m.contractNumber} · {m.clientName}
                                </span>
                              </Link>
                            ))
                          ) : e.unlinkedVariety ? (
                            <span
                              className="text-[11px] text-amber-600 dark:text-amber-400"
                              title="La variedad del lote no está vinculada a los maestros — vincúlala en Administración → Datos maestros para poder cruzar."
                            >
                              variedad sin vínculo
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">
                              sin contrato asociado
                            </span>
                          )}
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </section>
            ))}
            {weeks.length === 0 ? (
              <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
                Sin salidas {historial ? "" : "próximas "}para este filtro.
              </p>
            ) : null}
          </div>
        </>
      ) : (
        <p className="mt-4 rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          No hay lotes cargados aún.{" "}
          <Link
            href="/planner/carga"
            className="text-primary underline-offset-2 hover:underline"
          >
            Sube el Vivero Planner
          </Link>{" "}
          para ver las salidas.
        </p>
      )}
    </AppShell>
  );
}
