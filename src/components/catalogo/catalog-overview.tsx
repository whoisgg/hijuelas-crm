import Link from "next/link";
import { ArrowRight, Library, Sprout, Tag, TrendingUp } from "lucide-react";

import type { CatalogOverview as CatalogOverviewData } from "@/lib/actions/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber } from "@/lib/format";

type Props = {
  data: CatalogOverviewData;
};

/**
 * Landing del catálogo cuando no hay variedad seleccionada. Muestra
 * stats globales (especies/programas/variedades/plantas) y top 10
 * variedades del año actual para drill-down rápido.
 */
export function CatalogOverview({ data }: Props) {
  const year = new Date().getUTCFullYear();
  return (
    <div className="space-y-4">
      {/* Stats globales */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Library}
          label="Especies"
          value={formatNumber(data.speciesCount)}
        />
        <StatCard
          icon={Tag}
          label="Programas genéticos"
          value={formatNumber(data.programsCount)}
        />
        <StatCard
          icon={Sprout}
          label="Variedades"
          value={formatNumber(data.varietiesCount)}
        />
        <StatCard
          icon={TrendingUp}
          label={`Plantas ${year}`}
          value={formatNumber(
            data.plantsCommittedYtd,
            data.plantsCommittedYtd >= 10_000,
          )}
          helper="comprometidas"
          tone="positive"
        />
      </div>

      {/* Top 10 variedades del año */}
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="text-sm">
            Top 10 variedades · {year}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {data.topVarietiesYtd.length === 0 ? (
            <div className="flex h-24 items-center justify-center text-sm text-muted-foreground">
              Sin items en el año actual.
            </div>
          ) : (
            <ul className="divide-y">
              {data.topVarietiesYtd.map((v, idx) => {
                const max = data.topVarietiesYtd[0].qtyPlants;
                const widthPct = max > 0
                  ? Math.max(2, Math.round((v.qtyPlants / max) * 100))
                  : 0;
                return (
                  <li key={v.varietyId} className="relative">
                    <div
                      aria-hidden
                      className="absolute inset-y-0 left-0 bg-primary/10 transition-[width]"
                      style={{ width: `${widthPct}%` }}
                    />
                    <Link
                      href={`/catalogo?variety=${v.varietyId}`}
                      className="relative z-10 flex items-center gap-2 px-3 py-2.5 text-sm transition-colors hover:bg-muted/30"
                    >
                      <span className="w-6 shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        #{idx + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {v.name}
                      </span>
                      {v.speciesName ? (
                        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                          {v.speciesName}
                        </span>
                      ) : null}
                      <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">
                        {formatNumber(v.qtyPlants, v.qtyPlants >= 1000)}
                      </span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="px-1 text-xs text-muted-foreground">
        Click en una variedad del árbol (izquierda) o en el ranking para
        ver detalle completo: top clientes, países y métricas históricas.
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  helper,
  tone = "default",
}: {
  icon: typeof Library;
  label: string;
  value: string;
  helper?: string;
  tone?: "default" | "positive";
}) {
  return (
    <div className="space-y-1 rounded-md border bg-card p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div
        className={
          "text-2xl font-semibold tabular-nums " +
          (tone === "positive"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-foreground")
        }
      >
        {value}
      </div>
      {helper ? (
        <div className="text-[11px] text-muted-foreground">{helper}</div>
      ) : null}
    </div>
  );
}
