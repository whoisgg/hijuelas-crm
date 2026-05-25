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
import { WorldMap } from "@/components/mapa/world-map";
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
 * Parse `?month=YYYY-MM` → { year, month } | { year, month: null } (= todo el año).
 * Default (sin param) = MES ACTUAL. `?month=all` = año completo explícito.
 */
function parseMonthParam(value: string | undefined): {
  year: number;
  month: number | null;
  selected: string;
} {
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;
  // Default: mes actual
  if (!value) {
    const selected = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    return { year: currentYear, month: currentMonth, selected };
  }
  if (value === "all") {
    return { year: currentYear, month: null, selected: "all" };
  }
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return { year: currentYear, month: currentMonth, selected: `${currentYear}-${String(currentMonth).padStart(2, "0")}` };
  const y = Number(match[1]);
  const m = Number(match[2]);
  if (!Number.isFinite(y) || m < 1 || m > 12) {
    return { year: currentYear, month: currentMonth, selected: `${currentYear}-${String(currentMonth).padStart(2, "0")}` };
  }
  return { year: y, month: m, selected: value };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const params = await searchParams;
  const { year, month, selected } = parseMonthParam(params.month);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-6">
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

      {/* Timeline — siempre client (router push) */}
      <div className="-mx-4 mt-4 border-y bg-card/50 md:-mx-6">
        <MonthTimeline selected={selected} />
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
      {/* KPI Row — 3 status + 2 año. Grid 2 cols mobile → 5 cols desktop xl. */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
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
          label={`Comprometidas ${currentYearCommitments.year}`}
          value={formatNumber(
            currentYearCommitments.plants,
            currentYearCommitments.plants >= 10_000,
          )}
          helper="plantas — año completo"
          icon={Sprout}
        />
        <KpiCard
          label={`Comprometidas ${nextYearCommitments.year}`}
          value={formatNumber(
            nextYearCommitments.plants,
            nextYearCommitments.plants >= 10_000,
          )}
          helper="plantas — año completo"
          icon={Sprout}
          tone="muted"
        />
      </div>

      {/* Mapa — full width, altura responsive (320 mobile, 480 desktop) */}
      <Card className="mt-4 overflow-hidden">
        <div className="flex items-center justify-between border-b px-4 py-2.5 text-xs">
          <span className="font-medium text-muted-foreground">
            Entregas comprometidas — <span className="text-foreground">{monthLabel}</span>
          </span>
          <span className="tabular-nums text-muted-foreground">
            {mapData.length} {mapData.length === 1 ? "país" : "países"} con actividad
          </span>
        </div>
        <div className="relative h-[480px] w-full md:h-[640px]">
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
            <WorldMap
              data={mapData}
              includeOpportunities={false}
              // Zoom enfocado en las Americas + Atlántico (cubre los
              // mercados reales: AR/BR/CL/CO/EC/MX/PE + ES/NL/PT + MA/ZM).
              // El cuadrante NE (Asia) queda parcialmente fuera — es OK,
              // Korea es marginal vs el volumen de Americas.
              projectionConfig={{ scale: 360, center: [-40, 15] }}
            />
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
      <Skeleton className="mt-4 h-[480px] w-full rounded-lg md:h-[640px]" />
    </>
  );
}
