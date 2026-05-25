import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, FileSignature, Globe2, Plus, Sprout, XCircle } from "lucide-react";

import { getDashboardSummary } from "@/lib/actions/analytics";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { PeriodFilter, type PeriodKey } from "@/components/dashboard/period-filter";
import { CountryGrid } from "@/components/dashboard/country-grid";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatNumber } from "@/lib/format";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const MONTHS_ES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];

type DashboardSearchParams = {
  /** "this-month" (default) | "next-3" | "year" | "next-year". */
  period?: string;
};

type ResolvedPeriod = {
  key: PeriodKey;
  year: number;
  months: number[] | null; // null = año completo
  label: string;           // texto humano detallado (header del card)
  shortLabel: string;      // texto corto para KPI ("este mes", "2026"…)
};

/**
 * Resuelve el query param `period` a:
 *  - el año a consultar
 *  - la lista de meses (null = año completo)
 *  - un label legible
 */
function resolvePeriod(value: string | undefined): ResolvedPeriod {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + 1;
  const key: PeriodKey =
    value === "next-3" || value === "year" || value === "next-year"
      ? value
      : "this-month";

  if (key === "this-month") {
    return {
      key, year: y, months: [m],
      label: `${MONTHS_ES[m - 1]} ${y}`,
      shortLabel: "este mes",
    };
  }
  if (key === "next-3") {
    const months = [0, 1, 2].map((i) => ((m - 1 + i) % 12) + 1);
    const last = months[months.length - 1];
    return {
      key, year: y, months,
      label: `${MONTHS_ES[months[0] - 1]} – ${MONTHS_ES[last - 1]} ${y}`,
      shortLabel: "próx. 3 meses",
    };
  }
  if (key === "year") {
    return { key, year: y, months: null, label: `${y}`, shortLabel: `${y}` };
  }
  // next-year
  return {
    key, year: y + 1, months: null,
    label: `${y + 1}`, shortLabel: `${y + 1}`,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(params.period);

  return (
    <div
      className={
        // Altura fija = viewport - topbar (56). En mobile además restamos
        // el bottom nav (h-16 = 4rem) + safe-area inset. overflow-hidden
        // + flex-col + grid-card como flex-1 → el grid absorbe el remanente
        // sin scroll vertical.
        "mx-auto flex w-full max-w-7xl flex-col overflow-hidden px-4 py-6 md:px-6 " +
        "h-[calc(100dvh-3.5rem-4rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-3.5rem)]"
      }
    >
      <PageHeader
        title="Dashboard"
        actions={
          <Button
            size="sm"
            render={
              <Link href="/contratos/nuevo">
                <Plus className="size-4" />
                <span className="hidden sm:inline">Nuevo contrato</span>
              </Link>
            }
          />
        }
      />

      {/* Período rápido — 4 chips. Diferencia el dashboard del calendario
          detallado (allá se navega semana por semana). */}
      <div className="-mx-4 mt-4 border-y bg-card/50 md:-mx-6">
        <PeriodFilter selected={period.key} />
      </div>

      <Suspense fallback={<DashboardSkeleton />} key={period.key}>
        <DashboardContent period={period} />
      </Suspense>
    </div>
  );
}

async function DashboardContent({ period }: { period: ResolvedPeriod }) {
  const summary = await getDashboardSummary({
    year: period.year,
    months: period.months,
  });
  const { statusCounts, mapData } = summary;

  // Total dinámico — suma de plantas del grid de países, refleja el
  // filtro de período activo (mes / 3 meses / año).
  const totalPlants = mapData.reduce((acc, d) => acc + d.plantsCommitted, 0);
  const totalLabel = `Total ${period.shortLabel}`;
  const totalValue = formatNumber(totalPlants, totalPlants >= 10_000);

  return (
    <>
      {/* KPI — desktop: KpiCards en grid de 4 cols (3 status + 1 total). */}
      <div className="mt-3 hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Firmados" value={formatNumber(statusCounts.firmados)} icon={CheckCircle2} tone="positive" />
        <KpiCard label="Por firmar" value={formatNumber(statusCounts.porFirmar)} icon={FileSignature} />
        <KpiCard label="Cancelados" value={formatNumber(statusCounts.cancelados)} icon={XCircle} tone="muted" />
        <KpiCard label={totalLabel} value={totalValue} icon={Sprout} />
      </div>

      {/* Mobile: strips compactos — 4 filas. */}
      <div className="mt-3 grid grid-cols-1 gap-1.5 md:hidden">
        <KpiStrip icon={CheckCircle2} label="Firmados" value={formatNumber(statusCounts.firmados)} tone="positive" />
        <KpiStrip icon={FileSignature} label="Por firmar" value={formatNumber(statusCounts.porFirmar)} />
        <KpiStrip icon={XCircle} label="Cancelados" value={formatNumber(statusCounts.cancelados)} tone="muted" />
        <KpiStrip icon={Sprout} label={totalLabel} value={totalValue} />
      </div>

      {/* Grid de países — natural height (no flex-1) hasta máximo 3
          filas. Debajo queda espacio reservado para widgets futuros. */}
      <Card className="mt-4 flex flex-col overflow-hidden">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5 text-xs">
          <span className="font-medium text-muted-foreground">
            Entregas comprometidas — <span className="text-foreground">{period.label}</span>
          </span>
          <span className="tabular-nums text-muted-foreground">
            {mapData.length} {mapData.length === 1 ? "país" : "países"} con actividad
          </span>
        </div>
        <div className="relative w-full">
          {mapData.length === 0 ? (
            <div className="flex h-32 w-full items-center justify-center">
              <EmptyState
                icon={Globe2}
                title="Sin actividad en este período"
                description="No hay entregas comprometidas en el período seleccionado."
              />
            </div>
          ) : (
            <CountryGrid data={mapData} />
          )}
        </div>
      </Card>

      {/* Placeholder para widgets futuros (mantiene la página llenando
          el viewport y aprovecha el espacio cuando hay pocos países). */}
      <div className="hidden flex-1 md:block" />
    </>
  );
}

function KpiStrip({
  icon: Icon,
  label,
  value,
  tone = "default",
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: string;
  tone?: "default" | "positive" | "muted";
}) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span
        className={
          "text-sm font-semibold tabular-nums " +
          (tone === "positive"
            ? "text-emerald-600 dark:text-emerald-400"
            : tone === "muted"
              ? "text-muted-foreground"
              : "text-foreground")
        }
      >
        {value}
      </span>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <>
      {/* Desktop KPIs skeleton — 4 cards */}
      <div className="mt-3 hidden gap-3 md:grid md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[78px] w-full rounded-lg" />
        ))}
      </div>
      {/* Mobile KPI strips skeleton — 4 strips */}
      <div className="mt-3 grid grid-cols-1 gap-1.5 md:hidden">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[36px] w-full rounded-md" />
        ))}
      </div>
      <Skeleton className="mt-4 h-[280px] w-full rounded-lg md:h-[360px]" />
    </>
  );
}
