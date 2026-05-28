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
 * Paleta de colores ordenada por rank. Top 8 países usan colores distintos;
 * el resto cae en bucket "Otros" (gris). Tonos elegidos para alto contraste
 * con texto blanco — los labels viven SOBRE la barra, así que el background
 * tiene que cargar bien la tinta.
 */
const PALETTE = [
  "bg-emerald-600",
  "bg-sky-600",
  "bg-amber-600",
  "bg-violet-600",
  "bg-rose-600",
  "bg-teal-600",
  "bg-indigo-600",
  "bg-orange-600",
] as const;

const OTHERS_COLOR = "bg-zinc-500 dark:bg-zinc-600";

type Segment = {
  countryId: string | null; // null = bucket "Otros"
  iso2: string | null;
  nameEs: string;
  plantsCommitted: number;
  revenueUsd: number;
  contractsCount: number;
  shareCount: number; // 1 normal, >1 si es "Otros"
  fill: string;
  href: string | null;
};

/**
 * Stacked bar minimalista — franja con segmentos proporcionales por país.
 * Cada segmento muestra inline su bandera + nombre/ISO2 + % (la densidad
 * de info se ajusta según el ancho disponible). Hover revela el detalle
 * completo, click → /clientes?country=ISO2.
 *
 * Bug fix de la versión anterior: el width se aplicaba doble (Link wrapper
 * + inner div), produciendo huecos visibles entre segmentos. Ahora el
 * width vive UNA sola vez en el elemento outer.
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
    <div className="px-3 pt-3 md:px-4">
      <div
        className="flex h-6 w-full overflow-hidden rounded-md border bg-muted/40"
        role="img"
        aria-label={`Distribución de ${formatNumber(total, true)} plantas comprometidas entre ${segments.length} países`}
      >
        {segments.map((s, idx) => (
          <SegmentEl
            key={s.countryId ?? `others-${idx}`}
            seg={s}
            total={total}
          />
        ))}
      </div>
    </div>
  );
}

function SegmentEl({ seg, total }: { seg: Segment; total: number }) {
  const widthPct = (seg.plantsCommitted / total) * 100;
  // Mínimo visual de 0.6% para que segmentos chicos sigan siendo visibles
  // pero sin distorsionar a los grandes.
  const renderedPct = Math.max(widthPct, 0.6);
  const title = `${seg.nameEs} · ${formatNumber(seg.plantsCommitted, true)} plantas (${widthPct.toFixed(1)}%) · ${formatUsd(seg.revenueUsd, true)} · ${seg.contractsCount} ${seg.contractsCount === 1 ? "contrato" : "contratos"}`;

  // Decidir qué tanto label cabe según el % de ancho del segmento.
  // Estas thresholds son heurísticas — funcionan bien para barras desktop
  // de ~1000px de ancho con flag + 1-2 tokens de texto.
  const showFlag = renderedPct >= 4 && seg.iso2 != null;
  const showName = renderedPct >= 18;
  const showPct = renderedPct >= 8;
  const showIso2 = renderedPct >= 4 && !showName;

  const content = (
    <div
      title={title}
      className={cn(
        "flex h-full min-w-0 items-center justify-center gap-1 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-white transition-opacity hover:opacity-90",
        seg.fill,
      )}
    >
      {showFlag && seg.iso2 ? (
        <CountryFlag iso2={seg.iso2} size="sm" showName={false} />
      ) : null}
      {showName ? (
        <span className="truncate">{seg.nameEs}</span>
      ) : showIso2 && seg.iso2 ? (
        <span>{seg.iso2}</span>
      ) : null}
      {showPct ? (
        <span className="tabular-nums opacity-90">
          {widthPct.toFixed(0)}%
        </span>
      ) : null}
    </div>
  );

  // ÚNICO lugar donde se aplica width — outer element.
  if (seg.href) {
    return (
      <Link
        href={seg.href}
        className="block h-full"
        style={{ width: `${renderedPct}%` }}
        aria-label={title}
      >
        {content}
      </Link>
    );
  }
  return (
    <div className="h-full" style={{ width: `${renderedPct}%` }}>
      {content}
    </div>
  );
}
