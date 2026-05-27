import { Suspense } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ForecastView } from "@/components/forecast/forecast-view";
import { getForecastByMonth } from "@/lib/actions/forecast";
import { listKAMsForSelect } from "@/lib/actions/kam";

export const metadata = { title: "Forecast" };
export const dynamic = "force-dynamic";

const MIN_YEAR = 2026;

function parseYear(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_YEAR) return new Date().getFullYear();
  return Math.max(n, MIN_YEAR);
}

function parseStatus(raw: string | undefined): string | null {
  if (!raw) return null;
  if (["signed", "pending", "active", "all"].includes(raw)) return raw;
  return null;
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    kam?: string;
    status?: string;
  }>;
}) {
  const sp = await searchParams;
  const year = parseYear(sp.year);
  const statusFilter = parseStatus(sp.status);
  const kamId = sp.kam && sp.kam !== "all" ? sp.kam : null;

  return (
    <AppShell>
      <PageHeader
        title="Forecast"
        description={`Proyección mensual de facturación · ${year}`}
      />
      <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
        <ForecastBody year={year} kamId={kamId} statusFilter={statusFilter} />
      </Suspense>
    </AppShell>
  );
}

async function ForecastBody({
  year,
  kamId,
  statusFilter,
}: {
  year: number;
  kamId: string | null;
  statusFilter: string | null;
}) {
  const [forecast, kams] = await Promise.all([
    getForecastByMonth({
      year,
      kam_id: kamId,
      status_filter: statusFilter,
    }),
    listKAMsForSelect(),
  ]);

  if (!forecast) {
    return (
      <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
        No se pudo cargar el forecast (sesión inválida).
      </div>
    );
  }

  return (
    <ForecastView
      forecast={forecast}
      kams={kams}
      year={year}
      kamId={kamId}
      statusFilter={statusFilter}
      minYear={MIN_YEAR}
    />
  );
}
