"use client";

import * as React from "react";
import Link from "next/link";

import type { MapCountryDatum } from "@/lib/actions/analytics";
import { CountryFlag } from "@/components/clientes/country-flag";
import { formatNumber, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  data: MapCountryDatum[];
};

/**
 * Grid de países con actividad — alternativa al WorldMap para el
 * dashboard. Ordenado por plantsCommitted desc. Cada card es link a
 * /clientes?country=ISO2 para drilldown.
 *
 * Responsive: 2 cols mobile → 3 sm → 4 md → 5 lg → 6 xl. Internal
 * scroll si hay muchos países (el contenedor padre lo limita en height).
 */
export function CountryGrid({ data }: Props) {
  const sorted = React.useMemo(() => {
    return [...data]
      .filter((d) => d.plantsCommitted > 0)
      .sort((a, b) => b.plantsCommitted - a.plantsCommitted);
  }, [data]);

  if (sorted.length === 0) return null;

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
        {sorted.map((d, idx) => (
          <CountryCard key={d.countryId} datum={d} rank={idx + 1} />
        ))}
      </div>
    </div>
  );
}

function CountryCard({
  datum,
  rank,
}: {
  datum: MapCountryDatum;
  rank: number;
}) {
  const big = datum.plantsCommitted >= 1000;
  const bigUsd = datum.revenueUsd >= 10_000;
  return (
    <Link
      href={`/clientes?country=${datum.iso2}`}
      className={cn(
        "group flex flex-col gap-2 rounded-lg border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/40",
        rank === 1 && "border-primary/30 bg-primary/5",
      )}
      title={`${datum.nameEs} · ${formatNumber(datum.plantsCommitted)} plantas · ${formatUsd(datum.revenueUsd)}`}
    >
      {/* Header: flag + nombre + rank */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 items-center gap-1.5">
          <CountryFlag iso2={datum.iso2} size="sm" showName={false} />
          <span className="truncate text-xs font-medium text-foreground">
            {datum.nameEs}
          </span>
        </div>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
          #{rank}
        </span>
      </div>

      {/* Plantas — número grande */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-bold tabular-nums leading-none text-foreground">
          {formatNumber(datum.plantsCommitted, big)}
        </span>
        <span className="text-[10px] text-muted-foreground">plantas</span>
      </div>

      {/* USD — secundario */}
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span className="font-medium tabular-nums">
          {formatUsd(datum.revenueUsd, bigUsd)}
        </span>
        <span className="tabular-nums">
          {datum.contractsCount} {datum.contractsCount === 1 ? "contrato" : "contratos"}
        </span>
      </div>
    </Link>
  );
}
