"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Sparkles,
  Building2,
  CalendarClock,
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
  visibleWeeks = 6,
  visibleMonths = 6,
}: Props) {
  // Filters
  const [search, setSearch] = React.useState("");
  const [speciesId, setSpeciesId] = React.useState<string>("all");
  const [includeOpps, setIncludeOpps] = React.useState<boolean>(initialIncludeOpps);
  const [minProb, setMinProb] = React.useState<number>(0);
  const [viewMode, setViewMode] = React.useState<ViewMode>("week");

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

  // Compute visible week range
  const weeks = React.useMemo(() => {
    const arr: { year: number; week: number }[] = [];
    let cur = anchor;
    for (let i = 0; i < visibleWeeks; i++) {
      arr.push(cur);
      cur = addWeeks(cur.year, cur.week, 1);
    }
    return arr;
  }, [anchor, visibleWeeks]);

  const weekKeys = React.useMemo(() => weeks.map((w) => weekKey(w.year, w.week)), [weeks]);

  // Compute visible month range — anchor's month is the first
  type MonthCol = { year: number; month: number /* 0-11 */ };
  const anchorMonth = React.useMemo<MonthCol>(() => {
    const monday = isoWeekToMonday(anchor.year, anchor.week);
    return { year: monday.getUTCFullYear(), month: monday.getUTCMonth() };
  }, [anchor]);
  const months = React.useMemo<MonthCol[]>(() => {
    const arr: MonthCol[] = [];
    let y = anchorMonth.year;
    let m = anchorMonth.month;
    for (let i = 0; i < visibleMonths; i++) {
      arr.push({ year: y, month: m });
      m += 1;
      if (m > 11) {
        m = 0;
        y += 1;
      }
    }
    return arr;
  }, [anchorMonth, visibleMonths]);
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
      // Must be in visible range (week or month depending on mode)
      if (e.year == null || e.week == null) return false;
      if (viewMode === "week") {
        if (!weekKeys.includes(weekKey(e.year, e.week))) return false;
      } else {
        if (!monthKeys.includes(monthKeyOf(e.year, e.week))) return false;
      }
      return true;
    });
  }, [events, search, speciesId, includeOpps, minProb, viewMode, weekKeys, monthKeys]);

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

  // Find next upcoming week (from today onwards) that has at least one event
  // matching current filters
  const nextDeliveryWeek = React.useMemo(() => {
    const todayKey = weekKey(today.year, today.week);
    let bestKey: number | null = null;
    let bestWeek: { year: number; week: number } | null = null;
    const q = search.trim().toLowerCase();
    for (const e of events) {
      if (e.year == null || e.week == null) continue;
      const k = weekKey(e.year, e.week);
      if (k < todayKey) continue;
      // Apply same filters as the grid (without the week range constraint)
      if (!includeOpps && e.source_type !== "contract") continue;
      if (speciesId !== "all" && e.speciesId !== speciesId) continue;
      if (
        includeOpps &&
        e.source_type === "opportunity" &&
        minProb > 0 &&
        (e.probability_pct ?? 0) < minProb
      )
        continue;
      if (q.length > 0) {
        const hit =
          (e.clientName ?? "").toLowerCase().includes(q) ||
          (e.countryName ?? "").toLowerCase().includes(q) ||
          (e.varietyName ?? "").toLowerCase().includes(q) ||
          (e.speciesName ?? "").toLowerCase().includes(q);
        if (!hit) continue;
      }
      if (bestKey === null || k < bestKey) {
        bestKey = k;
        bestWeek = { year: e.year, week: e.week };
      }
    }
    return bestWeek;
  }, [events, today, includeOpps, speciesId, minProb, search]);

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

  // Navigation
  const goPrev = (n: number) => {
    if (viewMode === "week") {
      setAnchor(addWeeks(anchor.year, anchor.week, -n));
    } else {
      // Move N months back — find Monday of that month, then get ISO week
      const monday = isoWeekToMonday(anchor.year, anchor.week);
      monday.setUTCMonth(monday.getUTCMonth() - n);
      setAnchor(isoWeekFromDate(monday));
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
  const goToday = () => setAnchor(today);

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
          <Button variant="ghost" size="sm" onClick={() => goPrev(4)} title="Anterior 4 semanas">
            <ChevronsLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goPrev(1)} title="Semana anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={goToday}>
            Hoy
          </Button>
          {nextDeliveryWeek &&
          (nextDeliveryWeek.year !== anchor.year ||
            nextDeliveryWeek.week !== anchor.week) ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAnchor(nextDeliveryWeek)}
              title={`Saltar a la entrega más próxima (Wk${nextDeliveryWeek.week}/${nextDeliveryWeek.year})`}
            >
              <CalendarClock className="h-4 w-4" />
              Próxima
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" onClick={() => goNext(1)} title="Semana siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goNext(4)} title="Siguiente 4 semanas">
            <ChevronsRight className="h-4 w-4" />
          </Button>
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

      {/* Grid */}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <div
          className="grid min-w-[900px]"
          style={{
            gridTemplateColumns:
              viewMode === "week"
                ? `9rem repeat(${visibleWeeks}, minmax(7rem, 1fr))`
                : `9rem repeat(${visibleMonths}, minmax(8rem, 1fr))`,
          }}
        >
          {viewMode === "week" ? (
            <>
              {/* Year band */}
              <div className="border-b border-r bg-muted/50 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                &nbsp;
              </div>
              {yearBand.map((seg, i) => (
                <div
                  key={`y-${i}`}
                  className="border-b border-r bg-muted/50 px-2 py-1 font-mono text-[11px] font-bold tracking-wider text-foreground"
                  style={{ gridColumn: `span ${seg.span}` }}
                >
                  {seg.year}
                </div>
              ))}

              {/* Month band */}
              <div className="border-b border-r bg-muted/30 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                &nbsp;
              </div>
              {monthBand.map((seg, i) => (
                <div
                  key={`m-${i}`}
                  className="border-b border-r bg-muted/30 px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
                  style={{ gridColumn: `span ${seg.span}` }}
                >
                  {seg.month}
                </div>
              ))}

              {/* Week headers */}
              <div className="border-b border-r bg-muted/10 px-3 py-2 text-xs font-medium text-muted-foreground">
                País
              </div>
              {weeks.map((w) => {
                const { label, subLabel } = formatWeekRange(w.year, w.week);
                const isCur = isCurrentWeek(w);
                return (
                  <div
                    key={`${w.year}-${w.week}`}
                    className={
                      "border-b border-r px-2 py-2 text-xs " +
                      (isCur
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/10 text-muted-foreground")
                    }
                  >
                    <div className="font-mono text-sm font-semibold">{label}</div>
                    <div className="font-mono text-[10px] opacity-70">{subLabel}</div>
                    {isCur ? (
                      <Badge className="mt-0.5 h-4 px-1 py-0 text-[9px]">Hoy</Badge>
                    ) : null}
                  </div>
                );
              })}
            </>
          ) : (
            <>
              {/* Year band for months */}
              <div className="border-b border-r bg-muted/50 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                &nbsp;
              </div>
              {(() => {
                const segments: { year: number; span: number }[] = [];
                months.forEach((m) => {
                  const last = segments[segments.length - 1];
                  if (last && last.year === m.year) last.span += 1;
                  else segments.push({ year: m.year, span: 1 });
                });
                return segments.map((seg, i) => (
                  <div
                    key={`y-${i}`}
                    className="border-b border-r bg-muted/50 px-2 py-1 font-mono text-[11px] font-bold tracking-wider text-foreground"
                    style={{ gridColumn: `span ${seg.span}` }}
                  >
                    {seg.year}
                  </div>
                ));
              })()}

              {/* Month headers */}
              <div className="border-b border-r bg-muted/10 px-3 py-2 text-xs font-medium text-muted-foreground">
                País
              </div>
              {months.map((m) => {
                const isCur = isCurrentMonth(m);
                return (
                  <div
                    key={`${m.year}-${m.month}`}
                    className={
                      "border-b border-r px-2 py-2 text-xs " +
                      (isCur
                        ? "bg-primary/10 text-primary"
                        : "bg-muted/10 text-muted-foreground")
                    }
                  >
                    <div className="text-sm font-semibold uppercase tracking-wider">
                      {MONTHS_ES[m.month]}
                    </div>
                    {isCur ? (
                      <Badge className="mt-0.5 h-4 px-1 py-0 text-[9px]">Hoy</Badge>
                    ) : null}
                  </div>
                );
              })}
            </>
          )}

          {/* Country rows */}
          {countryRows.length === 0 ? (
            <div
              className="border-r p-8 text-center text-sm text-muted-foreground"
              style={{ gridColumn: `span ${(viewMode === "week" ? visibleWeeks : visibleMonths) + 1}` }}
            >
              No hay entregas registradas todavía.
            </div>
          ) : (
            countryRows.map((cr) => {
              const cols: Array<{
                key: number;
                isCur: boolean;
                onClickCell: () => void;
              }> =
                viewMode === "week"
                  ? weeks.map((w) => ({
                      key: weekKey(w.year, w.week),
                      isCur: isCurrentWeek(w),
                      onClickCell: () => {},
                    }))
                  : months.map((m) => ({
                      key: m.year * 100 + m.month,
                      isCur: isCurrentMonth(m),
                      onClickCell: () => {},
                    }));
              return (
                <React.Fragment key={cr.iso2}>
                  <div className="flex items-center gap-2 border-b border-r px-3 py-2 text-sm">
                    <span className="text-lg">
                      <CountryFlag iso2={cr.iso2} />
                    </span>
                    <span className="truncate font-medium">{cr.name}</span>
                  </div>
                  {cols.map((col, idx) => {
                    const items = cr.byKey.get(col.key) ?? [];
                    const isCur = col.isCur;
                    // For drill-down: in week mode we know year+week; in month mode use first week of month
                    let drillYear = 0;
                    let drillWeek = 0;
                    if (viewMode === "week") {
                      const w = weeks[idx];
                      drillYear = w.year;
                      drillWeek = w.week;
                    } else {
                      const m = months[idx];
                      const monday = new Date(Date.UTC(m.year, m.month, 4));
                      const iso = isoWeekFromDate(monday);
                      drillYear = iso.year;
                      drillWeek = iso.week;
                    }

                    if (items.length === 0) {
                      return (
                        <div
                          key={col.key}
                          className={
                            "border-b border-r " + (isCur ? "bg-primary/[0.03]" : "")
                          }
                        />
                      );
                    }
                    // aggregate by client name
                    const byClient = new Map<string, { qty: number; isOpp: boolean }>();
                    let opportunityCount = 0;
                    for (const it of items) {
                      const name = it.clientName ?? "—";
                      const cur = byClient.get(name) ?? { qty: 0, isOpp: false };
                      cur.qty += Number(it.qty ?? 0);
                      if (it.source_type === "opportunity") {
                        cur.isOpp = true;
                        opportunityCount += 1;
                      }
                      byClient.set(name, cur);
                    }
                    const clientList = Array.from(byClient.entries()).sort(
                      (a, b) => b[1].qty - a[1].qty,
                    );
                    const visiblePills = clientList.slice(0, viewMode === "month" ? 5 : 3);
                    const overflow = clientList.length - visiblePills.length;
                    const totalQty = clientList.reduce((s, [, v]) => s + v.qty, 0);
                    return (
                      <button
                        key={col.key}
                        type="button"
                        onClick={() =>
                          setDrillCell({
                            iso2: cr.iso2,
                            countryName: cr.name,
                            year: drillYear,
                            week: drillWeek,
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
                          {visiblePills.map(([name, info]) => (
                            <span
                              key={name}
                              className={
                                "truncate rounded px-1 py-0.5 text-[10px] font-medium " +
                                (info.isOpp
                                  ? "border border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-200"
                                  : "bg-primary/10 text-primary")
                              }
                              title={name}
                            >
                              {name}
                            </span>
                          ))}
                          {overflow > 0 ? (
                            <span className="text-[9px] text-muted-foreground">
                              + {overflow} más
                            </span>
                          ) : null}
                        </div>
                      </button>
                    );
                  })}
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>

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
            {drillEvents.map((e) => (
              <div
                key={`${e.source_type}-${e.source_id}`}
                className="rounded-md border bg-card px-3 py-2 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.clientName ?? "—"}</div>
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
                    <Link
                      href={`/oportunidades/${e.source_id}`}
                      className="inline-flex items-center gap-1 text-amber-600 hover:underline dark:text-amber-400"
                    >
                      <Sparkles className="h-3 w-3" />
                      Oportunidad {e.probability_pct != null ? `${e.probability_pct}%` : ""}
                    </Link>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Building2 className="h-3 w-3" />
                      Contrato
                    </span>
                  )}
                  <span className="text-muted-foreground">{e.status ?? "—"}</span>
                </div>
              </div>
            ))}
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
