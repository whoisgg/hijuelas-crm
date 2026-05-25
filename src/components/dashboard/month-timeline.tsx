"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const MONTHS_ES_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

type MonthCell = {
  key: string; // "YYYY-MM"
  year: number;
  month: number;
  isToday: boolean;
};

type YearGroup = {
  year: number;
  startIdx: number;
  span: number;
};

type Props = {
  /** Mes/año seleccionado: "all" | "YYYY" | "YYYY-MM". */
  selected: string;
  /** Cuántos meses hacia atrás del actual. Default 0. */
  monthsBack?: number;
  /** Cuántos meses hacia adelante del actual. Default 18. */
  monthsForward?: number;
};

/**
 * Timeline horizontal con dos filas (estilo banda año + meses, similar
 * al calendario): fila superior con año (clickeable para seleccionar
 * todo el año), fila inferior con mes (clickeable para mes único).
 * Pill "Todo" fija a la izquierda fuera del scroller para reset.
 * Flechas izq/der nudge el scroll ~80% del visible.
 */
export function MonthTimeline({
  selected,
  monthsBack = 0,
  monthsForward = 18,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  const today = React.useMemo(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  }, []);

  // Lista de meses + agrupación por año.
  const { months, yearGroups } = React.useMemo(() => {
    const months: MonthCell[] = [];
    let y = today.year;
    let m = today.month - monthsBack;
    while (m <= 0) { m += 12; y -= 1; }
    const total = monthsBack + 1 + monthsForward;
    for (let i = 0; i < total; i++) {
      months.push({
        key: `${y}-${String(m).padStart(2, "0")}`,
        year: y,
        month: m,
        isToday: y === today.year && m === today.month,
      });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    const groups: YearGroup[] = [];
    months.forEach((mc, i) => {
      const last = groups[groups.length - 1];
      if (last && last.year === mc.year) last.span += 1;
      else groups.push({ year: mc.year, startIdx: i, span: 1 });
    });
    return { months, yearGroups: groups };
  }, [today, monthsBack, monthsForward]);

  const update = React.useCallback(
    (value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value === "all") next.delete("month");
      else next.set("month", value);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  // Auto-scroll para centrar la pill/cell seleccionada al montar / cambiar.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLElement>(
      `[data-cell="${selected}"]`,
    );
    if (!target) return;
    const sRect = scroller.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const offset = tRect.left - sRect.left - sRect.width / 2 + tRect.width / 2;
    scroller.scrollBy({ left: offset, behavior: "smooth" });
  }, [selected]);

  // Estado de las flechas según scroll.
  const [scrollState, setScrollState] = React.useState({
    canLeft: false,
    canRight: true,
  });
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const update = () => {
      const { scrollLeft, scrollWidth, clientWidth } = scroller;
      setScrollState({
        canLeft: scrollLeft > 2,
        canRight: scrollLeft + clientWidth < scrollWidth - 2,
      });
    };
    update();
    scroller.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    return () => {
      scroller.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, []);

  const nudge = React.useCallback((dir: 1 | -1) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    scroller.scrollBy({
      left: dir * scroller.clientWidth * 0.8,
      behavior: "smooth",
    });
  }, []);

  const allActive = selected === "all";

  return (
    <div className="relative flex items-stretch">
      {/* Flecha izq */}
      <button
        type="button"
        onClick={() => nudge(-1)}
        disabled={!scrollState.canLeft}
        aria-label="Meses anteriores"
        className={cn(
          "z-10 flex w-8 shrink-0 items-center justify-center border-r bg-background text-muted-foreground transition-colors",
          scrollState.canLeft
            ? "hover:bg-muted hover:text-foreground"
            : "cursor-not-allowed opacity-30",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Pill "Todo" — fuera del scroller para acceso constante */}
      <div className="flex shrink-0 items-center border-r px-2 py-2">
        <button
          type="button"
          role="tab"
          aria-selected={allActive}
          data-cell="all"
          onClick={() => update("all")}
          className={cn(
            "h-full rounded-md border px-3 text-xs font-medium transition-colors",
            allActive
              ? "border-primary bg-primary text-primary-foreground shadow-sm"
              : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          Todo
        </button>
      </div>

      {/* Scroller con grid año+mes */}
      <div
        ref={scrollerRef}
        className="flex-1 overflow-x-auto overscroll-x-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div
          role="tablist"
          aria-label="Línea de tiempo por mes"
          className="grid auto-rows-min gap-x-1 gap-y-1 px-2 py-2"
          style={{
            gridTemplateColumns: `repeat(${months.length}, minmax(56px, 1fr))`,
          }}
        >
          {/* Fila 1: años (cada uno spanning N meses) */}
          {yearGroups.map((g) => {
            const yearKey = String(g.year);
            const yearActive = selected === yearKey;
            // Año "implícitamente activo" si el mes seleccionado pertenece
            const monthSelectedInYear =
              !yearActive &&
              selected.startsWith(`${yearKey}-`);
            return (
              <button
                key={`year-${g.year}`}
                type="button"
                role="tab"
                aria-selected={yearActive}
                data-cell={yearKey}
                onClick={() => update(yearKey)}
                className={cn(
                  "flex h-6 items-center justify-center rounded-md border text-[11px] font-semibold transition-colors",
                  yearActive
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : monthSelectedInYear
                      ? "border-primary/30 bg-primary/5 text-primary hover:bg-primary/10"
                      : "border-border bg-muted/30 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                style={{
                  gridColumn: `${g.startIdx + 1} / span ${g.span}`,
                  gridRow: 1,
                }}
                title={`Ver todo ${g.year}`}
              >
                {g.year}
              </button>
            );
          })}

          {/* Fila 2: meses */}
          {months.map((mc, idx) => {
            const active = selected === mc.key;
            return (
              <button
                key={mc.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-cell={mc.key}
                onClick={() => update(mc.key)}
                className={cn(
                  "relative flex items-center justify-center rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                  mc.isToday && !active && "border-primary/40",
                )}
                style={{ gridColumn: idx + 1, gridRow: 2 }}
                title={`${MONTHS_ES_SHORT[mc.month - 1]} ${mc.year}`}
              >
                {MONTHS_ES_SHORT[mc.month - 1]}
                {mc.isToday ? (
                  <span
                    aria-hidden
                    className={cn(
                      "absolute -bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full",
                      active ? "bg-primary-foreground" : "bg-primary",
                    )}
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Flecha der */}
      <button
        type="button"
        onClick={() => nudge(1)}
        disabled={!scrollState.canRight}
        aria-label="Meses siguientes"
        className={cn(
          "z-10 flex w-8 shrink-0 items-center justify-center border-l bg-background text-muted-foreground transition-colors",
          scrollState.canRight
            ? "hover:bg-muted hover:text-foreground"
            : "cursor-not-allowed opacity-30",
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
