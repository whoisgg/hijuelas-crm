import { Suspense } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Coins,
  Globe2,
  Plus,
  Sprout,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

import {
  getCatalogOverview,
  getCatalogStats,
  getCatalogTree,
  type CatalogStats,
} from "@/lib/actions/analytics";
import { formatNumber, formatUsd } from "@/lib/format";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { CatalogTree } from "@/components/catalogo/catalog-tree";
import { CatalogOverview } from "@/components/catalogo/catalog-overview";
import { CountryFlag } from "@/components/clientes/country-flag";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata = { title: "Catálogo" };
export const dynamic = "force-dynamic";

type CatalogSearchParams = {
  variety?: string;
};

export default async function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<CatalogSearchParams>;
}) {
  const params = await searchParams;
  const tree = await getCatalogTree();
  // Default: NO auto-seleccionamos la primera variedad. Mostramos un
  // overview del catálogo. Sólo si el user pasa ?variety=ID se muestra
  // el detalle de esa variedad.
  const selectedVarietyId = params.variety ?? null;

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <PageHeader
        title="Catálogo"
        description="Especies, variedades y métricas por variedad."
        badge="Sprint 6"
        actions={
          <Button variant="default" size="sm">
            <Plus className="size-3.5" />
            Nueva variedad
          </Button>
        }
      />

      <div className="flex flex-col gap-4 lg:flex-row">
        <CatalogTree tree={tree} />
        <div className="min-w-0 flex-1">
          {selectedVarietyId ? (
            <Suspense
              key={selectedVarietyId}
              fallback={<VarietyDetailSkeleton />}
            >
              <VarietyDetail varietyId={selectedVarietyId} />
            </Suspense>
          ) : (
            <Suspense fallback={<OverviewSkeleton />}>
              <OverviewBody />
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}

async function OverviewBody() {
  const data = await getCatalogOverview();
  return <CatalogOverview data={data} />;
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-[440px] w-full" />
    </div>
  );
}

async function VarietyDetail({ varietyId }: { varietyId: string }) {
  const stats = await getCatalogStats(varietyId);
  if (!stats) {
    return (
      <Card className="p-10">
        <EmptyState
          title="Variedad no encontrada"
          description="Es posible que se haya eliminado o no tengas permisos."
        />
      </Card>
    );
  }
  return <VarietyDetailView stats={stats} />;
}

function VarietyDetailView({ stats }: { stats: CatalogStats }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <CardTitle className="text-lg">{stats.varietyName}</CardTitle>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                {stats.speciesName ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    {stats.speciesName}
                  </Badge>
                ) : null}
                {stats.geneticProgram ? (
                  <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                    {stats.geneticProgram}
                  </Badge>
                ) : null}
              </div>
            </div>
            <Button variant="outline" size="sm">
              Editar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric
              icon={Sprout}
              label="Comprometidas YTD"
              value={formatNumber(stats.plantsCommittedYtd)}
              helper="plantas"
            />
            <Metric
              icon={TrendingUp}
              label="Entregadas YTD"
              value={formatNumber(stats.plantsDeliveredYtd)}
              helper="plantas"
              tone="positive"
            />
            <Metric
              icon={Target}
              label="Pipeline (pond.)"
              value={formatNumber(Math.round(stats.plantsPipeline))}
              helper="plantas × prob"
            />
            <Metric
              icon={Coins}
              label="Royalty / planta"
              value={
                stats.royaltyPerPlant != null
                  ? formatUsd(stats.royaltyPerPlant)
                  : "—"
              }
              helper="USD"
              tone="muted"
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="size-4 text-primary" />
              Top 5 clientes (year actual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topClients.length === 0 ? (
              <EmptyState description="Sin clientes este año." />
            ) : (
              <ul className="space-y-2">
                {stats.topClients.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
                  >
                    <Link
                      href={`/clientes/${c.id}`}
                      className="flex flex-1 items-center gap-1.5 text-xs font-medium hover:underline"
                    >
                      <ChevronRight className="size-3 text-muted-foreground" />
                      {c.name}
                    </Link>
                    <span className="text-xs font-medium tabular-nums">
                      {formatNumber(c.qtyPlants)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Globe2 className="size-4 text-primary" />
              Top 5 países (year actual)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topCountries.length === 0 ? (
              <EmptyState description="Sin países este año." />
            ) : (
              <ul className="space-y-2">
                {stats.topCountries.map((c) => (
                  <li
                    key={c.iso2 ?? c.name}
                    className="flex items-center justify-between gap-2 rounded-md border bg-card px-3 py-2"
                  >
                    <span className="inline-flex flex-1 items-center gap-1.5 text-xs font-medium">
                      <CountryFlag iso2={c.iso2} size="xs" showName={false} />
                      {c.name}
                    </span>
                    <span className="text-xs font-medium tabular-nums">
                      {formatNumber(c.qtyPlants)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
}: {
  icon: typeof Sprout;
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "positive" | "muted";
}) {
  const toneClasses: Record<string, string> = {
    default: "text-foreground",
    positive: "text-emerald-600 dark:text-emerald-400",
    muted: "text-muted-foreground",
  };
  return (
    <div className="space-y-1 rounded-md border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={`text-xl font-semibold tabular-nums ${toneClasses[tone]}`}>
        {value}
      </div>
      {helper ? <div className="text-[11px] text-muted-foreground">{helper}</div> : null}
    </div>
  );
}

function VarietyDetailSkeleton() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    </div>
  );
}
