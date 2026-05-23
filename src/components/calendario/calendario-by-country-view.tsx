"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Globe2,
  Building2,
  CalendarDays,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CountryFlag } from "@/components/clientes/country-flag";
import type { CalendarEvent } from "@/lib/actions/analytics";

export type SpeciesOption = { id: string; name: string };

type Props = {
  events: CalendarEvent[];
  species: SpeciesOption[];
  initialIncludeOpps: boolean;
};

const numFmt = new Intl.NumberFormat("es-CL");

// Map ISO year+week to a date for the Monday of that ISO week (display only).
// Using the simple approximation: Jan 4 is always in week 1 of the ISO year.
function isoWeekToDate(year: number, week: number): Date {
  // Simple ISO week-to-date: Jan 4 of year is in week 1; find Monday of week 1, add (week-1)*7
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7; // 1..7 (Mon..Sun)
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target;
}

const MONTHS_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

function monthLabel(year: number, week: number): string {
  const d = isoWeekToDate(year, week);
  return MONTHS_ES[d.getUTCMonth()];
}

function weekDateRange(year: number, week: number): string {
  const monday = isoWeekToDate(year, week);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const fmt = (d: Date) => `${d.getUTCDate()}`;
  return `${fmt(monday)}–${fmt(sunday)}`;
}

