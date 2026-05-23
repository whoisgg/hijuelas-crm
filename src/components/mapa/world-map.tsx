"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ComposableMap,
  Geographies,
  Geography,
  Sphere,
  Graticule,
  Marker,
} from "react-simple-maps";

import type { MapCountryDatum } from "@/lib/actions/analytics";
import { formatNumber, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

import isoNumericByIso3 from "./iso-numeric-by-iso3";

const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type Props = {
  data: MapCountryDatum[];
  includeOpportunities: boolean;
};

// Stable categorical palette — distinct hues, oklch for harmony with theme
const CATEGORY_COLORS = [
  "oklch(0.65 0.18 145)", // green (brand)
  "oklch(0.65 0.18 25)",  // red-orange
  "oklch(0.65 0.18 250)", // blue
  "oklch(0.65 0.18 85)",  // yellow-green
  "oklch(0.65 0.18 305)", // magenta
  "oklch(0.65 0.18 195)", // cyan
  "oklch(0.65 0.18 55)",  // orange
  "oklch(0.65 0.18 270)", // purple
  "oklch(0.65 0.18 165)", // teal
  "oklch(0.65 0.18 15)",  // red
  "oklch(0.65 0.18 130)", // lime
  "oklch(0.65 0.18 220)", // sky
  "oklch(0.65 0.18 320)", // pink
  "oklch(0.65 0.18 105)", // chartreuse
  "oklch(0.65 0.18 285)", // violet
  "oklch(0.65 0.18 175)", // turquoise
  "oklch(0.65 0.18 65)",  // amber
  "oklch(0.65 0.18 240)", // indigo
  "oklch(0.65 0.18 155)", // mint
  "oklch(0.65 0.18 40)",  // brick
];

type HoverPayload = {
  datum: MapCountryDatum;
  x: number;
  y: number;
};

// Stable approx centroid by ISO3 — covers the countries we use
const CENTROIDS: Record<string, [number, number]> = {
  CHL: [-71.5, -35.7],
  PER: [-75.0, -9.2],
  ARG: [-63.6, -38.4],
  BRA: [-51.9, -14.2],
  COL: [-74.3, 4.6],
  ECU: [-78.2, -1.8],
  MEX: [-102.5, 23.6],
  USA: [-95.7, 37.1],
  ESP: [-3.7, 40.5],
  PRT: [-8.2, 39.4],
  NLD: [5.3, 52.1],
  FRA: [2.2, 46.2],
  MAR: [-7.1, 31.8],
  ZAF: [22.9, -30.6],
  ZMB: [27.8, -13.1],
  AZE: [47.6, 40.1],
  KOR: [127.8, 35.9],
  CHN: [104.2, 35.9],
  JPN: [138.3, 36.2],
  AUS: [133.8, -25.3],
  CAN: [-106.3, 56.1],
  GBR: [-3.4, 55.4],
  DEU: [10.5, 51.2],
  ITA: [12.6, 41.9],
};

export function WorldMap({ data, includeOpportunities }: Props) {
  const router = useRouter();
  const [hover, setHover] = React.useState<HoverPayload | null>(null);

  // Only keep countries with activity
  const activeData = React.useMemo(
    () =>
      data.filter(
        (d) =>
          d.plantsCommitted > 0 ||
          d.plantsFromOpportunities > 0 ||
          d.revenueUsd > 0 ||
          d.pipelineValueUsd > 0,
      ),
    [data],
  );

  // Assign stable categorical color per active country (sorted by revenue desc → color index)
  const colorByCountryId = React.useMemo(() => {
    const sorted = [...activeData].sort((a, b) => b.revenueUsd - a.revenueUsd);
    const map = new Map<string, string>();
    sorted.forEach((d, i) => {
      map.set(d.countryId, CATEGORY_COLORS[i % CATEGORY_COLORS.length]);
    });
    return map;
  }, [activeData]);

  const byNumericId = React.useMemo(() => {
    const map = new Map<string, MapCountryDatum>();
    for (const d of activeData) {
      const numeric = isoNumericByIso3[d.iso3];
      if (numeric) map.set(numeric, d);
    }
    return map;
  }, [activeData]);

  return (
    <div className="relative h-full w-full">
      <ComposableMap
        projection="geoEqualEarth"
        projectionConfig={{ scale: 220, center: [-30, 5] }}
        className="h-full w-full"
        style={{ background: "transparent" }}
      >
        <Sphere id="sphere" stroke="var(--border)" strokeWidth={0.4} fill="transparent" />
        <Graticule stroke="var(--border)" strokeWidth={0.3} />
        <Geographies geography={GEO_URL}>
          {({
            geographies,
          }: {
            geographies: Array<{
              rsmKey: string;
              id: string;
              properties: { name: string };
            }>;
          }) =>
            geographies.map((geo) => {
              const datum = byNumericId.get(String(geo.id));
              const fill = datum
                ? colorByCountryId.get(datum.countryId) ?? "var(--muted)"
                : "var(--muted)";
              return (
                <Geography
                  key={geo.rsmKey}
                  geography={geo}
                  fill={fill}
                  stroke="var(--border)"
                  strokeWidth={0.4}
                  style={{
                    default: { outline: "none", opacity: datum ? 0.9 : 0.35 },
                    hover: {
                      outline: "none",
                      cursor: datum ? "pointer" : "default",
                      fill,
                      opacity: datum ? 1 : 0.35,
                    },
                    pressed: { outline: "none" },
                  }}
                  onClick={() => {
                    if (datum) router.push(`/clientes?country=${datum.iso2}`);
                  }}
                  onMouseEnter={(evt: React.MouseEvent) => {
                    if (datum) setHover({ datum, x: evt.clientX, y: evt.clientY });
                  }}
                  onMouseMove={(evt: React.MouseEvent) => {
                    if (datum) {
                      setHover((prev) =>
                        prev
                          ? { ...prev, x: evt.clientX, y: evt.clientY }
                          : { datum, x: evt.clientX, y: evt.clientY },
                      );
                    }
                  }}
                  onMouseLeave={() => setHover(null)}
                />
              );
            })
          }
        </Geographies>

        {/* Persistent tags */}
        {activeData.map((d) => {
          const coords = CENTROIDS[d.iso3];
          if (!coords) return null;
          const color = colorByCountryId.get(d.countryId) ?? "oklch(0.65 0.18 145)";
          return (
            <Marker key={d.countryId} coordinates={coords}>
              <g pointerEvents="none">
                <rect
                  x={-38}
                  y={-20}
                  width={76}
                  height={36}
                  rx={5}
                  fill="var(--card)"
                  stroke={color}
                  strokeWidth={1.5}
                  fillOpacity={0.97}
                />
                <text
                  textAnchor="middle"
                  y={-5}
                  style={{
                    fontFamily: "var(--font-geist-mono, monospace)",
                    fontSize: 9,
                    fontWeight: 700,
                    fill: "var(--foreground)",
                  }}
                >
                  {formatNumber(d.plantsCommitted)}
                </text>
                <text
                  textAnchor="middle"
                  y={9}
                  style={{
                    fontFamily: "var(--font-geist-mono, monospace)",
                    fontSize: 8,
                    fontWeight: 600,
                    fill: "var(--foreground)",
                  }}
                >
                  {formatUsd(d.revenueUsd, d.revenueUsd >= 100_000)}
                </text>
              </g>
            </Marker>
          );
        })}
      </ComposableMap>

      {hover ? <MapTooltip payload={hover} includeOpportunities={includeOpportunities} /> : null}
    </div>
  );
}

function MapTooltip({
  payload,
  includeOpportunities,
}: {
  payload: HoverPayload;
  includeOpportunities: boolean;
}) {
  const [vw, setVw] = React.useState(0);
  const [vh, setVh] = React.useState(0);
  React.useEffect(() => {
    const update = () => {
      setVw(window.innerWidth);
      setVh(window.innerHeight);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  const left = vw ? Math.min(payload.x + 12, vw - 280) : payload.x + 12;
  const top = vh ? Math.min(payload.y + 12, vh - 200) : payload.y + 12;

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-50 w-64 rounded-md border bg-popover p-3 text-xs shadow-lg",
      )}
      style={{ left, top }}
    >
      <div className="mb-1.5 font-semibold text-foreground">{payload.datum.nameEs}</div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-muted-foreground">
        <span>Clientes</span>
        <span className="text-right font-medium text-foreground">
          {payload.datum.clientsCount}
        </span>
        <span>Contratos</span>
        <span className="text-right font-medium text-foreground">
          {payload.datum.contractsCount}
        </span>
        <span>Total plantas</span>
        <span className="text-right font-medium text-foreground">
          {formatNumber(payload.datum.plantsCommitted)}
        </span>
        {includeOpportunities ? (
          <>
            <span>+ Pipeline (pond.)</span>
            <span className="text-right font-medium text-foreground">
              {formatNumber(payload.datum.plantsFromOpportunities)}
            </span>
          </>
        ) : null}
        <span>Total USD</span>
        <span className="text-right font-medium text-foreground">
          {formatUsd(payload.datum.revenueUsd, payload.datum.revenueUsd >= 100_000)}
        </span>
        {includeOpportunities ? (
          <>
            <span>Pipeline USD</span>
            <span className="text-right font-medium text-foreground">
              {formatUsd(
                payload.datum.pipelineValueUsd,
                payload.datum.pipelineValueUsd >= 100_000,
              )}
            </span>
          </>
        ) : null}
      </div>
      <div className="mt-2 text-[10px] text-muted-foreground">
        Click para ver clientes del país
      </div>
    </div>
  );
}
