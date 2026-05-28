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
 * Paleta de colores ordenada por rank — los países con más share quedan
 * con los tonos más vibrantes (emerald primero, alineado con el brand).
 * Si hay más de 8 países, los restantes se agrupan en "Otros" (gris).
 */
const PALETTE = [
  { fill: "bg-emerald-500",  text: "text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500" },
  { fill: "bg-sky-500",      text: "text-sky-700 dark:text-sky-400",         dot: "bg-sky-500" },
  { fill: "bg-amber-500",    text: "text-amber-700 dark:text-amber-400",     dot: "bg-amber-500" },
  { fill: "bg-violet-500",   text: "text-violet-700 dark:text-violet-400",   dot: "bg-violet-500" },
  { fill: "bg-rose-500",     text: "text-rose-700 dark:text-rose-400",       dot: "bg-rose-500" },
  { fill: "bg-teal-500",     text: "text-teal-700 dark:text-teal-400",       dot: "bg-teal-500" },
  { fill: "bg-indigo-500",   text: "text-indigo-700 dark:text-indigo-400",   dot: "bg-indigo-500" },
  { fill: "bg-orange-500",   text: "text-orange-700 dark:text-orange-400",   dot: "bg-orange-500" },
] as const;

const OTHERS_COLOR = {
  fill: "bg-zinc-400 dark:bg-zinc-600",
  text: "text-zinc-700 dark:text-zinc-300",
  dot: "bg-zinc-400 dark:bg-zinc-600",
} as const;

type Segment = {
  countryId: string | null; // null = bucket "Otros"
  iso2: string | null;
  nameEs: string;
  plantsCommitted: number;
  revenueUsd: number;
  contractsCount: number;
  color: (typeof PALETTE)[number] | typeof OTHERS_COLOR;
  href: string | null;
};

/**
 * Barra apilada horizontal de países por plantas comprometidas — sustituye
 * al CountryGrid en el card "Entregas comprometidas" del dashboard.
 * Hover sobre un segmento revela el detalle. Cada segmento es link a
 * /clientes?country=ISO2 para drill-down.
 */
export function CountryStackedBar({ data }: Props) {
  const segments = React.useMemo<Segment[]>(() => {
    const active = data
      .filter((d) => d.plantsCommitted > 0)
      .sort((a, b) => b.plantsCommitted - a.plantsCommitted);

    if (active.length === 0) return [];

    const top = active.slice(0, PALETTE.length);
    const rest = active.slice(PALETTE.length);

    const segs: Segment[] = top.map((d, i) => ({
      countryId: d.countryId,
      iso2: d.iso2,
      nameEs: d.nameEs,
      plantsCommitted: d.plantsCommitted,
      revenueUsd: d.revenueUsd,
      contractsCount: d.contractsCount,
      color: PALETTE[i],
      href: d.iso2 ? `/clientes?country=${d.iso2}` : null,
    }));

    if (rest.length > 0) {
      const totalRestPlants = rest.reduce((acc, d) => acc + d.plantsCommitted, 0);
      const totalRestUsd = rest.reduce((acc, d) => acc + d.revenueUsd, 0);
      const totalRestContracts = rest.reduce(
        (acc, d) => acc + d.contractsCount,
        0,
      );
      segs.push({
        countryId: null,
        iso2: null,
        nameEs: `Otros (${rest.length})`,
        plantsCommitted: totalRestPlants,
        revenueUsd: totalRestUsd,
        contractsCount: totalRestContracts,
        color: OTHERS_COLOR,
        href: null,
      });
    }

    return segs;
  }, [data]);

  const total = React.useMemo(
    () => segments.reduce((acc, s) => acc + s.plantsCommitted, 0),
    [segments],
  );

  if (segments.length === 0 || total === 0) return null;

  return (
    <div className="space-y-3 p-3 md:p-4">
      {/* Stacked bar */}
      <div
        className="flex h-9 w-full overflow-hidden rounded-md border bg-muted/40"
        role="img"
        aria-label={`Distribución de ${formatNumber(total, true)} plantas comprometidas entre ${segments.length} países`}
      >
        {segments.map((s, idx) => {
          const widthPct = (s.plantsCommitted / total) * 100;
          // Para que cada segmento sea visible incluso si es minoritario,
          // garantizamos un mínimo de 1.5% (visual solamente — el tooltip
          // muestra el valor real).
          const renderedPct = Math.max(widthPct, 1.5);
          return (
            <SegmentEl
              key={s.countryId ?? `others-${idx}`}
              seg={s}
              widthPct={widthPct}
              renderedPct={renderedPct}
              isFirst={idx === 0}
              isLast={idx === segments.length - 1}
            />
          );
        })}
      </div>

      {/* Leyenda: 2 cols mobile, auto-fit desktop. Cada item es link */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-3 md:grid-cols-[repeat(auto-fit,minmax(180px,1fr))]">
        {segments.map((s, idx) => (
          <LegendItem key={s.countryId ?? `others-${idx}`} seg={s} total={total} />
        ))}
      </div>
    </div>
  );
}

function SegmentEl({
  seg,
  widthPct,
  renderedPct,
  isFirst,
  isLast,
}: {
  seg: Segment;
  widthPct: number;
  renderedPct: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const title = `${seg.nameEs} · ${formatNumber(seg.plantsCommitted, true)} plantas (${widthPct.toFixed(1)}%) · ${formatUsd(seg.revenueUsd, true)} · ${seg.contractsCount} ${seg.contractsCount === 1 ? "contrato" : "contratos"}`;

  const inner = (
    <div
      title={title}
      className={cn(
        "group relative flex h-full items-center justify-center transition-opacity hover:opacity-90",
        seg.color.fill,
        // Bordes redondeados solo en los extremos
        isFirst && "rounded-l-md",
        isLast && "rounded-r-md",
      )}
      style={{ width: `${renderedPct}%`, minWidth: "0.4rem" }}
    >
      {/* Etiqueta inline solo si el segmento es suficientemente ancho */}
      {renderedPct >= 12 ? (
        <span className="truncate px-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/95">
          {seg.iso2 ?? "—"} · {widthPct.toFixed(0)}%
        </span>
      ) : null}
    </div>
  );

  if (seg.href) {
    return (
      <Link href={seg.href} className="h-full" style={{ width: `${renderedPct}%` }}>
        {inner}
      </Link>
    );
  }
  return inner;
}

function LegendItem({ seg, total }: { seg: Segment; total: number }) {
  const widthPct = (seg.plantsCommitted / total) * 100;
  const content = (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      <span
        aria-hidden
        className={cn("size-2.5 shrink-0 rounded-sm", seg.color.dot)}
      />
      {seg.iso2 ? (
        <CountryFlag iso2={seg.iso2} size="sm" showName={false} />
      ) : null}
      <span className={cn("min-w-0 flex-1 truncate font-medium", seg.color.text)}>
        {seg.nameEs}
      </span>
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {formatNumber(seg.plantsCommitted, true)}{" "}
        <span className="text-[10px]">({widthPct.toFixed(0)}%)</span>
      </span>
    </div>
  );

  if (seg.href) {
    return (
      <Link
        href={seg.href}
        className="rounded-sm transition-colors hover:bg-muted/40"
      >
        {content}
      </Link>
    );
  }
  return <div>{content}</div>;
}
