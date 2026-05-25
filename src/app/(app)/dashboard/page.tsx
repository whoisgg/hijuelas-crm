import { Suspense } from "react";
import Link from "next/link";
import { CheckCircle2, FileSignature, Plus, Sprout, XCircle } from "lucide-react";

import { getDashboardSummary } from "@/lib/actions/analytics";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { MonthTimeline } from "@/components/dashboard/month-timeline";
import { CountryGrid } from "@/components/dashboard/country-grid";
import { EmptyState } from "@/components/dashboard/empty-state";
import { formatNumber } from "@/lib/format";
import { Globe2 } from "lucide-react";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

type DashboardSearchParams = {
  month?: string; // "YYYY-MM" o "all"
};

/**
 * Parse `?month=`:
 *  - sin param → mes actual (default)
 *  - "all"     → todos los años (no filter)
 *  - "YYYY"    → año completo (month=null pero year=Y)
 *  - "YYYY-MM" → mes específico
 */
function parseMonthParam(value: string | undefined): {
  year: number;
  month: number | null;
  selected: string;
} {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  const currentSelected = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
  // Default: mes actual
  if (!value) {
    return { year: currentYear, month: currentMonth, selected: currentSelected };
  }
  if (value === "all") {
    return { year: currentYear, month: null, selected: "all" };
  }
  // YYYY-MM
  const matchMonth = /^(\d{4})-(\d{2})$/.exec(value);
  if (matchMonth) {
    const y = Number(matchMonth[1]);
    const m = Number(matchMonth[2]);
    if (Number.isFinite(y) && m >= 1 && m <= 12) {
      return { year: y, month: m, selected: value };
    }
  }
  // YYYY
  const matchYear = /^(\d{4})$/.exec(value);
  if (matchYear) {
    const y = Number(matchYear[1]);
    if (Number.isFinite(y)) {
      return { year: y, month: null, selected: value };
    }
  }
  // Fallback
  return { year: currentYear, month: currentMonth, selected: currentSelected };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;
  const { year, month, selected } = parseMonthParam(params.month);

  return (
    <div
      className={
        // Altura fija = viewport - topbar (56). En mobile además restamos
        // el bottom nav (h-16 = 4rem) + safe-area inset. overflow-hidden
        // + flex-col + map como flex-1 → el mapa absorbe el remanente
        // sin scroll vertical en ningún breakpoint.
        "mx-auto flex w-full max-w-7xl flex-col overflow-hidden px-4 py-6 md:px-6 " +
        "h-[calc(100dvh-3.5rem-4rem-env(safe-area-inset-bottom))] md:h-[calc(100dvh-3.5rem)]"
      }
    >
      <PageHeader
        title="Dashboard"
        description="Compromisos de entrega por país. Navegá por mes o ve el año completo."
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

      {/* Timeline — parte SIEMPRE en mes actual (monthsBack=0); meses
          pasados se acceden con el pill "Todo el año". */}
      <div className="-mx-4 mt-4 border-y bg-card/50 md:-mx-6">
        <MonthTimeline selected={selected} monthsBack={0} monthsForward={18} />
      </div>

      <Suspense fallback={<DashboardSkeleton />} key={selected}>
        <DashboardContent year={year} month={month} />
      </Suspense>
    </div>
  );
}

async function DashboardContent({
  year,
  month,
}: {
  year: number;
  month: number | null;
}) {
  const summary = await getDashboardSummary({ year, month });
  const { statusCounts, currentYearCommitments, nextYearCommitments, mapData } =
    summary;

  const monthLabel =
    month != null ? `${MONTHS_ES[month - 1]} ${year}` : `${year}`;

  return (
    <>
      {/* KPI Row — mobile: scroll horizontal (chips, una fila); desktop:
          grid de 3 → 5 cols. Mobile evita las 3 filas que empujaban al
          mapa fuera del viewport. */}
      <div className="-mx-4 mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 [&>*]:shrink-0 [&>*]:snap-start [&>*]:min-w-[160px] md:mx-0 md:grid md:grid-cols-3 md:px-0 md:overflow-visible md:[&>*]:min-w-0 xl:grid-cols-5">
        <KpiCard
          label="Firmados"
          value={formatNumber(statusCounts.firmados)}
          helper="contratos activos"
          icon={CheckCircle2}
          tone="positive"
        />
        <KpiCard
          label="Por firmar"
          value={formatNumber(statusCounts.porFirmar)}
          helper="borradores y revisión"
          icon={FileSignature}
        />
        <KpiCard
          label="Cancelados"
          value={formatNumber(statusCounts.cancelados)}
          helper="contratos descartados"
          icon={XCircle}
          tone="muted"
        />
        <KpiCard
          label={`Plantas ${currentYearCommitments.year}`}
          value={formatNumber(
            currentYearCommitments.plants,
            currentYearCommitments.plants >= 10_000,
          )}
          helper="comprometidas — año completo"
          icon={Sprout}
        />
        <KpiCard
          label={`Plantas ${nextYearCommitments.year}`}
          value={formatNumber(
            nextYearCommitments.plants,
            nextYearCommitments.plants >= 10_000,
          )}
          helper="comprometidas — año completo"
          icon={Sprout}
          tone="muted"
        />
      </div>

      {/* Mapa — full width, ocupa el espacio remanente del viewport vía
          flex-1 (el padre del DashboardPage es flex column con min-h
          dvh). Sin scroll en desktop; en mobile estrecho min-h evita
          que se aplaste. */}
      <Card className="mt-4 flex min-h-[320px] flex-1 flex-col overflow-hidden md:min-h-[420px]">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2.5 text-xs">
          <span className="font-medium text-muted-foreground">
            Entregas comprometidas — <span className="text-foreground">{monthLabel}</span>
          </span>
          <span className="tabular-nums text-muted-foreground">
            {mapData.length} {mapData.length === 1 ? "país" : "países"} con actividad
          </span>
        </div>
        <div className="relative min-h-0 w-full flex-1">
          {mapData.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center">
              <EmptyState
                icon={Globe2}
                title="Sin actividad en este período"
                description={
                  month != null
                    ? "No hay entregas comprometidas en el mes seleccionado."
                    : "No hay entregas comprometidas en el año seleccionado."
                }
              />
            </div>
          ) : (
            <CountryGrid data={mapData} />
          )}
        </div>
      </Card>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-[88px] w-full rounded-lg" />
        ))}
      </div>
      <Skeleton className="mt-4 min-h-[320px] w-full flex-1 rounded-lg md:min-h-[420px]" />
    </>
  );
}
