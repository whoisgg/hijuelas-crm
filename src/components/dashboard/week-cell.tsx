import Link from "next/link";

import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { WeekStripEntry } from "@/lib/actions/analytics";

export type WeekCellProps = {
  entry: WeekStripEntry;
  /** 0..1 — intensidad del heatmap (relativo al máximo de la ventana). */
  intensity: number;
};

/**
 * Convierte la intensidad (0..1) en clases tailwind para el fondo y borde,
 * usando CSS vars del design system (sin hex).
 */
function intensityClasses(intensity: number, isCurrent: boolean): string {
  if (intensity <= 0) {
    return cn(
      "bg-card hover:bg-muted/40",
      isCurrent ? "ring-2 ring-primary" : "ring-1 ring-border",
    );
  }
  if (intensity < 0.25) {
    return cn(
      "bg-primary/[0.06] hover:bg-primary/[0.12]",
      isCurrent ? "ring-2 ring-primary" : "ring-1 ring-primary/15",
    );
  }
  if (intensity < 0.5) {
    return cn(
      "bg-primary/[0.12] hover:bg-primary/[0.18]",
      isCurrent ? "ring-2 ring-primary" : "ring-1 ring-primary/25",
    );
  }
  if (intensity < 0.75) {
    return cn(
      "bg-primary/[0.2] hover:bg-primary/[0.26]",
      isCurrent ? "ring-2 ring-primary" : "ring-1 ring-primary/30",
    );
  }
  return cn(
    "bg-primary/[0.28] hover:bg-primary/[0.34]",
    isCurrent ? "ring-2 ring-primary" : "ring-1 ring-primary/40",
  );
}

export function WeekCell({ entry, intensity }: WeekCellProps) {
  const top = entry.bySpecies.slice(0, 3);
  const extra = Math.max(0, entry.bySpecies.length - top.length);
  const href = `/calendario?week=${entry.year}-${String(entry.week).padStart(2, "0")}`;

  const speciesLine = top
    .map((s) => `${s.abbr} ${formatNumber(s.qty, true)}`)
    .join(" · ");

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Link
            href={href}
            aria-label={`Semana ${entry.week} (${entry.rangeLabel})`}
            className={cn(
              "group/cell relative flex h-full min-h-32 flex-col gap-2 rounded-lg px-2.5 py-2.5 text-left transition-colors",
              intensityClasses(intensity, entry.isCurrentWeek),
            )}
          >
            <div className="flex items-baseline justify-between gap-1">
              <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                Sem {entry.week}
              </span>
              {entry.isCurrentWeek ? (
                <Badge
                  variant="default"
                  className="h-4 px-1.5 text-[9px] font-semibold uppercase tracking-wider"
                >
                  Hoy
                </Badge>
              ) : null}
            </div>
            <div className="text-[10px] leading-tight text-muted-foreground">
              {entry.rangeLabel}
            </div>

            <div className="mt-auto space-y-1">
              {entry.totalPlants > 0 ? (
                <>
                  <div className="font-mono text-lg font-semibold leading-none tabular-nums text-foreground">
                    {formatNumber(entry.totalPlants, entry.totalPlants >= 10_000)}
                  </div>
                  <div className="text-[10px] leading-tight text-muted-foreground">
                    {speciesLine}
                    {extra > 0 ? (
                      <span className="text-muted-foreground/80">
                        {" "}
                        · +{extra} más
                      </span>
                    ) : null}
                  </div>
                </>
              ) : (
                <div className="text-[10px] italic leading-tight text-muted-foreground/60">
                  Sin compromisos
                </div>
              )}
            </div>
          </Link>
        }
      />
      <TooltipContent>
        <div className="space-y-1">
          <div className="font-semibold">
            Sem {entry.week} · {entry.rangeLabel}
          </div>
          {entry.totalPlants > 0 ? (
            <>
              <div className="text-[11px]">
                Total: {formatNumber(entry.totalPlants)} plantas
              </div>
              <ul className="space-y-0.5 text-[11px]">
                {entry.bySpecies.map((s) => (
                  <li key={s.speciesId} className="flex justify-between gap-3">
                    <span>{s.name}</span>
                    <span className="font-mono tabular-nums">
                      {formatNumber(s.qty)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="text-[11px] opacity-80">
              No hay compromisos esta semana.
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
