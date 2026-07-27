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
  Download,
  Eye,
  EyeOff,
  ExternalLink,
  Search,
  Sigma,
  SlidersHorizontal,
  Sparkles,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import {
  KAM_STATUS_GROUPS,
  matchesKamStatuses,
  type KamStatusKey,
} from "@/lib/kam-status";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDragScroll } from "@/lib/use-drag-scroll";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { CountryFlag } from "@/components/clientes/country-flag";
import { DeliveryActions } from "@/components/calendario/delivery-actions";
import { formatCompact } from "@/components/contratos/format";
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
  const [countryIso, setCountryIso] = React.useState<string>("all");
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
  // Columnas de país ocultas en desktop (iso2). Permite angostar la grilla
  // para que la columna Total entre en el viewport sin scroll horizontal.
  const [hiddenCountries, setHiddenCountries] = React.useState<Set<string>>(
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
      if (countryIso !== "all" && (e.countryIso2 ?? "??") !== countryIso) return false;
      // Columnas de país ocultas (desktop): se excluyen por completo — así
      // su aporte se descuenta del Total por período y del KPI.
      if (hiddenCountries.has(e.countryIso2 ?? "??")) return false;
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
    countryIso,
    hiddenCountries,
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
      if (countryIso !== "all" && (e.countryIso2 ?? "??") !== countryIso) return false;
      // Países ocultos (desktop) excluidos también del KPI total.
      if (hiddenCountries.has(e.countryIso2 ?? "??")) return false;
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
    countryIso,
    hiddenCountries,
    includeOpps,
    minProb,
    contractStatuses,
    hiddenConditions,
    today,
  ]);

  // Export a Excel — diálogo de período + 2 hojas (semanas + meses).
  const [isExporting, setIsExporting] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  // Preset por defecto: "visible" = lo que actualmente se ve en el grid.
  const [exportPreset, setExportPreset] = React.useState<
    "visible" | "12w" | "26w" | "52w" | "year" | "next_year"
  >("visible");

  const runExport = React.useCallback(async () => {
    // Aplicar todos los filtros del usuario (search, especie, status,
    // condiciones, opps, minProb, country) — pero NO el límite de ventana
    // visible, sino el período que eligió en el diálogo.
    const q = search.trim().toLowerCase();
    const yearNow = new Date().getFullYear();

    // Resolver ventana [fromYear/fromWeek .. toYear/toWeek]
    let fromYear = today.year;
    let fromWeek = today.week;
    let toYear = today.year;
    let toWeek = today.week;

    if (exportPreset === "12w") {
      const e = addWeeks(today.year, today.week, 12);
      toYear = e.year; toWeek = e.week;
    } else if (exportPreset === "26w") {
      const e = addWeeks(today.year, today.week, 26);
      toYear = e.year; toWeek = e.week;
    } else if (exportPreset === "52w") {
      const e = addWeeks(today.year, today.week, 52);
      toYear = e.year; toWeek = e.week;
    } else if (exportPreset === "year") {
      fromYear = yearNow; fromWeek = 1;
      toYear = yearNow; toWeek = 53;
    } else if (exportPreset === "next_year") {
      fromYear = yearNow + 1; fromWeek = 1;
      toYear = yearNow + 1; toWeek = 53;
    } else {
      // visible — usar el rango actual del grid
      const start = weekKeys[0] ?? weekKey(today.year, today.week);
      const end = weekKeys[weekKeys.length - 1] ?? weekKey(today.year, today.week);
      fromYear = Math.floor(start / 100); fromWeek = start % 100;
      toYear = Math.floor(end / 100); toWeek = end % 100;
    }
    const fromKey = fromYear * 100 + fromWeek;
    const toKey = toYear * 100 + toWeek;

    // Filtrado igual que `filtered`/`eventsAllPeriods` pero con ventana exportable.
    const eventsForExport = events.filter((e) => {
      if (!includeOpps && e.source_type !== "contract") return false;
      if (
        e.source_type === "contract" &&
        !matchesKamStatuses(e.contract_status, contractStatuses)
      )
        return false;
      if (
        e.source_type === "contract" &&
        hiddenConditions.has(e.contract_condition ?? "venta")
      )
        return false;
      if (e.source_type === "opportunity" && hiddenConditions.has("opp"))
        return false;
      if (speciesId !== "all" && e.speciesId !== speciesId) return false;
      if (countryIso !== "all" && (e.countryIso2 ?? "??") !== countryIso) return false;
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
      const k = e.year * 100 + e.week;
      if (k < fromKey || k > toKey) return false;
      return true;
    });

    if (eventsForExport.length === 0) {
      toast.error("No hay entregas en el período/filtros elegidos");
      return;
    }

    setIsExporting(true);
    try {
      const { utils, writeFile } = await import("xlsx");

      // Hoja 1 — Por semanas (1 fila por item)
      const weekRows = eventsForExport.map((e) => ({
        Contrato: e.contract_number ?? "",
        Año: e.year ?? null,
        Semana: e.week ?? null,
        País: e.countryName ?? null,
        Cliente: e.clientName ?? null,
        Especie: e.speciesName ?? null,
        Variedad: e.varietyName ?? null,
        Plantas: e.qty ?? 0,
        Condición:
          e.contract_condition ??
          (e.source_type === "opportunity" ? "oportunidad" : null),
        Status: e.contract_status ?? "",
        KAM: e.ownerName ?? null,
      }));
      const wsWeek = utils.json_to_sheet(weekRows);
      wsWeek["!cols"] = [
        { wch: 20 }, { wch: 6 }, { wch: 7 }, { wch: 18 }, { wch: 32 },
        { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 13 }, { wch: 14 }, { wch: 22 },
      ];

      // Hoja 2 — Por meses (agregado SUM plantas por mes/país/cliente/variedad)
      type MonthAggKey = string;
      const monthAgg = new Map<
        MonthAggKey,
        {
          year: number;
          month: number;
          country: string | null;
          client: string | null;
          species: string | null;
          variety: string | null;
          plants: number;
        }
      >();
      for (const e of eventsForExport) {
        if (e.year == null || e.week == null) continue;
        // Mes 0-11 derivado del lunes ISO de la semana.
        const month = isoWeekToMonday(e.year, e.week).getUTCMonth();
        const key = [
          e.year, month, e.countryIso2 ?? "", e.client_id ?? "", e.variety_id ?? "",
        ].join("|");
        const cur = monthAgg.get(key);
        if (cur) {
          cur.plants += Number(e.qty ?? 0);
        } else {
          monthAgg.set(key, {
            year: e.year,
            month,
            country: e.countryName ?? null,
            client: e.clientName ?? null,
            species: e.speciesName ?? null,
            variety: e.varietyName ?? null,
            plants: Number(e.qty ?? 0),
          });
        }
      }
      const monthRows = Array.from(monthAgg.values())
        .sort((a, b) =>
          a.year !== b.year
            ? a.year - b.year
            : a.month !== b.month
              ? a.month - b.month
              : (a.country ?? "").localeCompare(b.country ?? ""),
        )
        .map((r) => ({
          Año: r.year,
          Mes: MONTHS_ES[r.month] ?? String(r.month + 1),
          País: r.country,
          Cliente: r.client,
          Especie: r.species,
          Variedad: r.variety,
          Plantas: r.plants,
        }));
      const wsMonth = utils.json_to_sheet(monthRows);
      wsMonth["!cols"] = [
        { wch: 6 }, { wch: 12 }, { wch: 18 }, { wch: 32 },
        { wch: 14 }, { wch: 22 }, { wch: 12 },
      ];

      const wb = utils.book_new();
      utils.book_append_sheet(wb, wsWeek, "Por semanas");
      utils.book_append_sheet(wb, wsMonth, "Por meses");

      const today = new Date().toISOString().slice(0, 10);
      writeFile(
        wb,
        `hijuelas-calendario-${fromYear}W${String(fromWeek).padStart(2, "0")}-${toYear}W${String(toWeek).padStart(2, "0")}-${today}.xlsx`,
      );
      toast.success(
        `Exportadas ${weekRows.length} entregas (${monthRows.length} agregadas por mes)`,
      );
      setExportOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "No se pudo generar el archivo",
      );
    } finally {
      setIsExporting(false);
    }
  }, [
    events,
    search,
    speciesId,
    countryIso,
    includeOpps,
    minProb,
    contractStatuses,
    hiddenConditions,
    today,
    weekKeys,
    exportPreset,
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

  // Países efectivamente visibles como columnas (desktop) — allCountries
  // menos los que el usuario ocultó. Ocultar un país lo excluye también de
  // `filtered`/`eventsAllPeriods`, así su aporte se DESCUENTA del Total por
  // período y del KPI (no es solo un declutter visual).
  const visibleCountries = React.useMemo(
    () => allCountries.filter((c) => !hiddenCountries.has(c.iso2)),
    [allCountries, hiddenCountries],
  );

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

  // Side sheet data — iso2 "__all__" significa todos los países (mobile)
  const drillEvents = React.useMemo(() => {
    if (!drillCell) return [] as CalendarEvent[];
    return events.filter(
      (e) =>
        (drillCell.iso2 === "__all__" || e.countryIso2 === drillCell.iso2) &&
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
  const sentinelRef = React.useRef<HTMLButtonElement | null>(null);
  // Mobile breakpoint: colapsa los países en una sola columna "Entregas".
  const [isMobile, setIsMobile] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  // Sticky toolbar: solo la barra de filtros se queda pegada bajo la
  // topbar al scrollear. KPIs y legend en flujo normal (se pierden en
  // scroll, está OK — los country headers + columna Total dan referencia).
  // El intento previo (6edebde, reverted) stickó todo el bloque y
  // empujaba country headers ~300px abajo.
  // ResizeObserver mide la altura del wrapper sticky (cambia con
  // flex-wrap en viewports angostos) para calcular dónde anclar los
  // country headers (top = 56px topbar + altura toolbar).
  const toolbarBlockRef = React.useRef<HTMLDivElement | null>(null);
  const gridContainerRef = React.useRef<HTMLDivElement | null>(null);
  const [toolbarH, setToolbarH] = React.useState(0);
  // useLayoutEffect: medimos sincrónicamente antes del paint para evitar
  // un flash de headers en posición incorrecta.
  React.useLayoutEffect(() => {
    const node = toolbarBlockRef.current;
    if (!node) return;
    setToolbarH(Math.ceil(node.getBoundingClientRect().height));
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setToolbarH(Math.ceil(entry.contentRect.height));
    });
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  // El contenedor del grid tiene overflow-x:auto (necesario para scroll
  // horizontal cuando hay muchos países), lo cual fuerza overflow-y:auto
  // por spec CSS y crea un *sticky context* propio. Eso significa que
  // los headers del grid se anclan al contenedor — no a la ventana — y
  // su posición en viewport varía con el scroll de la página.
  //
  // Fix: scroll listener (con rAF) que computa el sticky-top dinámico
  // necesario para que el header quede SIEMPRE bajo el toolbar (en
  // viewport position = 56 topbar + altura toolbar). Escribe a una CSS
  // variable para no disparar re-renders.
  React.useEffect(() => {
    const target = 56 + toolbarH;
    const wrapper = gridContainerRef.current;
    if (!wrapper) return;
    let raf = 0;
    const update = () => {
      const containerTop = wrapper.getBoundingClientRect().top;
      const stickyTop = Math.max(0, target - containerTop);
      wrapper.style.setProperty("--cal-hdr-top", stickyTop + "px");
    };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
    };
  }, [toolbarH]);

  // Drag-to-scroll horizontal con mouse: con muchos países la única forma de
  // moverse era la scrollbar del fondo. La lógica vive en `useDragScroll`
  // (compartida con la ocupación del planner) y recibe el ref existente porque
  // este contenedor ya lo usa para el sticky del header.
  const drag = useDragScroll<HTMLDivElement>("x", gridContainerRef);

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

  // Count active filters (non-default state) for the Filtros badge.
  const activeFilterCount = React.useMemo(() => {
    let n = 0;
    if (speciesId !== "all") n++;
    const isDefaultStatuses =
      contractStatuses.size === 2 &&
      contractStatuses.has("activos") &&
      contractStatuses.has("por_firmar");
    if (!isDefaultStatuses) n++;
    if (includeOpps) n++;
    if (hiddenConditions.size > 0) n++;
    if (hiddenCountries.size > 0) n++;
    return n;
  }, [speciesId, contractStatuses, includeOpps, hiddenConditions, hiddenCountries]);

  // Inline KPI compact: total + año actual (si existe en kpis.years).
  const currentYear = today.year;
  const currentYearKpi = kpis.years.find((y) => y.year === currentYear);

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
      {/* Toolbar sticky — bg-background + negative margins para full-bleed
          (compensa el p-6 del AppShell main) y que el contenido scrolleando
          por debajo no se vea por los costados. */}
      <div
        ref={toolbarBlockRef}
        className="sticky top-14 z-20 -mx-6 bg-background px-6 pb-2"
      >
      {/* Toolbar compacto: nav · vista · search · KPI inline · Filtros (popover).
          Filtros que antes ocupaban 2-3 filas (especies/status/opps/leyenda)
          ahora viven dentro del popover, con badge mostrando el conteo. */}
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

        {/* Desktop: search compacto (ancho fijo). Mobile: country select. */}
        <div className="relative hidden md:flex md:w-48 items-center">
          <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="h-8 pl-7"
          />
        </div>

        {/* Spacer — empuja KPI/Excel/Filtros al borde derecho ahora que la
            búsqueda dejó de ser flex-1. */}
        <div className="hidden flex-1 md:block" />

        {/* Unhide rápido — visible solo si hay columnas de país ocultas.
            Atajo para restaurarlas todas sin abrir el popover Filtros. */}
        {!isMobile && hiddenCountries.size > 0 ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => setHiddenCountries(new Set())}
            title="Mostrar todas las columnas de país ocultas"
          >
            <Eye className="h-3.5 w-3.5" />
            {hiddenCountries.size} {hiddenCountries.size === 1 ? "oculto" : "ocultos"}
          </Button>
        ) : null}
        <div className="order-last basis-full md:hidden">
          <Select
            value={countryIso}
            onValueChange={(v) => setCountryIso(String(v ?? "all"))}
          >
            <SelectTrigger className="h-8 w-full">
              {countryIso === "all" ? (
                <span className="text-muted-foreground">Todos los países</span>
              ) : (
                <span className="truncate">
                  {allCountries.find((c) => c.iso2 === countryIso)?.name ?? countryIso}
                </span>
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los países</SelectItem>
              {allCountries.map((c) => (
                <SelectItem key={c.iso2} value={c.iso2}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* KPI inline compacto — solo total + año actual. Oculto en mobile. */}
        {kpis.total > 0 ? (
          <div
            className="hidden items-baseline gap-1.5 whitespace-nowrap px-1 text-xs md:inline-flex"
            title={`Total ${numFmt.format(kpis.total)} plantas · ${kpis.years.map((y) => `${y.year}: ${numFmt.format(y.plants)}`).join(" · ")}`}
          >
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">{formatCompact(kpis.total)}</span>
            {currentYearKpi ? (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-muted-foreground">{currentYear}</span>
                <span className="font-semibold tabular-nums">{formatCompact(currentYearKpi.plants)}</span>
              </>
            ) : null}
          </div>
        ) : null}

        {/* Export a Excel — diálogo de período + 2 hojas */}
        <Dialog open={exportOpen} onOpenChange={setExportOpen}>
          <DialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                title="Exportar a Excel con los filtros aplicados"
              >
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Excel</span>
              </Button>
            }
          />
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Exportar calendario a Excel</DialogTitle>
              <DialogDescription>
                Se genera un archivo con dos hojas: <strong>Por semanas</strong>{" "}
                (detalle item por item) y <strong>Por meses</strong> (agregado por
                mes / país / cliente / variedad). Respeta los filtros aplicados.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Período a exportar
                </label>
                <Select
                  value={exportPreset}
                  onValueChange={(v) => v && setExportPreset(v as typeof exportPreset)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visible">Lo que muestra el calendario ahora</SelectItem>
                    <SelectItem value="12w">Próximas 12 semanas</SelectItem>
                    <SelectItem value="26w">Próximas 26 semanas (~6 meses)</SelectItem>
                    <SelectItem value="52w">Próximas 52 semanas (1 año)</SelectItem>
                    <SelectItem value="year">Año actual completo</SelectItem>
                    <SelectItem value="next_year">Año próximo completo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="ghost"
                onClick={() => setExportOpen(false)}
                disabled={isExporting}
              >
                Cancelar
              </Button>
              <Button onClick={runExport} disabled={isExporting}>
                {isExporting ? "Generando…" : "Descargar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Botón Filtros — popover con especie, status, oportunidades, leyenda.
            Base-ui Popover.Trigger ya renderiza un <button>; no envolvemos
            con <Button> (sería nested-button hydration error). En cambio,
            aplicamos buttonVariants directo al trigger. */}
        <Popover>
          <PopoverTrigger
            className={cn(
              buttonVariants({ variant: "outline", size: "sm" }),
              "h-8 gap-1.5",
            )}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Filtros</span>
            {activeFilterCount > 0 ? (
              <Badge
                variant="secondary"
                className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[10px] font-semibold tabular-nums"
              >
                {activeFilterCount}
              </Badge>
            ) : null}
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[20rem] p-0">
            <div className="flex flex-col gap-3 p-3">
              {/* Mostrar: leyenda clickeable para ocultar/mostrar tipos */}
              <div className="space-y-1.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Mostrar
                </div>
                <div className="flex flex-wrap gap-1">
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
              </div>

              <Separator />

              {/* Filtros: especie · status · oportunidades · prob mínima */}
              <div className="space-y-2.5">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Filtros
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">Especie</label>
                  <Select
                    value={speciesId}
                    onValueChange={(v) => setSpeciesId(String(v ?? "all"))}
                  >
                    <SelectTrigger className="h-8 w-full">
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
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] font-medium text-muted-foreground">
                    Estado de contratos
                  </label>
                  <div className="flex flex-wrap gap-1">
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
                </div>

                <div className="flex items-center justify-between gap-2 rounded-md border border-border px-2 py-1.5 text-xs">
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />
                    Oportunidades
                  </span>
                  <Switch checked={includeOpps} onCheckedChange={setIncludeOpps} />
                </div>

                {includeOpps ? (
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] font-medium text-muted-foreground">
                      Probabilidad mínima
                    </label>
                    <Select
                      value={String(minProb)}
                      onValueChange={(v) => setMinProb(Number(v))}
                    >
                      <SelectTrigger className="h-8 w-full">
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
                  </div>
                ) : null}
              </div>

              {/* Columnas de país (solo desktop) — mostrar/ocultar para
                  angostar la grilla y dejar Total siempre a la vista. */}
              {!isMobile && allCountries.length > 0 ? (
                <>
                  <Separator />
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        Columnas de país
                      </span>
                      {hiddenCountries.size > 0 ? (
                        <button
                          type="button"
                          onClick={() => setHiddenCountries(new Set())}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          Mostrar todas
                        </button>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {allCountries.map((c) => {
                        const visible = !hiddenCountries.has(c.iso2);
                        return (
                          <button
                            key={`colvis-${c.iso2}`}
                            type="button"
                            onClick={() =>
                              setHiddenCountries((prev) => {
                                const next = new Set(prev);
                                if (next.has(c.iso2)) next.delete(c.iso2);
                                else next.add(c.iso2);
                                return next;
                              })
                            }
                            title={visible ? `Ocultar ${c.name}` : `Mostrar ${c.name}`}
                            className={
                              "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors " +
                              (visible
                                ? "border-primary/40 bg-primary/10 text-primary"
                                : "border-border text-muted-foreground line-through opacity-70 hover:bg-muted")
                            }
                          >
                            {visible ? (
                              <Eye className="h-3 w-3" />
                            ) : (
                              <EyeOff className="h-3 w-3" />
                            )}
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
      </div>
      {/* /Toolbar sticky */}

      {/* Grid TRANSPUESTO: filas = periodos, columnas = países.
          UN SOLO grid — header y body comparten gridTemplateColumns por
          definición, garantizando alineación perfecta. Header cells sticky
          con top dinámico = 56 (topbar) + altura del toolbar sticky. */}
      {/* Contenedor del grid: overflow-x-auto crea un sticky context propio
          (CSS coerce overflow-y a auto también). Para que los headers
          internos queden anclados bajo el toolbar al hacer scroll, ver
          el useLayoutEffect que actualiza --cal-hdr-top con rAF. */}
      <div
        ref={gridContainerRef}
        className="overflow-x-hidden rounded-lg border bg-card md:overflow-x-auto"
        {...drag.handlers}
      >
        <div
          className="grid"
          style={{
            gridTemplateColumns: isMobile
              ? `3.5rem minmax(0, 1fr) 3.5rem`
              : `7rem repeat(${visibleCountries.length}, minmax(8rem, 1fr)) 5.5rem`,
            minWidth: isMobile
              ? "auto"
              : `${7 + visibleCountries.length * 8 + 5.5}rem`,
          }}
        >
          {/* Header row — sticky con top dinámico = 56 (topbar fixed) +
              altura del toolbar sticky. Cell-by-cell. z-[25] para el
              corner left (también sticky-left, queda sobre country headers
              en la esquina), z-20 para los headers de país.
              NOTA: todos los sticky del calendario quedan en z ≤ 25 para
              que el sidebar (z-30) los tape al expandirse en hover. */}
          <div
            className="sticky left-0 z-[25] min-w-0 overflow-hidden border-b border-r bg-card px-2 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground md:px-3"
            style={{ top: "var(--cal-hdr-top, 56px)" }}
          >
            {isMobile ? (viewMode === "week" ? "Wk" : "Mes") : "Período"}
          </div>
          {isMobile ? (
            <div
              className="sticky z-20 min-w-0 overflow-hidden border-b border-r bg-card px-2 py-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
              style={{ top: "var(--cal-hdr-top, 56px)" }}
            >
              Entregas
            </div>
          ) : (
            visibleCountries.map((c) => (
              <div
                key={`hdr-${c.iso2}`}
                className="group sticky z-20 flex min-w-0 items-center gap-1.5 overflow-hidden border-b border-r bg-card px-2 py-2 text-xs"
                style={{ top: "var(--cal-hdr-top, 56px)" }}
              >
                <CountryFlag iso2={c.iso2} size="sm" />
                <span className="truncate font-medium">{c.name}</span>
                <button
                  type="button"
                  onClick={() =>
                    setHiddenCountries((prev) => {
                      const next = new Set(prev);
                      next.add(c.iso2);
                      return next;
                    })
                  }
                  title={`Ocultar ${c.name}`}
                  aria-label={`Ocultar ${c.name}`}
                  className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <EyeOff className="h-3 w-3" />
                </button>
              </div>
            ))
          )}
          {/* Columna Total — sticky-right (right-0) además de sticky-top:
              queda SIEMPRE visible en el viewport aunque la grilla tenga
              scroll horizontal. bg opaco (bg-muted, no /40) para que el
              contenido que scrollea por debajo no se transparente. z-[22]
              para quedar sobre los country headers (z-20) al scrollear. */}
          <div
            className="sticky right-0 z-[22] min-w-0 overflow-hidden border-b border-l bg-muted px-2 py-2 text-right text-[10px] font-bold uppercase tracking-wider text-muted-foreground"
            style={{ top: "var(--cal-hdr-top, 56px)" }}
          >
            Total
          </div>
          {/* Body: una fila por período */}
          {countryRows.length === 0 ? (
            <div
              className="border-r p-8 text-center text-sm text-muted-foreground"
              style={{ gridColumn: `span ${isMobile ? 3 : visibleCountries.length + 2}` }}
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

              // Year-divider en CUALQUIER fila que sea primera del año, incluyendo
              // idx=0 — así Wk22 (current) tiene la misma altura que el resto y
              // el año queda claro al inicio del calendario también.
              const showYearDivider = isFirstOfYear;
              // El gap visual ahora vive dentro del year-divider (pb-5 abajo
              // del label) — así la columna Total (que tiene bg-muted/30) no
              // muestra un strip blanco contrastante entre el banner y la
              // primera fila. firstRowMt queda vacío.
              const firstRowMt = "";

              return (
                <React.Fragment key={periodKey}>
                  {showYearDivider ? (
                    <div
                      // pb-7 (no py-2) — el label "▸ YYYY ◂" se queda arriba y
                      // los 28px restantes son bg-primary/5, actuando como gap
                      // visual continuo sin revelar el bg-card del container
                      // (que se veía feo bajo la columna Total).
                      className="flex items-start justify-center border-y-2 border-primary/30 bg-primary/5 pt-2 pb-7 font-mono text-xs font-bold tracking-widest text-primary"
                      style={{
                        gridColumn: `span ${isMobile ? 3 : visibleCountries.length + 2}`,
                      }}
                    >
                      ▸ {year} ◂
                    </div>
                  ) : null}
                  {/* Period label cell — sticky left. Año se muestra en la
                      banner row "▸ YYYY ◂" — no inline aquí para no comer ancho.
                      `justify-start` + sin overflow-hidden para que el label
                      ("Wk22") NUNCA se recorte aunque la fila sea baja. */}
                  <div
                    className={
                      // border-l-2 SIEMPRE (transparente cuando no es current)
                      // para que el ancho de contenido sea idéntico en todas
                      // las filas y no se vea "chueco" en la fila current.
                      "sticky left-0 z-[5] flex min-w-0 flex-col justify-start gap-0.5 border-b border-l-2 border-r px-2 py-2 md:px-3 " +
                      firstRowMt + " " +
                      (isCur
                        ? "bg-primary/10 border-l-primary"
                        : "bg-card border-l-transparent")
                    }
                  >
                    {isWeek ? (
                      <>
                        <div
                          className={
                            "font-mono text-[13px] font-semibold leading-tight md:text-sm " +
                            (isCur ? "text-primary" : "text-foreground")
                          }
                        >
                          {periodLabel!.label}
                        </div>
                        <div
                          className={
                            "truncate font-mono text-[10px] leading-tight " +
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
                          "text-sm font-semibold uppercase tracking-wider leading-tight " +
                          (isCur ? "text-primary" : "text-foreground")
                        }
                      >
                        {monthName}
                      </div>
                    )}
                  </div>

                  {/* Country cells — desktop por país, mobile colapsado en 1 columna */}
                  {(isMobile
                    ? [
                        {
                          iso2: "__all__",
                          name: "Entregas",
                          items: countryRows.flatMap(
                            (cr) => cr.byKey.get(key) ?? [],
                          ),
                        },
                      ]
                    : visibleCountries.map((country) => {
                        const cr = countryRows.find(
                          (r) => r.iso2 === country.iso2,
                        );
                        return {
                          iso2: country.iso2,
                          name: country.name,
                          items: cr?.byKey.get(key) ?? [],
                        };
                      })
                  ).map((country) => {
                    const items = country.items;

                    if (items.length === 0) {
                      return (
                        <div
                          key={`${periodKey}-${country.iso2}`}
                          className={
                            "border-b border-r " +
                            firstRowMt + " " +
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
                          "group flex min-w-0 flex-col gap-1 overflow-hidden border-b border-r p-1.5 text-left hover:bg-muted/30 " +
                          firstRowMt + " " +
                          (isCur ? "bg-primary/[0.04]" : "")
                        }
                      >
                        <div className="flex items-center justify-between text-[10px]">
                          <span
                            className="font-mono font-semibold tabular-nums"
                            title={`${numFmt.format(totalQty)} plantas`}
                          >
                            {isMobile
                              ? formatCompact(totalQty)
                              : numFmt.format(totalQty)}
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

                  {/* Row total — sticky-right (right-0) para que SIEMPRE quede
                      visible aunque haya scroll horizontal. z-[5] (igual que la
                      columna Período sticky-left). bg opaco para tapar el
                      contenido que scrollea por debajo (isCur usa bg-primary
                      sólido en vez de /10). */}
                  <div
                    className={
                      "sticky right-0 z-[5] min-w-0 overflow-hidden border-b border-l px-2 py-2 text-right font-mono text-xs font-bold tabular-nums " +
                      firstRowMt + " " +
                      (isCur
                        ? "bg-[oklch(0.95_0.03_145)] text-primary dark:bg-[oklch(0.28_0.05_145)]"
                        : "bg-muted text-foreground")
                    }
                    title={
                      total > 0
                        ? `${numFmt.format(total)} plantas`
                        : "Sin entregas en este período"
                    }
                  >
                    {total > 0 ? (
                      isMobile ? formatCompact(total) : numFmt.format(total)
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

      {/* Sentinel — al entrar en viewport carga 10 periodos más (infinite scroll).
          También clickeable como fallback explícito. */}
      {countryRows.length > 0 ? (
        <button
          ref={sentinelRef}
          type="button"
          onClick={() => setExtraPeriods((p) => p + 10)}
          className="group flex w-full flex-col items-center justify-center gap-1.5 py-5 transition-colors hover:bg-muted/40"
        >
          <div className="flex h-8 w-8 animate-bounce items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm group-hover:border-primary/40 group-hover:text-primary">
            <ChevronDown className="h-4 w-4" />
          </div>
          <span className="text-[11px] font-medium tracking-wider text-muted-foreground group-hover:text-foreground">
            Ver más
          </span>
        </button>
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
                  {drillCell.iso2 !== "__all__" ? (
                    <span className="text-2xl">
                      <CountryFlag iso2={drillCell.iso2} />
                    </span>
                  ) : null}
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
              const isOpp = e.source_type === "opportunity";
              const detailHref = isOpp
                ? `/oportunidades/${e.source_id}`
                : e.contract_id
                  ? `/contratos/${e.contract_id}`
                  : null;
              return (
                <div
                  key={`${e.source_type}-${e.source_id}`}
                  className="rounded-md border bg-card px-3 py-2 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {/* En mobile (drillCell.iso2='__all__') mostramos el flag por item */}
                        {drillCell?.iso2 === "__all__" ? (
                          <CountryFlag
                            iso2={e.countryIso2}
                            size="xs"
                            showName={false}
                          />
                        ) : null}
                        <span className="truncate font-medium">
                          {e.clientName ?? "—"}
                        </span>
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {e.varietyName ?? "—"} · {e.speciesName ?? "—"}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-base font-semibold tabular-nums">
                        {numFmt.format(Number(e.qty ?? 0))}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        plantas
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                    {isOpp ? (
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
                        Contrato · {e.status ?? "—"}
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-0.5">
                      {detailHref ? (
                        <Link
                          href={detailHref}
                          title={isOpp ? "Ir a la oportunidad" : "Ir al contrato"}
                          aria-label="Abrir detalle"
                          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                      ) : null}
                      {/* Edit/delete solo para contratos — opps tienen su propio flujo */}
                      {!isOpp &&
                      e.source_id &&
                      e.year != null &&
                      e.week != null ? (
                        <DeliveryActions
                          itemId={e.source_id}
                          qty={Number(e.qty ?? 0)}
                          year={e.year}
                          week={e.week}
                          clientName={e.clientName}
                          varietyName={e.varietyName}
                          onAfter={() => setDrillCell(null)}
                        />
                      ) : null}
                    </div>
                  </div>
                </div>
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

