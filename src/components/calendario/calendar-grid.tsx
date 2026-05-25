"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ExternalLink,
  Search,
  Sigma,
  Sparkles,
  Building2,
} from "lucide-react";
import {
  KAM_STATUS_GROUPS,
  matchesKamStatuses,
  type KamStatusKey,
} from "@/lib/kam-status";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CountryFlag } from "@/components/clientes/country-flag";
import type { CalendarEvent } from "@/lib/actions/analytics";

export type SpeciesOption = { id: string; name: string };

type Props = {
  events: CalendarEvent[];
  species: SpeciesOption[];
  initialIncludeOpps: boolean;
  visibleWeeks?: number; // default 6
  visibleMonths?: number; // default 6
};

type ViewMode = "week" | "month";

const numFmt = new Intl.NumberFormat("es-CL");
const MONTHS_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

// ISO week math helpers
function isoWeekToMonday(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return monday;
}

function isoWeekFromDate(d: Date): { year: number; week: number } {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return { year: date.getUTCFullYear(), week };
}

function weekKey(year: number, week: number): number {
  return year * 100 + week;
}

function addWeeks(year: number, week: number, delta: number): { year: number; week: number } {
  const monday = isoWeekToMonday(year, week);
  monday.setUTCDate(monday.getUTCDate() + delta * 7);
  return isoWeekFromDate(monday);
}

function formatWeekRange(year: number, week: number): { label: string; subLabel: string; month: string } {
  const monday = isoWeekToMonday(year, week);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const startMonth = monday.getUTCMonth();
  const endMonth = sunday.getUTCMonth();
  const monthLabel =
    startMonth === endMonth ? MONTHS_ES[startMonth] : `${MONTHS_ES[startMonth]}/${MONTHS_ES[endMonth]}`;
  return {
    label: `Wk${week}`,
    subLabel: `${monday.getUTCDate()}–${sunday.getUTCDate()}`,
    month: monthLabel,
  };
}

