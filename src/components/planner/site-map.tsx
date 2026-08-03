"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  MousePointerClick,
  X,
} from "lucide-react";
import "leaflet/dist/leaflet.css";

import { Slider } from "@/components/ui/slider";
import { HEAT_LEGEND, heatFill } from "@/lib/planner/heat";
import {
  getSectorWeekKpis,
  type SectorWeekKpis,
} from "@/lib/actions/planner-sector-kpis";
import type { SiteMapArea, SiteMapWeek } from "@/lib/planner/site-map-data";

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

const pctOf = (occupied: number, capacity: number) =>
  capacity ? (occupied / capacity) * 100 : 0;

/** Borde del polígono. El seleccionado se queda marcado aunque el mouse se
 *  vaya; el hover es el mismo azul más delgado. */
const BORDER = {
  base: { color: "#1e1e1e", weight: 1.5 },
  hover: { color: "#185FA5", weight: 3 },
  selected: { color: "#185FA5", weight: 4.5 },
};

const num = (n: number) => n.toLocaleString("es-CL");

/** Mismos colores que la barra de KPI del sector, para que el lenguaje visual
 *  no cambie al saltar del mapa al layout. */
const KPI_COLOR = {
  hoy: "#2f9e44",
  ingresos: "#EF9F27",
  salidas: "#8b5cf6",
};

/** Fecha del snapshot → "27-jul". Mismo formato que la barra del sector.
 *  Ojo: `snapshotDate` es el `created_at` del upload (timestamp completo), no
 *  una fecha suelta — concatenarle "T00:00:00" lo dejaba inválido. */
const shortDate = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "short" });
};

