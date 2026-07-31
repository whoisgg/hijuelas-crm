"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { HEAT_LEGEND, heatFill, heatTextOn } from "@/lib/planner/heat";
import type { SiteMapArea } from "@/lib/planner/site-map-data";

/**
 * "Hardening" del KMZ: NO es un área productiva, contiene Zona Clara y Zona
 * Oscura (verificado por ray-casting, ver vault § El KMZ) — capa de
 * agrupación puramente visual, por eso vive como constante acá y no en
 * planner_areas.
 */
const HARDENING: [number, number][] = [
  [-71.12472646036794, -32.83068404077287],
  [-71.12381481306784, -32.83122946691797],
  [-71.12327115845608, -32.83058226379313],
  [-71.12379823547799, -32.83026661314237],
  [-71.12398372420326, -32.8304742119366],
  [-71.12430674747972, -32.83028959626309],
  [-71.12437399237899, -32.83036169980195],
  [-71.12442960440305, -32.83034384254507],
  [-71.12472646036794, -32.83068404077287],
];

const WIDTH = 760;
const HEIGHT = 560;
const PADDING = 32;

/** Proyección local plana: corrige el aspecto por latitud (1° de longitud
 *  pesa menos que 1° de latitud fuera del ecuador) — suficiente en un sitio
 *  de ~500x600m, no hace falta Mercator real. */
function buildProjection(points: [number, number][]) {
  const lngs = points.map((p) => p[0]);
  const lats = points.map((p) => p[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const cosLat = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const spanX = (maxLng - minLng) * cosLat || 1;
  const spanY = maxLat - minLat || 1;
  const scale = Math.min((WIDTH - PADDING * 2) / spanX, (HEIGHT - PADDING * 2) / spanY);
  return (p: [number, number]): [number, number] => [
    (p[0] - minLng) * cosLat * scale + PADDING,
    (maxLat - p[1]) * scale + PADDING,
  ];
}

export function SiteMap({ areas, alertAt }: { areas: SiteMapArea[]; alertAt: number }) {
  const router = useRouter();
  const [hovered, setHovered] = React.useState<number | null>(null);

  const project = React.useMemo(
    () => buildProjection([...HARDENING, ...areas.flatMap((a) => a.geometry ?? [])]),
    [areas],
  );

  const toPath = (ring: [number, number][]) =>
    ring.map((p) => project(p).join(",")).join(" ");

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <svg
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          className="w-full"
          style={{ minWidth: 480 }}
        >
          <polygon
            points={toPath(HARDENING)}
            fill="none"
            stroke="currentColor"
            strokeDasharray="4 3"
            className="text-muted-foreground/50"
          />
          <text
            x={project(HARDENING[0])[0] + 4}
            y={project(HARDENING[0])[1] - 6}
            className="fill-muted-foreground text-[10px]"
          >
            Hardening
          </text>
          {areas.map((a) => {
            if (!a.geometry) return null;
            const isHovered = hovered === a.id;
            return (
              <g key={a.id}>
                <polygon
                  points={toPath(a.geometry)}
                  fill={heatFill(a.pct, alertAt)}
                  stroke={isHovered ? "#185FA5" : "#1e1e1e"}
                  strokeWidth={isHovered ? 2.5 : 1}
                  className="cursor-pointer transition-[stroke-width]"
                  onMouseEnter={() => setHovered(a.id)}
                  onMouseLeave={() => setHovered((h) => (h === a.id ? null : h))}
                  onClick={() => router.push(`/planner/sector/${a.id}`)}
                >
                  <title>
                    {a.name} · {Math.round(a.pct)}% ({a.occupiedTrays.toLocaleString("es-CL")}/
                    {a.capacityTrays.toLocaleString("es-CL")} band.)
                  </title>
                </polygon>
              </g>
            );
          })}
          {areas.map((a) => {
            if (!a.geometry) return null;
            const cx =
              a.geometry.reduce((s, p) => s + project(p)[0], 0) / a.geometry.length;
            const cy =
              a.geometry.reduce((s, p) => s + project(p)[1], 0) / a.geometry.length;
            return (
              <text
                key={a.id}
                x={cx}
                y={cy}
                textAnchor="middle"
                fill={heatTextOn(a.pct, alertAt)}
                className="pointer-events-none select-none text-[11px] font-medium"
              >
                {a.name}
              </text>
            );
          })}
        </svg>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
        {HEAT_LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${l.swatch}`} />
            {l.label.replace("{max}", String(Math.round(alertAt * 100)))}
          </span>
        ))}
      </div>
    </div>
  );
}