export function CalendarGrid({
  events,
  species,
  initialIncludeOpps,
  // Periodos iniciales — el infinite scroll va agregando más al hacer scroll
  // hacia el final del grid.
  visibleWeeks = 10,
  visibleMonths = 6,
}: Props) {
  // Filters
  const [search, setSearch] = React.useState("");
  const [speciesId, setSpeciesId] = React.useState<string>("all");
  const [includeOpps, setIncludeOpps] = React.useState<boolean>(initialIncludeOpps);
  const [minProb, setMinProb] = React.useState<number>(0);
  const [viewMode, setViewMode] = React.useState<ViewMode>("week");
  // Status filter para contratos. Default: Activos + Por firmar (planning
  // realista — borradores son compromisos reales que pronto serán firmados).
  // Las oportunidades NO pasan por este filtro — usan el toggle `includeOpps`
  // + `minProb`.
  const [contractStatuses, setContractStatuses] = React.useState<Set<KamStatusKey>>(
    () => new Set(["activos", "por_firmar"]),
  );
  // Filtro vía leyenda: ocultar condiciones específicas (venta/muestra/reposicion).
  const [hiddenConditions, setHiddenConditions] = React.useState<Set<string>>(
    () => new Set(),
  );
  // Infinite scroll: cuántos periodos extras agregamos sobre el inicial.
  // Se incrementa cuando el sentinel del final entra en viewport.
  const [extraPeriods, setExtraPeriods] = React.useState(0);

  // Current week (anchor); render weeks [anchor, anchor + visibleWeeks - 1]
  const today = React.useMemo(() => isoWeekFromDate(new Date()), []);
  const [anchor, setAnchor] = React.useState<{ year: number; week: number }>(today);

  // Side sheet
  const [drillCell, setDrillCell] = React.useState<{
    iso2: string;
    countryName: string;
    year: number;
    week: number;
  } | null>(null);

  // Sync includeOpps to URL (no reload)
  React.useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (includeOpps) sp.set("opps", "1");
    else sp.delete("opps");
    window.history.replaceState({}, "", `${window.location.pathname}?${sp.toString()}`);
  }, [includeOpps]);

  // Compute visible week range (incluye los periodos extra de infinite scroll)
  const totalVisibleWeeks = visibleWeeks + extraPeriods;
  const weeks = React.useMemo(() => {
    const arr: { year: number; week: number }[] = [];
    let cur = anchor;
    for (let i = 0; i < totalVisibleWeeks; i++) {
      arr.push(cur);
      cur = addWeeks(cur.year, cur.week, 1);
    }
    return arr;
  }, [anchor, totalVisibleWeeks]);

  const weekKeys = React.useMemo(() => weeks.map((w) => weekKey(w.year, w.week)), [weeks]);

  // Compute visible month range — anchor's month is the first
  type MonthCol = { year: number; month: number /* 0-11 */ };
  const anchorMonth = React.useMemo<MonthCol>(() => {
    const monday = isoWeekToMonday(anchor.year, anchor.week);
    return { year: monday.getUTCFullYear(), month: monday.getUTCMonth() };
  }, [anchor]);
  const totalVisibleMonths = visibleMonths + extraPeriods;
  const months = React.useMemo<MonthCol[]>(() => {
    const arr: MonthCol[] = [];
    let y = anchorMonth.year;
    let m = anchorMonth.month;
    for (let i = 0; i < totalVisibleMonths; i++) {
      arr.push({ year: y, month: m });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return arr;
  }, [anchorMonth, totalVisibleMonths]);
  const monthKeys = React.useMemo(
    () => months.map((m) => m.year * 100 + m.month),
    [months],
  );
  const monthKeyOf = (year: number, week: number): number => {
    const monday = isoWeekToMonday(year, week);
    return monday.getUTCFullYear() * 100 + monday.getUTCMonth();
  };
  const todayMonthKey = anchorMonth.year * 100 + anchorMonth.month; // for "Hoy" badge logic later
  const isCurrentMonth = (m: MonthCol) => {
    const t = today;
    const tMonday = isoWeekToMonday(t.year, t.week);
    return m.year === tMonday.getUTCFullYear() && m.month === tMonday.getUTCMonth();
  };
  // Reference todayMonthKey so TS doesn't complain (used implicitly via isCurrentMonth)
  void todayMonthKey;

  // Filter events
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (!includeOpps && e.source_type !== "contract") return false;
      // Status filter aplica solo a contratos, sobre el status del CONTRATO
      // padre (no del item de entrega que es pendiente/finalizado/etc).
      if (
        e.source_type === "contract" &&
        !matchesKamStatuses(e.contract_status, contractStatuses)
      )
        return false;
      // Filtro vía leyenda: ocultar condiciones específicas
      if (
        e.source_type === "contract" &&
        hiddenConditions.has(e.contract_condition ?? "venta")
      )
        return false;
      if (e.source_type === "opportunity" && hiddenConditions.has("opp"))
        return false;
      if (speciesId !== "all" && e.speciesId !== speciesId) return false;
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
      if (e.year == null || e.week == null) return false;
      // No considerar periodos pasados — el calendario es de planning a futuro.
      if (
        e.year < today.year ||
        (e.year === today.year && e.week < today.week)
      )
        return false;
      // Must be in visible range (week or month depending on mode)
      if (viewMode === "week") {
        if (!weekKeys.includes(weekKey(e.year, e.week))) return false;
      } else {
        if (!monthKeys.includes(monthKeyOf(e.year, e.week))) return false;
      }
      return true;
    });
  }, [
    events,
    search,
    speciesId,
    includeOpps,
    minProb,
    viewMode,
    weekKeys,
    monthKeys,
    contractStatuses,
    hiddenConditions,
    today,
  ]);

  // Eventos que pasan los filtros (búsqueda/especie/status/opps/minProb)
  // pero SIN la restricción de rango visible — para KPIs por año.
  // Excluye periodos pasados (calendario = planning, no histórico).
  const eventsAllPeriods = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (!includeOpps && e.source_type !== "contract") return false;
      if (
        e.source_type === "contract" &&
        !matchesKamStatuses(e.contract_status, contractStatuses)
      )
        return false;
      // Filtro vía leyenda: ocultar condiciones
      if (
        e.source_type === "contract" &&
        hiddenConditions.has(e.contract_condition ?? "venta")
      )
        return false;
      if (e.source_type === "opportunity" && hiddenConditions.has("opp"))
        return false;
      if (speciesId !== "all" && e.speciesId !== speciesId) return false;
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
      if (e.year == null || e.week == null) return false;
      if (
        e.year < today.year ||
        (e.year === today.year && e.week < today.week)
      )
        return false;
      return true;
    });
  }, [
    events,
    search,
    speciesId,
    includeOpps,
    minProb,
    contractStatuses,
    hiddenConditions,
    today,
  ]);

  // KPIs por año (total entregas + plantas por año).
  const kpis = React.useMemo(() => {
    const byYear = new Map<number, number>();
    let total = 0;
    for (const e of eventsAllPeriods) {
      const y = e.year as number;
      const qty = Number(e.qty ?? 0);
      byYear.set(y, (byYear.get(y) ?? 0) + qty);
      total += qty;
    }
    const years = Array.from(byYear.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, plants]) => ({ year, plants }));
    return { total, years };
  }, [eventsAllPeriods]);

  // Universe of countries: derived from ALL events (any week), not filtered ones.
  // This way the country list stays stable as user navigates weeks.
  const allCountries = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const e of events) {
      const iso2 = e.countryIso2 ?? "??";
      const name = e.countryName ?? "Sin país";
      if (!map.has(iso2)) map.set(iso2, name);
    }
    return Array.from(map.entries())
      .map(([iso2, name]) => ({ iso2, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  // For each country, group its filtered events by week or month
  type CountryRow = {
    iso2: string;
    name: string;
    byKey: Map<number, CalendarEvent[]>;
  };
  const countryRows: CountryRow[] = React.useMemo(() => {
    const map = new Map<string, CountryRow>();
    for (const c of allCountries) {
      map.set(c.iso2, { iso2: c.iso2, name: c.name, byKey: new Map() });
    }
    for (const e of filtered) {
      const iso2 = e.countryIso2 ?? "??";
      const row = map.get(iso2);
      if (!row) continue;
      const k =
        viewMode === "week"
          ? weekKey(e.year ?? 0, e.week ?? 0)
          : monthKeyOf(e.year ?? 0, e.week ?? 0);
      const bucket = row.byKey.get(k) ?? [];
      bucket.push(e);
      row.byKey.set(k, bucket);
    }
    return Array.from(map.values());
  }, [allCountries, filtered, viewMode]);

  // Totales por columna (plantas) — usado en la fila inferior "Total".
  // Se recalcula cuando cambia el modo de vista o los filtros.
  const columnTotals = React.useMemo(() => {
    const totals = new Map<number, number>();
    for (const e of filtered) {
      if (e.year == null || e.week == null) continue;
      const key =
        viewMode === "week"
          ? weekKey(e.year, e.week)
          : monthKeyOf(e.year, e.week);
      totals.set(key, (totals.get(key) ?? 0) + Number(e.qty ?? 0));
    }
    return totals;
  }, [filtered, viewMode]);

  // Side sheet data
  const drillEvents = React.useMemo(() => {
    if (!drillCell) return [] as CalendarEvent[];
    return events.filter(
      (e) =>
        e.countryIso2 === drillCell.iso2 &&
        e.year === drillCell.year &&
        e.week === drillCell.week,
    );
  }, [events, drillCell]);

  // El anchor nunca debe quedar antes de "today" — el calendario es planning,
  // no se navega al pasado.
  const clampToToday = (target: { year: number; week: number }) => {
    if (
      target.year < today.year ||
      (target.year === today.year && target.week < today.week)
    ) {
      return today;
    }
    return target;
  };

  const isAtStart =
    anchor.year === today.year && anchor.week === today.week;

  // Navigation
  const goPrev = (n: number) => {
    if (isAtStart) return; // no-op si ya estamos en hoy
    if (viewMode === "week") {
      setAnchor(clampToToday(addWeeks(anchor.year, anchor.week, -n)));
    } else {
      const monday = isoWeekToMonday(anchor.year, anchor.week);
      monday.setUTCMonth(monday.getUTCMonth() - n);
      setAnchor(clampToToday(isoWeekFromDate(monday)));
    }
  };
  const goNext = (n: number) => {
    if (viewMode === "week") {
      setAnchor(addWeeks(anchor.year, anchor.week, n));
    } else {
      const monday = isoWeekToMonday(anchor.year, anchor.week);
      monday.setUTCMonth(monday.getUTCMonth() + n);
      setAnchor(isoWeekFromDate(monday));
    }
  };
  const goToday = () => {
    setAnchor(today);
    setExtraPeriods(0);
  };

  // Reset infinite-scroll cuando cambia el modo de vista (semanas ↔ meses)
  React.useEffect(() => {
    setExtraPeriods(0);
  }, [viewMode]);

  // IntersectionObserver: cuando el sentinel del final entra al viewport,
  // carga 10 periodos más.
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setExtraPeriods((p) => p + 10);
        }
      },
      { rootMargin: "200px" },
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [viewMode]); // re-init si cambia modo (sentinel se re-monta)

  const isCurrentWeek = (w: { year: number; week: number }) =>
    w.year === today.year && w.week === today.week;

  // Group weeks by month for the band header
  const monthBand = React.useMemo(() => {
    const segments: { month: string; span: number; startIdx: number }[] = [];
    weeks.forEach((w, i) => {
      const { month } = formatWeekRange(w.year, w.week);
      const last = segments[segments.length - 1];
      if (last && last.month === month) {
        last.span += 1;
      } else {
        segments.push({ month, span: 1, startIdx: i });
      }
    });
    return segments;
  }, [weeks]);

  // Year band — collapse adjacent weeks with same ISO year
  const yearBand = React.useMemo(() => {
    const segments: { year: number; span: number }[] = [];
    weeks.forEach((w) => {
      const last = segments[segments.length - 1];
      if (last && last.year === w.year) {
        last.span += 1;
      } else {
        segments.push({ year: w.year, span: 1 });
      }
    });
    return segments;
  }, [weeks]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        {/* Nav buttons */}
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goPrev(4)}
            disabled={isAtStart}
            title="Anterior 4 semanas"
          >
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => goPrev(1)}
            disabled={isAtStart}
            title="Semana anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Hoy
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goNext(1)} title="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goNext(4)} title="Siguiente 4 semanas">
            <ChevronsRight className="h-4 w-4" />
          </Button>
        </div>

        {/* View mode toggle: semanas / meses */}
        <div
          role="tablist"
          aria-label="Modo de vista"
          className="inline-flex items-center gap-0.5 rounded-md border border-border bg-background p-0.5"
        >
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "week"}
            onClick={() => setViewMode("week")}
            className={
              "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors " +
              (viewMode === "week"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
            title="Vista por semanas (ISO)"
          >
            <CalendarRange className="h-3.5 w-3.5" />
            Semanas
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={viewMode === "month"}
            onClick={() => setViewMode("month")}
            className={
              "inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors " +
              (viewMode === "month"
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-muted hover:text-foreground")
            }
            title="Vista por meses"
          >
            <CalendarDays className="h-3.5 w-3.5" />
            Meses
          </button>
        </div>

        <div className="relative flex flex-1 min-w-[180px] items-center">
          <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar país, cliente, variedad..."
            className="pl-7"
          />
        </div>

        <Select value={speciesId} onValueChange={(v) => setSpeciesId(String(v ?? "all"))}>
          <SelectTrigger className="h-8 w-40">
            {speciesId === "all" ? (
              <span className="text-muted-foreground">Todas las especies</span>
            ) : (
              <SelectValue placeholder="Especie" />
            )}
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

        {/* Status filter — solo aplica a contratos. Default: Activos. */}
        <div className="inline-flex flex-wrap items-center gap-1">
          {KAM_STATUS_GROUPS.map((g) => {
            const active = contractStatuses.has(g.key);
            return (
              <label
                key={g.key}
                className={
                  "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors " +
                  (active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted")
                }
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={active}
                  onChange={() => {
                    setContractStatuses((prev) => {
                      const next = new Set(prev);
                      if (next.has(g.key)) next.delete(g.key);
                      else next.add(g.key);
                      return next;
                    });
                  }}
                />
                {g.label}
              </label>
            );
          })}
        </div>

        <div className="flex items-center gap-2 rounded-md border border-border px-2 py-1 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-muted-foreground">Oportunidades</span>
          <Switch checked={includeOpps} onCheckedChange={setIncludeOpps} />
        </div>

        {includeOpps ? (
          <Select value={String(minProb)} onValueChange={(v) => setMinProb(Number(v))}>
            <SelectTrigger className="h-8 w-32">
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

      {/* KPIs — total entregas y breakdown por año (respetan los filtros) */}
      {kpis.years.length > 0 ? (
        <div className="flex flex-wrap items-stretch gap-2 rounded-lg border bg-card px-3 py-2">
          <KpiCard label="Total entregas" plants={kpis.total} accent />
          {kpis.years.map((y) => (
            <KpiCard key={y.year} label={String(y.year)} plants={y.plants} />
          ))}
        </div>
      ) : null}

      {/* Leyenda — clickeable para ocultar/mostrar tipos */}
      <div className="flex flex-wrap items-center gap-2 px-1 text-[10px]">
        <LegendDot
          label="Venta"
          colorClass="bg-primary/10 text-primary"
          active={!hiddenConditions.has("venta")}
          onClick={() =>
            setHiddenConditions((prev) => {
              const next = new Set(prev);
              if (next.has("venta")) next.delete("venta");
              else next.add("venta");
              return next;
            })
          }
        />
        <LegendDot
          label="Muestra"
          colorClass="bg-amber-500/10 text-amber-700 dark:text-amber-300"
          active={!hiddenConditions.has("muestra")}
          onClick={() =>
            setHiddenConditions((prev) => {
              const next = new Set(prev);
              if (next.has("muestra")) next.delete("muestra");
              else next.add("muestra");
              return next;
            })
          }
        />
        <LegendDot
          label="Reposición"
          colorClass="bg-sky-500/10 text-sky-700 dark:text-sky-300"
          active={!hiddenConditions.has("reposicion")}
          onClick={() =>
            setHiddenConditions((prev) => {
              const next = new Set(prev);
              if (next.has("reposicion")) next.delete("reposicion");
              else next.add("reposicion");
              return next;
            })
          }
        />
        <LegendDot
          label="Oportunidad"
          colorClass="border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
          active={!hiddenConditions.has("opp") && includeOpps}
          onClick={() => {
            // Click sobre oportunidad → toggle del switch principal
            setIncludeOpps((v) => !v);
            setHiddenConditions((prev) => {
              const next = new Set(prev);
              next.delete("opp");
              return next;
            });
          }}
        />
      </div>

      {/* Grid TRANSPUESTO: filas = periodos, columnas = países.
          Vertical scroll = página (natural). Horizontal scroll = grid (cuando
          hay más países que ancho disponible). */}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `7rem repeat(${allCountries.length}, minmax(8rem, 1fr)) 5.5rem`,
            minWidth: `${7 + allCountries.length * 8 + 5.5}rem`,
          }}
        >
          {/* Header row (sticky top): País por país */}
          <div className="sticky top-14 z-10 border-b border-r bg-card px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Período
          </div>
          {allCountries.map((c) => (
            <div
              key={`hdr-${c.iso2}`}
              className="sticky top-14 z-10 flex items-center gap-1.5 border-b border-r bg-card px-2 py-2 text-xs"
            >
              <CountryFlag iso2={c.iso2} size="sm" />
              <span className="truncate font-medium">{c.name}</span>
            </div>
          ))}
          <div className="sticky top-14 z-10 border-b border-l bg-muted/40 px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Total
          </div>

          {/* Body: una fila por período */}
          {countryRows.length === 0 ? (
            <div
              className="border-r p-8 text-center text-sm text-muted-foreground"
              style={{ gridColumn: `span ${allCountries.length + 2}` }}
            >
              No hay entregas registradas todavía.
            </div>
          ) : (
            (viewMode === "week" ? weeks : months).map((col, idx) => {
              const isWeek = viewMode === "week";
              const colW = col as { year: number; week: number };
              const colM = col as { year: number; month: number };
              const key = isWeek
                ? weekKey(colW.year, colW.week)
                : colM.year * 100 + colM.month;
              const isCur = isWeek
                ? isCurrentWeek(colW)
                : isCurrentMonth(colM);
              const total = columnTotals.get(key) ?? 0;

              // Drill-down date refs (year+week)
              const drillYear = isWeek ? colW.year : colW.year;
              const drillWeek = isWeek
                ? colW.week
                : isoWeekFromDate(new Date(Date.UTC(colM.year, colM.month, 4))).week;
              // Override drillWeek for month mode using monday
              const monthDrillRef = !isWeek
                ? isoWeekFromDate(new Date(Date.UTC(colM.year, colM.month, 4)))
                : null;
              const drillY = monthDrillRef ? monthDrillRef.year : drillYear;
              const drillW = monthDrillRef ? monthDrillRef.week : drillWeek;

              // Period label
              const periodLabel = isWeek
                ? formatWeekRange(colW.year, colW.week)
                : null;
              const monthName = !isWeek ? MONTHS_ES[colM.month] : null;
              const year = isWeek ? colW.year : colM.year;
              const periodKey = isWeek
                ? `${colW.year}-${colW.week}`
                : `${colM.year}-${colM.month}`;
              const isFirstOfYear =
                idx === 0 ||
                (isWeek
                  ? (weeks[idx - 1] as { year: number }).year !== colW.year
                  : (months[idx - 1] as { year: number }).year !== colM.year);

              return (
                <React.Fragment key={periodKey}>
                  {/* Period label cell — sticky left, doble línea (year band si cambia) */}
                  <div
                    className={
                      "sticky left-0 z-[5] border-b border-r px-3 py-2 " +
                      (isCur
                        ? "bg-primary/10 border-l-2 border-l-primary"
                        : "bg-card") +
                      (isFirstOfYear ? " border-t-2 border-t-foreground/20" : "")
                    }
                  >
                    {isFirstOfYear ? (
                      <div className="font-mono text-[10px] font-bold tracking-wider text-foreground/80">
                        {year}
                      </div>
                    ) : null}
                    {isWeek ? (
                      <>
                        <div
                          className={
                            "font-mono text-sm font-semibold " +
                            (isCur ? "text-primary" : "text-foreground")
                          }
                        >
                          {periodLabel!.label}
                        </div>
                        <div
                          className={
                            "font-mono text-[10px] " +
                            (isCur
                              ? "text-primary/80"
                              : "text-muted-foreground")
                          }
                        >
                          {periodLabel!.subLabel} {periodLabel!.month}
                        </div>
                      </>
                    ) : (
                      <div
                        className={
                          "text-sm font-semibold uppercase tracking-wider " +
                          (isCur ? "text-primary" : "text-foreground")
                        }
                      >
                        {monthName}
                      </div>
                    )}
                  </div>

                  {/* Country cells */}
                  {allCountries.map((country) => {
                    const cr = countryRows.find((r) => r.iso2 === country.iso2);
                    const items = cr?.byKey.get(key) ?? [];

                    if (items.length === 0) {
                      return (
                        <div
                          key={`${periodKey}-${country.iso2}`}
                          className={
                            "border-b border-r " +
                            (isCur ? "bg-primary/[0.03]" : "")
                          }
                        />
                      );
                    }

                    // aggregate by client name (same logic as before)
                    type ClientAgg = {
                      qty: number;
                      isOpp: boolean;
                      conditions: Set<string>;
                    };
                    const byClient = new Map<string, ClientAgg>();
                    let opportunityCount = 0;
                    for (const it of items) {
                      const name = it.clientName ?? "—";
                      const cur =
                        byClient.get(name) ??
                        ({
                          qty: 0,
                          isOpp: false,
                          conditions: new Set(),
                        } as ClientAgg);
                      cur.qty += Number(it.qty ?? 0);
                      if (it.source_type === "opportunity") {
                        cur.isOpp = true;
                        opportunityCount += 1;
                      } else if (it.contract_condition) {
                        cur.conditions.add(it.contract_condition);
                      }
                      byClient.set(name, cur);
                    }
                    const clientList = Array.from(byClient.entries()).sort(
                      (a, b) => b[1].qty - a[1].qty,
                    );
                    const visiblePills = clientList.slice(
                      0,
                      isWeek ? 3 : 5,
                    );
                    const overflow = clientList.length - visiblePills.length;
                    const totalQty = clientList.reduce(
                      (s, [, v]) => s + v.qty,
                      0,
                    );

                    return (
                      <button
                        key={`${periodKey}-${country.iso2}`}
                        type="button"
                        onClick={() =>
                          setDrillCell({
                            iso2: country.iso2,
                            countryName: country.name,
                            year: drillY,
                            week: drillW,
                          })
                        }
                        className={
                          "group flex flex-col gap-1 border-b border-r p-1.5 text-left hover:bg-muted/30 " +
                          (isCur ? "bg-primary/[0.04]" : "")
                        }
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-mono font-semibold tabular-nums">
                            {numFmt.format(totalQty)}
                          </span>
                          {opportunityCount > 0 ? (
                            <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400">
                              <Sparkles className="h-2.5 w-2.5" />
                              {opportunityCount}
                            </span>
                          ) : null}
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {visiblePills.map(([name, info]) => {
                            let pillClass: string;
                            if (info.isOpp) {
                              pillClass =
                                "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200";
                            } else if (
                              info.conditions.size === 1 &&
                              info.conditions.has("muestra")
                            ) {
                              pillClass =
                                "bg-amber-500/10 text-amber-700 dark:text-amber-300";
                            } else if (
                              info.conditions.size === 1 &&
                              info.conditions.has("reposicion")
                            ) {
                              pillClass =
                                "bg-sky-500/10 text-sky-700 dark:text-sky-300";
                            } else {
                              pillClass = "bg-primary/10 text-primary";
                            }
                            const titleSuffix =
                              !info.isOpp && info.conditions.size === 1
                                ? ` · ${info.conditions.values().next().value}`
                                : "";
                            return (
                              <span
                                key={name}
                                className={
                                  "truncate rounded px-1 py-0.5 text-[10px] font-medium " +
                                  pillClass
                                }
                                title={name + titleSuffix}
                              >
                                {name}
                              </span>
                            );
                          })}
                          {overflow > 0 ? (
                            <span className="text-[9px] text-muted-foreground">
                              + {overflow} más
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}

                  {/* Row total */}
                  <div
                    className={
                      "border-b border-l px-2 py-2 text-right font-mono text-xs font-bold tabular-nums " +
                      (isCur
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/30 text-foreground")
                    }
                    title={
                      total > 0
                        ? `${numFmt.format(total)} plantas`
                        : "Sin entregas en este período"
                    }
                  >
                    {total > 0 ? (
                      numFmt.format(total)
                    ) : (
                      <span className="text-muted-foreground/40">—</span>
                    )}
                  </div>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>

      {/* Sentinel — al entrar en viewport carga 10 periodos más (infinite scroll) */}
      {countryRows.length > 0 ? (
        <div
          ref={sentinelRef}
          className="flex flex-col items-center justify-center gap-1.5 py-4"
        >
          <div className="flex h-7 w-7 animate-bounce items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm">
            <ChevronDown className="h-3.5 w-3.5" />
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {extraPeriods > 0
              ? `${viewMode === "week" ? totalVisibleWeeks : totalVisibleMonths} ${viewMode === "week" ? "semanas" : "meses"} · scroll para más`
              : `Scroll para cargar más ${viewMode === "week" ? "semanas" : "meses"}`}
          </span>
        </div>
      ) : null}

      {/* Side sheet */}
      <Sheet
        open={drillCell !== null}
        onOpenChange={(o) => {
          if (!o) setDrillCell(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {drillCell ? (
                <>
                  <span className="text-2xl">
                    <CountryFlag iso2={drillCell.iso2} />
                  </span>
                  <span>{drillCell.countryName}</span>
                  <Badge variant="outline" className="font-mono">
                    Wk{drillCell.week}/{drillCell.year}
                  </Badge>
                </>
              ) : null}
            </SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-2">
            {drillEvents.map((e) => {
              // Para contratos, source_id es el contract_item.id — necesitamos
              // contract_id para navegar al detalle del contrato.
              const href =
                e.source_type === "opportunity"
                  ? `/oportunidades/${e.source_id}`
                  : e.contract_id
                    ? `/contratos/${e.contract_id}`
                    : "#";
              return (
                <Link
                  key={`${e.source_type}-${e.source_id}`}
                  href={href}
                  className="group block rounded-md border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40 hover:bg-primary/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-medium">
                          {e.clientName ?? "—"}
                        </span>
                        <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {e.varietyName ?? "—"} · {e.speciesName ?? "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-base font-semibold tabular-nums">
                        {numFmt.format(Number(e.qty ?? 0))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">plantas</div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[10px]">
                    {e.source_type === "opportunity" ? (
                      <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <Sparkles className="h-3 w-3" />
                        Oportunidad{" "}
                        {e.probability_pct != null
                          ? `${e.probability_pct}%`
                          : ""}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-primary">
                        <Building2 className="h-3 w-3" />
                        Contrato
                      </span>
                    )}
                    <span className="text-muted-foreground">
                      {e.status ?? "—"}
                    </span>
                  </div>
                </Link>
              );
            })}
            {drillEvents.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No hay entregas para esta semana en este país.
              </p>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function LegendDot({
  label,
  colorClass,
  active,
  onClick,
}: {
  label: string;
  colorClass: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 transition-colors hover:bg-muted/50 " +
        (active ? "text-foreground" : "text-muted-foreground/50 line-through")
      }
      title={active ? `Click para ocultar ${label}` : `Click para mostrar ${label}`}
    >
      <span
        aria-hidden
        className={
          "inline-block h-2.5 w-3 rounded-sm " +
          colorClass +
          (active ? "" : " opacity-40")
        }
      />
      <span>{label}</span>
    </button>
  );
}

function KpiCard({
  label,
  plants,
  accent,
}: {
  label: string;
  plants: number;
  accent?: boolean;
}) {
  return (
    <div
      className={
        "min-w-[110px] flex-1 rounded-md border px-3 py-1.5 " +
        (accent
          ? "border-primary/40 bg-primary/5"
          : "border-border bg-background/40")
      }
      title={`${numFmt.format(plants)} plantas`}
    >
      <div
        className={
          "text-[10px] font-medium uppercase tracking-wider " +
          (accent ? "text-primary" : "text-muted-foreground")
        }
      >
        {label}
      </div>
      <div
        className={
          "font-mono text-base font-bold tabular-nums " +
          (accent ? "text-foreground" : "text-foreground")
        }
      >
        {numFmt.format(plants)}{" "}
        <span className="text-[10px] font-normal text-muted-foreground">
          plantas
        </span>
      </div>
    </div>
  );
}
