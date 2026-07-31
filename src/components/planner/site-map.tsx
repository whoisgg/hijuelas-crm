"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import "leaflet/dist/leaflet.css";

import { HEAT_LEGEND, heatFill } from "@/lib/planner/heat";
import type { SiteMapArea } from "@/lib/planner/site-map-data";

/**
 * "Hardening" del KMZ: NO es un área productiva, contiene Zona Clara y Zona
 * Oscura (verificado por ray-casting, ver vault § El KMZ) — capa de
 * agrupación puramente visual, por eso vive como constante acá y no en
 * planner_areas. [lng, lat] igual que el resto del KMZ — se invierte a
 * [lat, lng] recién al pasarlo a Leaflet.
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

const toLatLng = (ring: [number, number][]) => ring.map(([lng, lat]) => [lat, lng] as const);

/** Imágenes satelitales reales de Esri (World Imagery) — gratis, sin API
 *  key, atribución obligatoria incluida vía el control de Leaflet. */
const SATELLITE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const SATELLITE_ATTRIBUTION =
  "Tiles &copy; Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community";

export function SiteMap({ areas, alertAt }: { areas: SiteMapArea[]; alertAt: number }) {
  const router = useRouter();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<import("leaflet").Map | null>(null);
  const layerGroupRef = React.useRef<import("leaflet").LayerGroup | null>(null);
  // Señal de React (no solo un ref) de que el mapa base ya existe — el
  // efecto de polígonos depende de esto para volver a correr cuando el
  // import async de Leaflet termine, algo que un ref solo no dispara.
  const [ready, setReady] = React.useState(false);

  // Mapa base: se crea UNA vez. La capa satelital de Esri no cambia con los
  // datos, separarla evita recrear los tiles cada vez que cambia ocupación.
  // `destroyed` es local a CADA invocación del efecto — en StrictMode (dev)
  // un efecto async se monta/desmonta/remonta antes de resolver, y sin este
  // flag por-invocación la resolución vieja podía pisar el mapa nuevo.
  React.useEffect(() => {
    if (!containerRef.current) return;
    let destroyed = false;
    let map: import("leaflet").Map | null = null;
    import("leaflet").then((L) => {
      if (destroyed || !containerRef.current) return;
      map = L.map(containerRef.current, {
        attributionControl: true,
        minZoom: 15,
        maxZoom: 21,
      });
      L.tileLayer(SATELLITE_URL, {
        attribution: SATELLITE_ATTRIBUTION,
        maxZoom: 21,
        maxNativeZoom: 19,
      }).addTo(map);
      const bounds = L.latLngBounds(toLatLng([...HARDENING]) as unknown as [number, number][]);
      map.fitBounds(bounds, { padding: [24, 24] });
      layerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      destroyed = true;
      map?.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      setReady(false);
    };
  }, []);

  // Polígonos: se redibujan cuando el mapa queda listo o cambian las
  // áreas/ocupación, sin tocar el mapa base ni los tiles.
  React.useEffect(() => {
    if (!ready || !layerGroupRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !layerGroupRef.current) return;
      layerGroupRef.current.clearLayers();

      L.polygon(toLatLng(HARDENING) as unknown as [number, number][], {
        fill: false,
        color: "#e2e2e2",
        weight: 2,
        dashArray: "6 5",
      })
        .bindTooltip("Hardening", { permanent: true, direction: "center", className: "site-map-label" })
        .addTo(layerGroupRef.current);

      for (const a of areas) {
        if (!a.geometry) continue;
        const polygon = L.polygon(toLatLng(a.geometry) as unknown as [number, number][], {
          fillColor: heatFill(a.pct, alertAt),
          fillOpacity: 0.6,
          color: "#1e1e1e",
          weight: 1.5,
        });
        polygon.bindTooltip(
          `${a.name} · ${Math.round(a.pct)}% (${a.occupiedTrays.toLocaleString("es-CL")}/${a.capacityTrays.toLocaleString("es-CL")} band.)`,
          { sticky: true },
        );
        polygon.on("mouseover", () => polygon.setStyle({ color: "#185FA5", weight: 3 }));
        polygon.on("mouseout", () => polygon.setStyle({ color: "#1e1e1e", weight: 1.5 }));
        polygon.on("click", () => router.push(`/planner/sector/${a.id}`));
        polygon.addTo(layerGroupRef.current!);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, areas, alertAt, router]);

  return (
    <div className="space-y-3">
      <div
        ref={containerRef}
        className="h-[460px] w-full overflow-hidden rounded-lg border bg-card [&_.leaflet-tooltip.site-map-label]:border-none [&_.leaflet-tooltip.site-map-label]:bg-transparent [&_.leaflet-tooltip.site-map-label]:text-white [&_.leaflet-tooltip.site-map-label]:shadow-none"
      />
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