export function SiteMap({
  areas,
  undelimited,
  weeks,
  currentIndex,
  alertAt,
  base,
  simIds,
}: {
  areas: SiteMapArea[];
  undelimited: SiteMapArea[];
  weeks: SiteMapWeek[];
  currentIndex: number;
  alertAt: number;
  /** qué está mirando el usuario: su mesa de trabajo o el plan vigente puro */
  base: "plan" | "working";
  /** simulaciones cargadas — los KPI deben incluirlas igual que el mapa */
  simIds: number[];
}) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<import("leaflet").Map | null>(null);
  const layerGroupRef = React.useRef<import("leaflet").LayerGroup | null>(null);
  const resizeObsRef = React.useRef<ResizeObserver | null>(null);
  /** polígono por área: se dibuja una vez y luego solo se le cambia el color,
   *  para que arrastrar el slider no recree la capa entera en cada paso. */
  const polysRef = React.useRef(new Map<number, import("leaflet").Polygon>());
  const [weekIdx, setWeekIdx] = React.useState(currentIndex);
  const week = weeks[Math.min(weekIdx, weeks.length - 1)] ?? null;
  // Clic en un sector: abre la ficha lateral, NO navega. Entrar al layout es
  // una acción aparte (botón de la ficha).
  const [selectedId, setSelectedId] = React.useState<number | null>(null);
  /** los handlers de hover de Leaflet viven fuera de React y necesitan saber
   *  cuál está seleccionado para no borrarle el borde al salir el mouse */
  const selectedRef = React.useRef<number | null>(null);
  // Señal de React (no solo un ref) de que el mapa base ya existe — el
  // efecto de polígonos depende de esto para volver a correr cuando el
  // import async de Leaflet termine, algo que un ref solo no dispara.
  const [ready, setReady] = React.useState(false);
  // El encuadre se hace UNA vez, con la geometría ya dibujada: si se
  // reajustara en cada cambio de ocupación, el mapa saltaría solo mientras el
  // usuario navega.
  const fittedRef = React.useRef(false);

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
      layerGroupRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      // Leaflet mide el contenedor UNA vez, al crearse, y calcula qué tiles
      // pedir a partir de eso. Si el alto cambia después (el clamp depende del
      // viewport, y la barra del slider crece cuando aparece el aviso de
      // colapso), el mapa se queda con el tamaño viejo y deja el área nueva en
      // gris. El observer le avisa.
      const ro = new ResizeObserver(() => map?.invalidateSize());
      if (containerRef.current) ro.observe(containerRef.current);
      resizeObsRef.current = ro;
      setReady(true);
    });
    return () => {
      destroyed = true;
      resizeObsRef.current?.disconnect();
      resizeObsRef.current = null;
      map?.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      fittedRef.current = false;
      setReady(false);
    };
  }, []);

  // Repintado por semana: NO recrea nada, solo cambia relleno y tooltip de los
  // polígonos ya dibujados. Va en un callback aparte porque lo llaman dos
  // caminos — el efecto de dibujo (cuando los polígonos recién nacen) y el
  // efecto de abajo (cada vez que el slider mueve la semana).
  const paint = React.useCallback(() => {
    selectedRef.current = selectedId;
    for (const a of areas) {
      const polygon = polysRef.current.get(a.id);
      if (!polygon) continue;
      const occupied = week?.occupied[String(a.id)] ?? 0;
      const pct = pctOf(occupied, a.capacityTrays);
      polygon.setStyle({
        fillColor: heatFill(pct, alertAt),
        ...(a.id === selectedId ? BORDER.selected : BORDER.base),
      });
      // Solo nombre y % — el detalle (bandejas, semana) ya está en la ficha
      // lateral y en la barra del slider; repetirlo hacía un tooltip largo que
      // tapaba medio plano.
      polygon.setTooltipContent(`${a.name} · ${Math.round(pct)}%`);
    }
  }, [areas, week, alertAt, selectedId]);
  const paintRef = React.useRef(paint);
  React.useEffect(() => {
    paintRef.current = paint;
    paint();
  }, [paint]);

  // Polígonos: se redibujan cuando el mapa queda listo o cambian las áreas,
  // sin tocar el mapa base ni los tiles. La OCUPACIÓN no está en las deps a
  // propósito — la pinta `paint`, que no recrea capas.
  React.useEffect(() => {
    if (!ready || !layerGroupRef.current) return;
    let cancelled = false;
    import("leaflet").then((L) => {
      if (cancelled || !layerGroupRef.current) return;
      layerGroupRef.current.clearLayers();
      polysRef.current.clear();

      // Sin rótulo: el tooltip permanente quedaba flotando en el centro,
      // encima de los sectores. La línea punteada ya comunica la agrupación.
      L.polygon(toLatLng(HARDENING) as unknown as [number, number][], {
        fill: false,
        color: "#e2e2e2",
        weight: 2,
        dashArray: "6 5",
      }).addTo(layerGroupRef.current);

      for (const a of areas) {
        if (!a.geometry) continue;
        const polygon = L.polygon(toLatLng(a.geometry) as unknown as [number, number][], {
          fillOpacity: 0.6,
          color: "#1e1e1e",
          weight: 1.5,
        });
        polygon.bindTooltip(a.name, { sticky: true });
        polygon.on("mouseover", () => {
          if (selectedRef.current !== a.id) polygon.setStyle(BORDER.hover);
        });
        polygon.on("mouseout", () => {
          polygon.setStyle(selectedRef.current === a.id ? BORDER.selected : BORDER.base);
        });
        polygon.on("click", () => setSelectedId(a.id));
        polygon.addTo(layerGroupRef.current!);
        polysRef.current.set(a.id, polygon);
      }
      // Color y texto de la semana vigente del slider: los polígonos nacen sin
      // relleno y `paint` es quien se los da, acá y en cada movimiento.
      paintRef.current();

      // Encuadre sobre TODO lo dibujado (Hardening + sectores): antes se
      // ajustaba sólo al polígono Hardening, así que cualquier sector fuera de
      // él quedaba cortado y el sitio se veía más chico de lo necesario.
      if (!fittedRef.current && mapRef.current) {
        const rings = [HARDENING, ...areas.map((a) => a.geometry).filter(Boolean)];
        const bounds = L.latLngBounds(
          rings.flatMap((r) => toLatLng(r as [number, number][])) as unknown as [
            number,
            number,
          ][],
        );
        if (bounds.isValid()) {
          mapRef.current.fitBounds(bounds, { padding: [16, 16] });
          fittedRef.current = true;
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ready, areas]);

  // Colapso = alguna área sobre el 100% de su capacidad: el plan de esa semana
  // no cabe, hay lotes sin dónde ir. Se calcula sobre TODAS las áreas (también
  // las que no tienen polígono) porque el problema existe igual aunque no se
  // pueda pintar en el mapa.
  const collapseByIndex = React.useMemo(() => {
    const all = [...areas, ...undelimited];
    const map = new Map<number, { id: number; name: string; pct: number }[]>();
    weeks.forEach((w, i) => {
      const over = all
        .map((a) => ({
          id: a.id,
          name: a.name,
          pct: pctOf(w.occupied[String(a.id)] ?? 0, a.capacityTrays),
        }))
        .filter((x) => x.pct > 100)
        .sort((x, y) => y.pct - x.pct);
      if (over.length) map.set(i, over);
    });
    return map;
  }, [areas, undelimited, weeks]);
  const collapseNow = collapseByIndex.get(weekIdx) ?? null;

  // Ficha del sector elegido, toda derivada de la serie que ya está en el
  // cliente: ocupación de la semana, cambio respecto de la anterior, peak del
  // horizonte y semanas en que el plan no cabe.
  /** Deselecciona y suelta el foco del polígono: si el `<path>` se queda
   *  enfocado, el navegador le deja su anillo aunque la ficha ya se cerró. */
  const deselect = React.useCallback(() => {
    setSelectedId(null);
    const active = document.activeElement;
    if (active instanceof HTMLElement || active instanceof SVGElement) {
      if (active.closest(".leaflet-container")) active.blur();
    }
  }, []);

  // Escape deselecciona, igual que en el plano de sector. Solo el teclado: en
  // el mapa un clic fuera del polígono es panear, no "salir de la selección".
  React.useEffect(() => {
    if (selectedId === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") deselect();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId, deselect]);

  const selected = React.useMemo(() => {
    const area =
      areas.find((a) => a.id === selectedId) ??
      undelimited.find((a) => a.id === selectedId) ??
      null;
    if (!area || !week) return null;
    const occupied = week.occupied[String(area.id)] ?? 0;
    return { area, occupied, pct: pctOf(occupied, area.capacityTrays) };
  }, [areas, undelimited, selectedId, week]);

  // Hoy / Ingresos / Salidas son sumas por MESÓN, así que no salen de la serie
  // del mapa (que es por área): se piden al servidor para el sector abierto,
  // con la misma fórmula del layout. El debounce evita una request por paso
  // mientras se arrastra el slider.
  const campaignWeek = week?.campaignWeek ?? null;
  const simKey = simIds.join(",");
  // El resultado se guarda junto a la clave que lo pidió y se compara al
  // renderizar. Así no hay que limpiarlo con un setState al vuelo cuando el
  // usuario cambia de sector o de semana: lo viejo simplemente deja de
  // calzar, y de paso las respuestas que llegan tarde no pisan a las nuevas.
  const kpiKey =
    selectedId !== null && campaignWeek !== null
      ? `${selectedId}:${campaignWeek}:${base}:${simKey}`
      : null;
  const [kpiState, setKpiState] = React.useState<{
    key: string;
    kpis: SectorWeekKpis | null;
    error: string | null;
  } | null>(null);
  const fresh = kpiState && kpiState.key === kpiKey ? kpiState : null;
  const kpis = fresh?.kpis ?? null;
  const kpisError = fresh?.error ?? null;

  React.useEffect(() => {
    if (!kpiKey || selectedId === null || campaignWeek === null) return;
    let alive = true;
    // Debounce: arrastrar el slider no dispara una request por paso.
    const timer = setTimeout(() => {
      getSectorWeekKpis(selectedId, campaignWeek, {
        base,
        simIds: simKey ? simKey.split(",").map(Number) : [],
      })
        .then((r) => {
          if (!alive) return;
          setKpiState({
            key: kpiKey,
            kpis: r.ok ? r.kpis : null,
            error: r.ok ? null : r.error,
          });
        })
        .catch(() => {
          if (alive) {
            setKpiState({ key: kpiKey, kpis: null, error: "No se pudieron cargar." });
          }
        });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [kpiKey, selectedId, campaignWeek, base, simKey]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_264px]">
      <div className="space-y-3">
        {weeks.length > 1 && week ? (
          <div className="rounded-lg border bg-card px-4 py-2.5">
            <div className="flex items-center gap-4">
              <div className="w-[124px] shrink-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold tabular-nums">{week.label}</span>
                  {week.isCurrent ? (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      hoy
                    </span>
                  ) : null}
                </div>
                <div className="text-[11px] capitalize text-muted-foreground">
                  {week.monthLabel}
                </div>
              </div>
              <div className="relative flex-1">
                {/* Alto de 44px: el área táctil manda, la pista sigue siendo fina. */}
                <Slider
                  min={0}
                  max={weeks.length - 1}
                  step={1}
                  value={weekIdx}
                  onValueChange={(v) => setWeekIdx(Array.isArray(v) ? (v[0] ?? 0) : v)}
                  aria-label="Semana"
                  className="h-11"
                />
                {/* Marcas de colapso sobre la pista: dicen DÓNDE está el
                    problema sin tener que recorrer las 64 semanas a mano.
                    Sin eventos de puntero para no pelear con el slider. */}
                <div className="pointer-events-none absolute inset-x-0 top-1/2 mt-1.5 h-2">
                  {[...collapseByIndex.keys()].map((i) => (
                    <span
                      key={i}
                      className="absolute top-0 h-2 w-[3px] -translate-x-1/2 rounded-full bg-red-500"
                      style={{ left: `${(i / (weeks.length - 1)) * 100}%` }}
                    />
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWeekIdx(currentIndex)}
                disabled={weekIdx === currentIndex}
                className="flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
              >
                <CalendarClock className="h-3.5 w-3.5" /> Hoy
              </button>
            </div>

            {collapseNow ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Colapso
                </span>
                <span className="text-muted-foreground">— el plan no cabe en</span>
                {collapseNow.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedId(c.id)}
                    className="rounded-full border border-red-300 px-2 py-0.5 font-medium text-red-700 transition-colors hover:bg-red-50 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-950/40"
                  >
                    {c.name} {Math.round(c.pct)}%
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Alto por viewport: el mapa es el contenido de la página, quedarse en
            460px fijos dejaba media pantalla en blanco. */}
        {/* `relative z-0` NO es decorativo: Leaflet pinta sus paneles en
            z-index 400 y los controles en 1000, y sin un contexto de
            apilamiento propio esos valores compiten de igual a igual contra el
            topbar (z-40) y el drawer del nav (z-40) — el mapa les quedaba
            encima. Con el contenedor en z-0 todo lo de Leaflet queda contenido
            por debajo de cualquier capa de la app. */}
        {/* `:focus-visible:outline-none` en los polígonos: globals.css pinta el
            anillo de foco con el verde del tema (`* { outline-ring/50 }`), y en
            SVG ese anillo se dibuja como CAJA ENVOLVENTE — un rectángulo recto
            sobre polígonos rotados 45°, que además sobrevivía a la
            deselección. Los paths no son alcanzables con Tab (sin tabindex),
            así que no se pierde navegación por teclado: quien indica la
            selección es el borde azul grueso. */}
        <div
          ref={containerRef}
          className="relative z-0 h-[clamp(420px,calc(100vh-19rem),1000px)] w-full overflow-hidden rounded-lg border bg-card [&_.leaflet-interactive:focus-visible]:outline-none [&_.leaflet-interactive:focus]:outline-none"
        />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-muted-foreground">
          {HEAT_LEGEND.map((l) => (
            <span key={l.label} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${l.swatch}`} />
              {l.label.replace("{max}", String(Math.round(alertAt * 100)))}
            </span>
          ))}
          {collapseByIndex.size > 0 ? (
            <span className="flex items-center gap-1.5">
              <span className="h-2.5 w-[3px] rounded-full bg-red-500" />
              {collapseByIndex.size}{" "}
              {collapseByIndex.size === 1 ? "semana" : "semanas"} con colapso en el
              slider
            </span>
          ) : null}
        </div>
      </div>

      {/* Ficha del sector. Reemplaza al bloque "Sin delimitar en el KMZ": esas
          áreas (HFM) no tienen polígono que clickear, así que se ofrecen como
          accesos en el estado vacío — si no, quedarían sin puerta de entrada. */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        {selected ? (
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-semibold">{selected.area.name}</p>
                {/* Solo la semana: es el estado que cambia con el slider. La
                    capacidad baja con los KPI, que es contra lo que se leen. */}
                {week ? (
                  <span className="mt-1 inline-block rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-medium tabular-nums">
                    {week.label}
                  </span>
                ) : null}
              </div>
              <button
                type="button"
                onClick={deselect}
                aria-label="Cerrar"
                className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Los cuatro de la barra del sector. Hoy es la foto real del
                inventario (no cambia con la semana); Ingresos y Salidas son el
                movimiento bruto mesón a mesón contra esa foto; Neto cierra:
                Hoy − Salidas + Ingresos. */}
            <dl className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: KPI_COLOR.hoy }}
                  />
                  Hoy
                  {kpis?.snapshotDate ? (
                    <span className="text-[10px]">({shortDate(kpis.snapshotDate)})</span>
                  ) : null}
                </dt>
                <dd className="font-semibold tabular-nums">
                  {kpis ? (
                    <>
                      {num(kpis.realTrays)}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({Math.round(kpis.realPct)}%)
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: KPI_COLOR.ingresos }}
                  />
                  Ingresos
                </dt>
                <dd className="font-semibold tabular-nums">
                  {kpis ? num(kpis.enterTrays) : <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: KPI_COLOR.salidas }}
                  />
                  Salidas
                </dt>
                <dd className="font-semibold tabular-nums">
                  {kpis ? num(kpis.leaveTrays) : <span className="text-muted-foreground">—</span>}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 border-t pt-2">
                <dt className="flex items-center gap-1.5 text-muted-foreground">
                  <span className="h-2 w-2 rounded-full border border-muted-foreground/60" />
                  Neto
                </dt>
                <dd
                  className="font-semibold tabular-nums"
                  style={{ color: heatFill(selected.pct, alertAt) }}
                >
                  {num(selected.occupied)}{" "}
                  <span className="font-normal">({Math.round(selected.pct)}%)</span>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-2 text-xs">
                <dt className="text-muted-foreground">Capacidad</dt>
                <dd className="tabular-nums text-muted-foreground">
                  {num(selected.area.capacityTrays)} band.
                </dd>
              </div>
            </dl>
            {kpisError ? (
              <p className="text-[11px] text-muted-foreground">{kpisError}</p>
            ) : null}

            <Link
              href={`/planner/sector/${selected.area.id}${week ? `?week=${week.campaignWeek}` : ""}`}
              className="flex items-center justify-center gap-1.5 rounded-lg bg-foreground px-3 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Ir al layout <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        ) : (
          <div className="space-y-3 rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MousePointerClick className="h-4 w-4 shrink-0" />
              Clic en un sector del mapa para ver su ficha.
            </div>
            {undelimited.length > 0 ? (
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-[11px] text-muted-foreground">
                  Sin polígono en el KMZ
                </p>
                {undelimited.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setSelectedId(a.id)}
                    className="flex w-full items-baseline justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60"
                  >
                    <span className="font-medium">{a.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {Math.round(
                        pctOf(week?.occupied[String(a.id)] ?? 0, a.capacityTrays),
                      )}
                      %
                    </span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
