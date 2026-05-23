import Link from "next/link";
import { CalendarRange, Sprout } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { EmptyState } from "@/components/dashboard/empty-state";
import { MonthBand, type MonthBandSegment } from "@/components/dashboard/month-band";
import { WeekCell } from "@/components/dashboard/week-cell";
import type { WeekStripEntry } from "@/lib/actions/analytics";

export type WeekStripCalendarProps = {
  entries: WeekStripEntry[];
};

function buildMonthSegments(entries: WeekStripEntry[]): MonthBandSegment[] {
  if (entries.length === 0) return [];
  // Cada semana puede aportar 1 ó 2 columnas-mes según monthLabelEnd.
  // Para que la banda calce con el grid de semanas (12 columnas iguales),
  // colapsamos por mes consecutivo y usamos `span` = # semanas en ese mes.
  // Si una semana cruza 2 meses, la asignamos al mes de inicio (Monday).
  const segments: MonthBandSegment[] = [];
  for (const entry of entries) {
    const label = entry.monthLabel;
    const last = segments[segments.length - 1];
    if (last && last.label === label) {
      last.span += 1;
    } else {
      segments.push({ label, span: 1 });
    }
  }
  return segments;
}

export function WeekStripCalendar({ entries }: WeekStripCalendarProps) {
  const hasCommitments = entries.some((e) => e.totalPlants > 0);
  const maxPlants = entries.reduce((acc, e) => Math.max(acc, e.totalPlants), 0);
  const segments = buildMonthSegments(entries);
  const columns = entries.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="space-y-0.5">
          <CardTitle className="flex items-center gap-2 text-sm">
            <CalendarRange className="size-4 text-primary" />
            Compromisos por semana
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Próximas {entries.length} semanas ISO — solo contratos firmados, en
            proceso o finalizados.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          render={<Link href="/calendario">Ver calendario</Link>}
        />
      </CardHeader>
      <CardContent className="pt-0">
        {!hasCommitments ? (
          <EmptyState
            icon={Sprout}
            title="Sin entregas comprometidas"
            description="No hay entregas comprometidas en las próximas 12 semanas."
            className="py-12"
          />
        ) : (
          <TooltipProvider delay={250}>
            <div className="overflow-x-auto">
              <div className="min-w-[64rem] space-y-2">
                <MonthBand segments={segments} />
                <div
                  className="grid gap-2"
                  style={{
                    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                  }}
                >
                  {entries.map((entry) => (
                    <WeekCell
                      key={entry.isoLabel}
                      entry={entry}
                      intensity={
                        maxPlants > 0 ? entry.totalPlants / maxPlants : 0
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          </TooltipProvider>
        )}

        {hasCommitments ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-3 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Intensidad</span>
            <div className="flex items-center gap-1">
              <span className="size-3 rounded-sm bg-primary/[0.06] ring-1 ring-primary/15" />
              <span className="size-3 rounded-sm bg-primary/[0.12] ring-1 ring-primary/25" />
              <span className="size-3 rounded-sm bg-primary/[0.2] ring-1 ring-primary/30" />
              <span className="size-3 rounded-sm bg-primary/[0.28] ring-1 ring-primary/40" />
            </div>
            <span className="text-muted-foreground/80">+ plantas</span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
