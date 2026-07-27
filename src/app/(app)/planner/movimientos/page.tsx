import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRightLeft, PackagePlus, Truck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { PlannedMovesList } from "@/components/planner/planned-moves-list";
import {
  getPlannedMovesData,
  type PlannedMoveKind,
} from "@/lib/planner/movimientos-data";

export const metadata = { title: "Movimientos" };
export const dynamic = "force-dynamic";

/**
 * Ingresos / Traslados / Salidas en una sola vista, derivada siempre del plan
 * vigente (planner_lots) — no hay una capa "registrada" aparte: el plan solo
 * entra por carga masiva del Excel (o una edición puntual de admin en
 * /planner/lotes), y cada cambio queda auditado en planner_lot_plan_changes.
 * Un lote cuyo plan cambió muestra el conteo de modificaciones al final de su
 * fila — se expande para ver el detalle (campo, antes → después, quién,
 * cuándo). Nada se borra: corregir algo agrega un cambio nuevo, no reescribe
 * el anterior.
 */
const TABS = [
  { key: "ingresos", label: "Ingresos", kind: "ingreso", icon: PackagePlus },
  { key: "traslados", label: "Traslados", kind: "traslado", icon: ArrowRightLeft },
  { key: "salidas", label: "Salidas", kind: "despacho", icon: Truck },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default async function MovimientosPage({
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
  if (!profile || !hasModuleAccess(profile, "planner")) {
    redirect("/apps");
  }

  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tipo) ?? TABS[2];
  const historial = sp.historial === "1";

  const planned = await getPlannedMovesData(supabase);

  // Rango visible: desde la semana actual salvo que se pidan las pasadas.
  const kind: PlannedMoveKind = tab.kind;
  const weeksInRange = (planned?.weeks ?? []).filter(
    (w) =>
      historial ||
      planned?.currentCampaignWeek === null ||
      w.campaignWeek >= (planned?.currentCampaignWeek ?? 0),
  );

  // Conteo por tipo del rango visible — va como badge en cada pestaña, así el
  // número vive dentro del control que lo filtra en vez de en una barra aparte.
  const countByKind: Record<PlannedMoveKind, number> = {
    ingreso: 0,
    traslado: 0,
    despacho: 0,
  };
  for (const w of weeksInRange) for (const m of w.moves) countByKind[m.kind] += 1;

  const plannedWeeks = weeksInRange
    .map((w) => ({ ...w, moves: w.moves.filter((m) => m.kind === kind) }))
    .filter((w) => w.moves.length > 0);

  const href = (patch: { tipo?: TabKey; historial?: string }) => {
    const params = new URLSearchParams();
    const tipo = patch.tipo ?? tab.key;
    const hist = patch.historial ?? (historial ? "1" : "");
    if (tipo !== "salidas") params.set("tipo", tipo);
    if (hist === "1") params.set("historial", "1");
    const s = params.toString();
    return `/planner/movimientos${s ? `?${s}` : ""}`;
  };

  // En vez de estadísticas, se muestran los PROBLEMAS del rango visible, con el
  // mismo lenguaje de alerta que /planner/ocupacion (ícono + texto corto).
  // Las dos categorías son excluyentes: sin variedad vinculada nunca puede
  // cruzar, así que no se cuenta también como "sin contrato".
  const visible = plannedWeeks.flatMap((w) => w.moves);
  const sinVariedad = visible.filter((m) => m.unlinkedVariety).length;
  const sinContrato =
    kind === "despacho"
      ? visible.filter((m) => !m.unlinkedVariety && m.matches.length === 0).length
      : 0;

  return (
    <AppShell>
      <PageHeader
        title="Movimientos"
        description="Ingresos, traslados y salidas del vivero. Cada pestaña muestra lo planificado según el plan vigente — los lotes con cambios de plan tienen su historial a la derecha."
      />

      {/* Segmented control: es el control principal de la vista, no un filtro
          secundario. Son rutas distintas, así que van como links (no tablist). */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <nav
          aria-label="Tipo de movimiento"
          className="inline-flex items-center gap-1 rounded-xl border bg-muted/60 p-1"
        >
          {TABS.map((x) => {
            const active = tab.key === x.key;
            const Icon = x.icon;
            return (
              <Link
                key={x.key}
                href={href({ tipo: x.key })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-all",
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {x.label}
                <span
                  className={cn(
                    "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                    active ? "bg-primary/10 text-primary" : "bg-foreground/[0.07]",
                  )}
                >
                  {countByKind[x.kind].toLocaleString("es-CL")}
                </span>
              </Link>
            );
          })}
        </nav>
        {/* Rango: cambia todos los números de la pantalla (incluidos los badges
            de las pestañas), así que necesita estado visible, no un link. */}
        <nav
          aria-label="Rango de semanas"
          className="ml-auto inline-flex items-center gap-1 rounded-lg border bg-muted/60 p-0.5 text-xs"
        >
          {[
            { key: "", label: "Próximas" },
            { key: "1", label: "Todas" },
          ].map((r) => {
            const active = (historial ? "1" : "") === r.key;
            return (
              <Link
                key={r.label}
                href={href({ historial: r.key })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-all",
                  active
                    ? "bg-background text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <section className="mt-5">
        {/* Los avisos viven junto a lo que describen, no en una barra aparte. */}
        {planned && (sinVariedad > 0 || sinContrato > 0) ? (
          <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {sinVariedad > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 text-amber-600 dark:text-amber-400"
                title="La variedad de estos lotes no está vinculada a los datos maestros, así que no puede cruzarse con los contratos. Se vincula desde el botón de la fila."
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="tabular-nums">{sinVariedad.toLocaleString("es-CL")}</span>
                sin variedad vinculada
              </span>
            ) : null}
            {sinContrato > 0 ? (
              <span
                className="inline-flex items-center gap-1.5 text-muted-foreground"
                title="Despachos cuya variedad sí está vinculada, pero que no calzan con ningún contrato del CRM en esa semana (±2)."
              >
                <AlertTriangle className="h-3 w-3 shrink-0" />
                <span className="tabular-nums">{sinContrato.toLocaleString("es-CL")}</span>
                sin contrato asociado
              </span>
            ) : null}
          </div>
        ) : null}
        {planned ? (
          <PlannedMovesList
            weeks={plannedWeeks}
            currentCampaignWeek={planned.currentCampaignWeek}
            kind={kind}
            canLinkMasters={profile.isPlatformAdmin || profile.role === "admin"}
          />
        ) : (
          <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
            No hay lotes cargados aún.{" "}
            <Link
              href="/planner/carga"
              className="text-primary underline-offset-2 hover:underline"
            >
              Sube el Vivero Planner
            </Link>{" "}
            para ver los movimientos planificados.
          </p>
        )}
      </section>
    </AppShell>
  );
}
