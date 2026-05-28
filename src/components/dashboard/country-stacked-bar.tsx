"use client";

import * as React from "react";
import Link from "next/link";

import type { MapCountryDatum } from "@/lib/actions/analytics";
import { formatNumber, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  data: MapCountryDatum[];
};

/**
 * Paleta de colores ordenada por rank. Top 8 países usan colores distintos;
 * el resto cae en bucket "Otros" (gris). Pensada para verse minimalista
 * — solo una franja delgada arriba del grid de cards, sin texto encima.
 */
const PALETTE = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-orange-500",
] as const;

const OTHERS_COLOR = "bg-zinc-400 dark:bg-zinc-600";

type Segment = {
  countryId: string | null; // null = bucket "Otros"
  iso2: string | null;
  nameEs: string;
  plantsCommitted: number;
  revenueUsd: number;
  contractsCount: number;
  shareCount: number; // # de países agrupados (1 normalmente, >1 si es "Otros")
  fill: string;
  href: string | null;
};

/**
 * Stacked bar minimalista — una franja delgada (h-2) arriba del grid de
 * cards. Da un glance instantáneo del país-mix del período. Hover muestra
 * el detalle; click va a /clientes?country=ISO2. Sin texto sobre la barra
 * — los nombres y números viven en las cards de abajo.
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
      shareCount: 1,
      fill: PALETTE[i],
      href: d.iso2 ? `/clientes?country=${d.iso2}` : null,
    }));

    if (rest.length > 0) {
      segs.push({
        countryId: null,
        iso2: null,
        nameEs: `Otros (${rest.length})`,
        plantsCommitted: rest.reduce((acc, d) => acc + d.plantsCommitted, 0),
        revenueUsd: rest.reduce((acc, d) => acc + d.revenueUsd, 0),
        contractsCount: rest.reduce((acc, d) => acc + d.contractsCount, 0),
        shareCount: rest.length,
        fill: OTHERS_COLOR,
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
    <div
      className="flex h-2 w-full overflow-hidden border-b bg-muted/30"
      role="img"
      aria-label={`Distribución de ${formatNumber(total, true)} plantas comprometidas entre ${segments.length} países`}
    >
      {segments.map((s, idx) => {
        const widthPct = (s.plantsCommitted / total) * 100;
        // Minimo visual para no perder presencia de segmentos chicos.
        const renderedPct = Math.max(widthPct, 0.5);
        const title = `${s.nameEs} · ${formatNumber(s.plantsCommitted, true)} plantas (${widthPct.toFixed(1)}%) · ${formatUsd(s.revenueUsd, true)} · ${s.contractsCount} ${s.contractsCount === 1 ? "contrato" : "contratos"}`;

        const inner = (
          <div
            title={title}
            className={cn(
              "h-full transition-opacity hover:opacity-80",
              s.fill,
              s.href && "cursor-pointer",
            )}
            style={{ width: `${renderedPct}%` }}
          />
        );

        if (s.href) {
          return (
            <Link
              key={s.countryId ?? `others-${idx}`}
              href={s.href}
              className="h-full"
              style={{ width: `${renderedPct}%` }}
              aria-label={title}
            >
              {inner}
            </Link>
          );
        }
        return (
          <React.Fragment key={s.countryId ?? `others-${idx}`}>
            {inner}
          </React.Fragment>
        );
      })}
    </div>
  );
}
