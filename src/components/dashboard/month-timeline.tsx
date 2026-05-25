"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

const MONTHS_ES_SHORT = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

type Cell =
  | { kind: "all"; key: "all" }
  | { kind: "month"; key: string; year: number; month: number; isToday: boolean };

type Props = {
  /** Mes seleccionado en formato "YYYY-MM" o "all". */
  selected: string;
  /** Cuántos meses hacia atrás del actual. Default 6. */
  monthsBack?: number;
  /** Cuántos meses hacia adelante del actual. Default 12. */
  monthsForward?: number;
};

/**
 * Timeline horizontal scrollable de meses. El usuario navega scrolleando
 * (touch o trackpad) o clickeando un mes. Sincroniza con URL `?month=`.
 * Incluye un pill "Todo el año" al inicio para volver al snapshot anual.
 */
export function MonthTimeline({
  selected,
  monthsBack = 6,
  monthsForward = 12,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const scrollerRef = React.useRef<HTMLDivElement | null>(null);

  const today = React.useMemo(() => {
    const now = new Date();
    return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
  }, []);

  const cells = React.useMemo<Cell[]>(() => {
    const out: Cell[] = [{ kind: "all", key: "all" }];
    // Empezar `monthsBack` meses antes del actual
    let y = today.year;
    let m = today.month - monthsBack;
    while (m <= 0) { m += 12; y -= 1; }
    const total = monthsBack + 1 + monthsForward; // incluye mes actual
    for (let i = 0; i < total; i++) {
      out.push({
        kind: "month",
        key: `${y}-${String(m).padStart(2, "0")}`,
        year: y,
        month: m,
        isToday: y === today.year && m === today.month,
      });
      m += 1;
      if (m > 12) { m = 1; y += 1; }
    }
    return out;
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

  // Auto-scroll para centrar el pill seleccionado al montar / cambiar selección.
  React.useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const target = scroller.querySelector<HTMLButtonElement>(
      `[data-cell="${selected}"]`,
    );
    if (!target) return;
    const sRect = scroller.getBoundingClientRect();
    const tRect = target.getBoundingClientRect();
    const offset =
      tRect.left - sRect.left - sRect.width / 2 + tRect.width / 2;
    scroller.scrollBy({ left: offset, behavior: "smooth" });
  }, [selected]);

  // Para mostrar el año en el primer pill de cada año (visual aid).
  let lastYear: number | null = null;

  return (
    <div className="relative">
      {/* Fade edges para indicar que se puede scrollear */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-6 bg-gradient-to-r from-background to-transparent"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-6 bg-gradient-to-l from-background to-transparent"
      />
      <div
        ref={scrollerRef}
        className="flex snap-x snap-mandatory items-stretch gap-1.5 overflow-x-auto overscroll-x-contain scroll-smooth px-6 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Línea de tiempo por mes"
      >
        {cells.map((cell) => {
          if (cell.kind === "all") {
            const active = selected === "all";
            return (
              <button
                key={cell.key}
                type="button"
                role="tab"
                aria-selected={active}
                data-cell={cell.key}
                onClick={() => update("all")}
                className={cn(
                  "shrink-0 snap-start rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground shadow-sm"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                Todo el año
              </button>
            );
          }
          const active = selected === cell.key;
          const showYear = cell.year !== lastYear;
          lastYear = cell.year;
          return (
            <button
              key={cell.key}
              type="button"
              role="tab"
              aria-selected={active}
              data-cell={cell.key}
              onClick={() => update(cell.key)}
              className={cn(
                "relative flex shrink-0 snap-start flex-col items-center justify-center rounded-md border px-3 py-1.5 text-xs font-medium transition-colors min-w-[64px]",
                active
                  ? "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
                cell.isToday && !active && "border-primary/40",
              )}
              title={`${MONTHS_ES_SHORT[cell.month - 1]} ${cell.year}`}
            >
              <span className="leading-tight">{MONTHS_ES_SHORT[cell.month - 1]}</span>
              {showYear ? (
                <span
                  className={cn(
                    "text-[9px] leading-tight",
                    active
                      ? "text-primary-foreground/80"
                      : "text-muted-foreground/60",
                  )}
                >
                  {cell.year}
                </span>
              ) : null}
              {cell.isToday ? (
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
  );
}
