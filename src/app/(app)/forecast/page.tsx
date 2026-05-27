import { Suspense } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ForecastView } from "@/components/forecast/forecast-view";
import {
  getForecastByMonth,
  listOrganizationsForForecast,
} from "@/lib/actions/forecast";
import { listKAMsForSelect } from "@/lib/actions/kam";
import {
  KAM_STATUS_GROUPS,
  parseKamStatuses,
  type KamStatusKey,
} from "@/lib/kam-status";

export const metadata = { title: "Forecast" };
export const dynamic = "force-dynamic";

const MIN_YEAR = 2026;

function parseYear(raw: string | undefined): number {
  const n = Number(raw);
  const cy = new Date().getFullYear();
  if (!Number.isFinite(n) || n < MIN_YEAR) return Math.max(cy, MIN_YEAR);
  return n;
}

function statusKeysToEnum(keys: Set<KamStatusKey>): string[] {
  // Default si no hay nada marcado: activos + por firmar (sin cancelados),
  // que coincide con KamStatusFilter del módulo /kam.
  if (keys.size === 0) {
    return ["borrador", "por_revisar", "firmado", "en_proceso", "finalizado"];
  }
  const enums: string[] = [];
  for (const group of KAM_STATUS_GROUPS) {
    if (keys.has(group.key)) enums.push(...group.matches);
  }
  return enums;
}

export default async function ForecastPage({
  searchParams,
}: {
  searchParams: Promise<{
    year?: string;
    statuses?: string;
    kam?: string;
    org?: string;
    opps?: string;
  }>;
}) {
  const sp = await searchParams;
  const year = parseYear(sp.year);
  const statusKeys = parseKamStatuses(sp.statuses);
  const statusIn = statusKeysToEnum(statusKeys);
  const kamId = sp.kam && sp.kam !== "all" ? sp.kam : null;
  const orgId = sp.org && sp.org !== "all" ? sp.org : null;
  const includeOpps = sp.opps === "1";

  // No tiene sentido mirar hacia atrás en un forecast.
  const now = new Date();
  const fromMonth =
    year === now.getFullYear() ? now.getMonth() + 1 : 1;

  return (
    <AppShell>
      <PageHeader
        title="Forecast"
        description={`Proyección mensual de facturación · ${year}`}
      />
      <Suspense fallback={<Skeleton className="h-[500px] w-full" />}>
        <ForecastBody
          year={year}
          fromMonth={fromMonth}
          statusKeys={statusKeys}
          statusIn={statusIn}
          kamId={kamId}
          orgId={orgId}
          includeOpps={includeOpps}
        />
      </Suspense>
    </AppShell>
  );
}

async function ForecastBody({
  year,
  fromMonth,
  statusKeys,
  statusIn,
  kamId,
  orgId,
  includeOpps,
}: {
  year: number;
  fromMonth: number;
  statusKeys: Set<KamStatusKey>;
  statusIn: string[];
  kamId: string | null;
  orgId: string | null;
  includeOpps: boolean;
}) {
  const [forecast, kams, orgs] = await Promise.all([
    getForecastByMonth({
      year,
      from_month: fromMonth,
      kam_id: kamId,
      organization_id: orgId,
      status_in: statusIn,
      include_opportunities: includeOpps,
    }),
    listKAMsForSelect(),
    listOrganizationsForForecast(),
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
      orgs={orgs}
      year={year}
      statusKeys={statusKeys}
      kamId={kamId}
      orgId={orgId}
      includeOpps={includeOpps}
      minYear={MIN_YEAR}
    />
  );
}