export function CalendarioByCountryView({ events, species, initialIncludeOpps }: Props) {
  const [search, setSearch] = React.useState("");
  const [speciesId, setSpeciesId] = React.useState<string>("all");
  const [includeOpps, setIncludeOpps] = React.useState<boolean>(initialIncludeOpps);
  const [minProb, setMinProb] = React.useState<number>(0);
  const [yearFilter, setYearFilter] = React.useState<string>("all");
  const [drilldown, setDrilldown] = React.useState<{
    iso2: string | null;
    clientId: string | null;
  }>({ iso2: null, clientId: null });

  // Submit toggle changes via URL (so server query refetches with proper includeOpps)
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (includeOpps) sp.set("opps", "1");
    else sp.delete("opps");
    const next = `${window.location.pathname}?${sp.toString()}`;
    if (next !== window.location.pathname + "?" + window.location.search.slice(1)) {
      window.history.replaceState({}, "", next);
    }
  }, [includeOpps]);

  // Available years from events
  const years = React.useMemo(() => {
    const set = new Set<number>();
    for (const e of events) if (e.year != null) set.add(e.year);
    return Array.from(set).sort((a, b) => b - a);
  }, [events]);

  // Filter events client-side
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (!includeOpps && e.source_type !== "contract") return false;
      if (speciesId !== "all" && e.speciesId !== speciesId) return false;
      if (yearFilter !== "all" && String(e.year) !== yearFilter) return false;
      if (
        includeOpps &&
        e.source_type === "opportunity" &&
        minProb > 0 &&
        (e.probability_pct ?? 0) < minProb
      )
        return false;
      if (q.length > 0) {
        const hit =
          (e.clientName ?? "").toLowerCase().includes(q) ||
          (e.countryName ?? "").toLowerCase().includes(q) ||
          (e.varietyName ?? "").toLowerCase().includes(q) ||
          (e.speciesName ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [events, search, speciesId, includeOpps, yearFilter, minProb]);

  // Aggregate by country
  type CountryAgg = {
    iso2: string;
    name: string;
    deliveries: number;
    clients: Set<string>;
    plants: number;
    fromWeek: { y: number; w: number } | null;
    toWeek: { y: number; w: number } | null;
    pendingPlants: number;
    opportunityPlants: number;
  };
  const byCountry = React.useMemo(() => {
    const map = new Map<string, CountryAgg>();
    for (const e of filtered) {
      const iso2 = e.countryIso2 ?? "??";
      const name = e.countryName ?? "Sin país";
      let agg = map.get(iso2);
      if (!agg) {
        agg = {
          iso2,
          name,
          deliveries: 0,
          clients: new Set(),
          plants: 0,
          fromWeek: null,
          toWeek: null,
          pendingPlants: 0,
          opportunityPlants: 0,
        };
        map.set(iso2, agg);
      }
      const qty = Number(e.qty ?? 0);
      agg.deliveries += 1;
      if (e.client_id) agg.clients.add(e.client_id);
      agg.plants += qty;
      if (e.source_type === "opportunity") agg.opportunityPlants += qty;
      else agg.pendingPlants += qty;
      if (e.year != null && e.week != null) {
        const cur = { y: e.year, w: e.week };
        const curKey = cur.y * 100 + cur.w;
        if (!agg.fromWeek || agg.fromWeek.y * 100 + agg.fromWeek.w > curKey)
          agg.fromWeek = cur;
        if (!agg.toWeek || agg.toWeek.y * 100 + agg.toWeek.w < curKey)
          agg.toWeek = cur;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.plants - a.plants);
  }, [filtered]);

  // Aggregate by client within country
  type ClientAgg = {
    id: string;
    name: string;
    deliveries: number;
    plants: number;
    fromWeek: { y: number; w: number } | null;
    toWeek: { y: number; w: number } | null;
  };
  const clientsInCountry = React.useMemo(() => {
    if (!drilldown.iso2) return [] as ClientAgg[];
    const map = new Map<string, ClientAgg>();
    for (const e of filtered) {
      if (e.countryIso2 !== drilldown.iso2) continue;
      if (!e.client_id) continue;
      let agg = map.get(e.client_id);
      if (!agg) {
        agg = {
          id: e.client_id,
          name: e.clientName ?? "—",
          deliveries: 0,
          plants: 0,
          fromWeek: null,
          toWeek: null,
        };
        map.set(e.client_id, agg);
      }
      agg.deliveries += 1;
      agg.plants += Number(e.qty ?? 0);
      if (e.year != null && e.week != null) {
        const cur = { y: e.year, w: e.week };
        const curKey = cur.y * 100 + cur.w;
        if (!agg.fromWeek || agg.fromWeek.y * 100 + agg.fromWeek.w > curKey)
          agg.fromWeek = cur;
        if (!agg.toWeek || agg.toWeek.y * 100 + agg.toWeek.w < curKey)
          agg.toWeek = cur;
      }
    }
    return Array.from(map.values()).sort((a, b) => b.plants - a.plants);
  }, [filtered, drilldown.iso2]);

  // Events for the selected client, sorted by year+week
  const eventsForClient = React.useMemo(() => {
    if (!drilldown.clientId) return [] as CalendarEvent[];
    return filtered
      .filter((e) => e.client_id === drilldown.clientId)
      .sort((a, b) => {
        const ay = a.year ?? 0;
        const by = b.year ?? 0;
        if (ay !== by) return ay - by;
        return (a.week ?? 0) - (b.week ?? 0);
      });
  }, [filtered, drilldown.clientId]);

  const selectedCountryName = drilldown.iso2
    ? byCountry.find((c) => c.iso2 === drilldown.iso2)?.name ?? ""
    : "";
  const selectedClientName = drilldown.clientId
    ? eventsForClient[0]?.clientName ?? ""
    : "";

  // Totales summary header
  const totalPlants = filtered.reduce((s, e) => s + Number(e.qty ?? 0), 0);
  const totalDeliveries = filtered.length;
  const totalCountries = byCountry.length;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <div className="relative flex flex-1 min-w-[200px] items-center">
          <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar país, cliente, variedad o especie"
            className="pl-7"
          />
        </div>

        <Select value={speciesId} onValueChange={(v) => setSpeciesId(String(v ?? "all"))}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="Especie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las especies</SelectItem>
            {species.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {years.length > 0 ? (
          <Select value={yearFilter} onValueChange={(v) => setYearFilter(String(v ?? "all"))}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los años</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}

        <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Oportunidades</span>
          <Switch checked={includeOpps} onCheckedChange={setIncludeOpps} />
        </div>

        {includeOpps ? (
          <Select value={String(minProb)} onValueChange={(v) => setMinProb(Number(v))}>
            <SelectTrigger className="h-8 w-36">
              <SelectValue placeholder="Prob. mínima" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">Prob. ≥ 0%</SelectItem>
              <SelectItem value="25">Prob. ≥ 25%</SelectItem>
              <SelectItem value="50">Prob. ≥ 50%</SelectItem>
              <SelectItem value="70">Prob. ≥ 70%</SelectItem>
              <SelectItem value="90">Prob. ≥ 90%</SelectItem>
            </SelectContent>
          </Select>
        ) : null}
      </div>

      {/* Summary */}
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <span>
          <strong className="text-foreground font-mono tabular-nums">
            {numFmt.format(totalPlants)}
          </strong>{" "}
          plantas
        </span>
        <span>·</span>
        <span>
          <strong className="text-foreground font-mono tabular-nums">
            {numFmt.format(totalDeliveries)}
          </strong>{" "}
          entregas
        </span>
        <span>·</span>
        <span>
          <strong className="text-foreground font-mono tabular-nums">
            {numFmt.format(totalCountries)}
          </strong>{" "}
          países
        </span>
        {includeOpps ? (
          <Badge variant="outline" className="ml-2 text-[10px]">
            Incluye oportunidades
          </Badge>
        ) : null}
      </div>

      {/* Breadcrumb */}
      {drilldown.iso2 || drilldown.clientId ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => setDrilldown({ iso2: null, clientId: null })}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Globe2 className="h-3.5 w-3.5" />
            Países
          </button>
          {drilldown.iso2 ? (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <button
                type="button"
                onClick={() => setDrilldown({ iso2: drilldown.iso2, clientId: null })}
                className={
                  drilldown.clientId
                    ? "hover:text-foreground"
                    : "font-medium text-foreground"
                }
              >
                {selectedCountryName}
              </button>
            </>
          ) : null}
          {drilldown.clientId ? (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="font-medium text-foreground">{selectedClientName}</span>
            </>
          ) : null}
        </div>
      ) : null}

      {/* Body */}
      {!drilldown.iso2 ? (
        <CountryGrid
          countries={byCountry}
          onSelect={(iso2) => setDrilldown({ iso2, clientId: null })}
        />
      ) : !drilldown.clientId ? (
        <ClientListForCountry
          clients={clientsInCountry}
          onBack={() => setDrilldown({ iso2: null, clientId: null })}
          onSelect={(id) => setDrilldown({ iso2: drilldown.iso2, clientId: id })}
        />
      ) : (
        <DeliveriesForClient
          events={eventsForClient}
          onBack={() => setDrilldown({ iso2: drilldown.iso2, clientId: null })}
        />
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay entregas para los filtros aplicados.
        </div>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------------

function CountryGrid({
  countries,
  onSelect,
}: {
  countries: {
    iso2: string;
    name: string;
    deliveries: number;
    clients: Set<string>;
    plants: number;
    fromWeek: { y: number; w: number } | null;
    toWeek: { y: number; w: number } | null;
    pendingPlants: number;
    opportunityPlants: number;
  }[];
  onSelect: (iso2: string) => void;
}) {
  if (countries.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {countries.map((c) => (
        <button
          key={c.iso2}
          type="button"
          onClick={() => onSelect(c.iso2)}
          className="group rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">
                <CountryFlag iso2={c.iso2} />
              </span>
              <span className="text-base font-semibold">{c.name}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">Plantas</div>
              <div className="font-mono text-lg font-semibold tabular-nums">
                {numFmt.format(c.plants)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Entregas</div>
              <div className="font-mono text-lg font-semibold tabular-nums">
                {numFmt.format(c.deliveries)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Clientes</div>
              <div className="font-mono text-sm font-medium tabular-nums">
                {numFmt.format(c.clients.size)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Período</div>
              <div className="font-mono text-sm font-medium tabular-nums">
                {c.fromWeek && c.toWeek
                  ? `S${c.fromWeek.w}/${String(c.fromWeek.y).slice(-2)} – S${c.toWeek.w}/${String(c.toWeek.y).slice(-2)}`
                  : "—"}
              </div>
            </div>
          </div>
          {c.opportunityPlants > 0 ? (
            <div className="mt-3 flex items-center gap-1 text-[10px] text-muted-foreground">
              <Sparkles className="h-3 w-3" />
              {numFmt.format(c.opportunityPlants)} de oportunidades
            </div>
          ) : null}
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------

function ClientListForCountry({
  clients,
  onBack,
  onSelect,
}: {
  clients: {
    id: string;
    name: string;
    deliveries: number;
    plants: number;
    fromWeek: { y: number; w: number } | null;
    toWeek: { y: number; w: number } | null;
  }[];
  onBack: () => void;
  onSelect: (clientId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Volver a países
        </Button>
        <Badge variant="secondary">{clients.length} clientes</Badge>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <th className="px-3 py-2 text-left font-medium">Cliente</th>
            <th className="px-3 py-2 text-right font-medium">Plantas</th>
            <th className="px-3 py-2 text-right font-medium">Entregas</th>
            <th className="px-3 py-2 text-left font-medium">Período</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="cursor-pointer border-b last:border-b-0 hover:bg-muted/50"
            >
              <td className="px-3 py-2 font-medium">{c.name}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {numFmt.format(c.plants)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {numFmt.format(c.deliveries)}
              </td>
              <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                {c.fromWeek && c.toWeek
                  ? `S${c.fromWeek.w}/${String(c.fromWeek.y).slice(-2)} – S${c.toWeek.w}/${String(c.toWeek.y).slice(-2)}`
                  : "—"}
              </td>
              <td className="px-3 text-muted-foreground">
                <ChevronRight className="h-4 w-4" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ----------------------------------------------------------------------------

function DeliveriesForClient({
  events,
  onBack,
}: {
  events: CalendarEvent[];
  onBack: () => void;
}) {
  // Group by year+week for cleaner display with month band
  type WeekGroup = {
    year: number;
    week: number;
    month: string;
    items: CalendarEvent[];
    totalPlants: number;
  };
  const groups: WeekGroup[] = React.useMemo(() => {
    const map = new Map<string, WeekGroup>();
    for (const e of events) {
      if (e.year == null || e.week == null) continue;
      const key = `${e.year}-${e.week}`;
      let g = map.get(key);
      if (!g) {
        g = {
          year: e.year,
          week: e.week,
          month: monthLabel(e.year, e.week),
          items: [],
          totalPlants: 0,
        };
        map.set(key, g);
      }
      g.items.push(e);
      g.totalPlants += Number(e.qty ?? 0);
    }
    return Array.from(map.values()).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.week - b.week;
    });
  }, [events]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Volver a clientes
        </Button>
        <Badge variant="secondary">
          <CalendarDays className="mr-1 h-3 w-3" />
          {groups.length} semanas
        </Badge>
      </div>

      <div className="divide-y">
        {groups.map((g) => (
          <div key={`${g.year}-${g.week}`} className="px-3 py-3">
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-10 w-12 flex-col items-center justify-center rounded-md border bg-muted/50 font-mono text-xs">
                <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
                  {g.month}
                </span>
                <span className="text-sm font-semibold">S{g.week}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {weekDateRange(g.year, g.week)} de {g.year}
              </div>
              <Badge variant="outline" className="ml-auto font-mono">
                {numFmt.format(g.totalPlants)} plantas
              </Badge>
            </div>
            <table className="w-full text-sm">
              <thead className="text-[10px] text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 text-left font-medium">Variedad</th>
                  <th className="px-2 py-1 text-left font-medium">Especie</th>
                  <th className="px-2 py-1 text-right font-medium">Plantas</th>
                  <th className="px-2 py-1 text-left font-medium">Origen</th>
                  <th className="px-2 py-1 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => (
                  <tr key={`${it.source_type}-${it.source_id}`} className="border-t">
                    <td className="px-2 py-1.5 font-medium">{it.varietyName ?? "—"}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">
                      {it.speciesName ?? "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {numFmt.format(Number(it.qty ?? 0))}
                    </td>
                    <td className="px-2 py-1.5">
                      {it.source_type === "opportunity" ? (
                        <Link
                          href={`/oportunidades/${it.source_id}`}
                          className="inline-flex items-center gap-1 text-amber-600 hover:underline dark:text-amber-400"
                        >
                          <Sparkles className="h-3 w-3" />
                          Oportunidad
                          {it.probability_pct != null ? ` ${it.probability_pct}%` : ""}
                        </Link>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Building2 className="h-3 w-3" />
                          Contrato
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-xs text-muted-foreground">
                      {it.status ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
