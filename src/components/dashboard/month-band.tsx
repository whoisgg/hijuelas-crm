import { cn } from "@/lib/utils";

export type MonthBandSegment = {
  /** Etiqueta del mes (ej. "MAYO"). */
  label: string;
  /** Cuántas columnas (= semanas) abarca este segmento dentro del strip. */
  span: number;
};

export type MonthBandProps = {
  segments: readonly MonthBandSegment[];
  className?: string;
};

/**
 * Banda superior del WeekStripCalendar que rotula los meses
 * sobre las columnas de semanas.
 *
 * Renderiza un grid con `gridTemplateColumns: repeat(totalSpan, minmax(0,1fr))`
 * y cada segmento ocupa `span` columnas.
 */
export function MonthBand({ segments, className }: MonthBandProps) {
  if (segments.length === 0) return null;
  const totalSpan = segments.reduce((acc, s) => acc + s.span, 0);
  if (totalSpan === 0) return null;

  return (
    <div
      className={cn("grid items-center", className)}
      style={{ gridTemplateColumns: `repeat(${totalSpan}, minmax(0, 1fr))` }}
    >
      {segments.map((segment, idx) => (
        <div
          key={`${segment.label}-${idx}`}
          className={cn(
            "border-b border-border/40 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground",
            idx > 0 && "border-l border-border/40",
          )}
          style={{ gridColumn: `span ${segment.span} / span ${segment.span}` }}
        >
          {segment.label}
        </div>
      ))}
    </div>
  );
}
