"use client";

import * as React from "react";
import Link from "next/link";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventInput } from "@fullcalendar/core";
import esLocale from "@fullcalendar/core/locales/es.js";

import type { CalendarEvent } from "@/lib/actions/analytics";
import { formatNumber } from "@/lib/format";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";

type Props = {
  events: CalendarEvent[];
};

/**
 * Convierte año + semana ISO (1-53) en una fecha JS (lunes de esa semana).
 * Aproximación simple: semana 1 = primer lunes >= 4 ene.
 */
function isoWeekToDate(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
  const target = new Date(week1Monday);
  target.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  return target;
}

function colorForEvent(ev: CalendarEvent): { bg: string; border: string; text: string } {
  if (ev.source_type === "opportunity") {
    const prob = ev.probability_pct ?? 0;
    // Gradiente gris->verde según probabilidad
    if (prob >= 75)
      return {
        bg: "oklch(0.65 0.16 145 / 0.4)",
        border: "oklch(0.55 0.18 145)",
        text: "oklch(0.25 0.10 145)",
      };
    if (prob >= 40)
      return {
        bg: "oklch(0.75 0.10 145 / 0.4)",
        border: "oklch(0.60 0.12 145)",
        text: "oklch(0.25 0.10 145)",
      };
    return {
      bg: "oklch(0.85 0.04 145 / 0.4)",
      border: "oklch(0.70 0.06 145)",
      text: "oklch(0.30 0.04 145)",
    };
  }
  // contract: color por status
  const status = ev.status ?? "pendiente";
  if (status === "finalizado")
    return {
      bg: "oklch(0.50 0.18 145)",
      border: "oklch(0.45 0.20 145)",
      text: "oklch(0.98 0 0)",
    };
  if (status === "en_proceso")
    return {
      bg: "oklch(0.55 0.15 235)",
      border: "oklch(0.45 0.18 235)",
      text: "oklch(0.98 0 0)",
    };
  return {
    bg: "oklch(0.70 0 0)",
    border: "oklch(0.55 0 0)",
    text: "oklch(0.15 0 0)",
  };
}

export function DeliveryCalendar({ events }: Props) {
  const [selected, setSelected] = React.useState<CalendarEvent | null>(null);

  const calendarEvents = React.useMemo<EventInput[]>(() => {
    return events
      .filter((e) => e.year != null && e.week != null)
      .map((e) => {
        const start = isoWeekToDate(e.year as number, e.week as number);
        const end = new Date(start);
        end.setUTCDate(start.getUTCDate() + 6);
        const color = colorForEvent(e);
        const dotted = e.source_type === "opportunity";
        const titleParts = [
          e.clientName ?? "—",
          e.varietyName ?? "—",
          formatNumber(Number(e.qty ?? 0)),
        ];
        return {
          id: `${e.source_type}:${e.source_id}`,
          title: titleParts.join(" • "),
          start: start.toISOString().slice(0, 10),
          end: end.toISOString().slice(0, 10),
          allDay: true,
          backgroundColor: color.bg,
          borderColor: color.border,
          textColor: color.text,
          classNames: dotted ? ["fc-event-opportunity"] : undefined,
          extendedProps: { raw: e },
        } satisfies EventInput;
      });
  }, [events]);

  const onEventClick = (arg: EventClickArg) => {
    const raw = arg.event.extendedProps.raw as CalendarEvent | undefined;
    if (raw) setSelected(raw);
  };

  return (
    <>
      <div className="rounded-xl border bg-card p-3 text-foreground [&_.fc]:font-sans [&_.fc-event-opportunity]:border-dashed [&_.fc-event-opportunity]:opacity-80 [&_.fc-toolbar-title]:text-base [&_.fc-toolbar-title]:font-semibold [&_a]:!text-foreground [&_.fc-button]:!bg-muted [&_.fc-button]:!text-foreground [&_.fc-button]:!border-border [&_.fc-button-active]:!bg-primary [&_.fc-button-active]:!text-primary-foreground">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,listYear",
          }}
          locale={esLocale}
          firstDay={1}
          weekNumbers
          weekNumberFormat={{ week: "numeric" }}
          height="auto"
          events={calendarEvents}
          eventClick={onEventClick}
          dayMaxEventRows={3}
          eventDisplay="block"
        />
      </div>

      <Sheet open={!!selected} onOpenChange={(o: boolean) => !o && setSelected(null)}>
        <SheetContent>
          {selected ? (
            <>
              <SheetHeader>
                <div className="flex items-center gap-2">
                  <SheetTitle>{selected.clientName ?? "—"}</SheetTitle>
                  <Badge
                    variant="outline"
                    className="h-5 px-1.5 text-[10px] capitalize"
                  >
                    {selected.source_type === "opportunity" ? "Oportunidad" : "Contrato"}
                  </Badge>
                </div>
                <SheetDescription>
                  {selected.varietyName ?? "—"}
                  {selected.speciesName ? ` · ${selected.speciesName}` : ""}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-4 px-4 pb-6">
                <dl className="grid grid-cols-2 gap-x-2 gap-y-3 text-xs">
                  <dt className="text-muted-foreground">Cantidad</dt>
                  <dd className="font-medium tabular-nums">
                    {formatNumber(Number(selected.qty ?? 0))} plantas
                  </dd>
                  <dt className="text-muted-foreground">Semana</dt>
                  <dd className="font-medium tabular-nums">
                    {selected.year}-W{String(selected.week ?? 0).padStart(2, "0")}
                  </dd>
                  <dt className="text-muted-foreground">Estado / Stage</dt>
                  <dd className="font-medium">
                    <Badge variant="outline" className="h-5 px-1.5 text-[10px] capitalize">
                      {selected.status ?? "—"}
                    </Badge>
                  </dd>
                  {selected.source_type === "opportunity" ? (
                    <>
                      <dt className="text-muted-foreground">Probabilidad</dt>
                      <dd className="font-medium tabular-nums">
                        {selected.probability_pct ?? 0}%
                      </dd>
                    </>
                  ) : null}
                  <dt className="text-muted-foreground">Owner</dt>
                  <dd className="font-medium">{selected.ownerName ?? "—"}</dd>
                  <dt className="text-muted-foreground">Organización</dt>
                  <dd className="font-medium">{selected.organizationName ?? "—"}</dd>
                </dl>

                <div className="border-t pt-4">
                  {selected.source_type === "opportunity" ? (
                    <Link
                      href={`/oportunidades/${selected.source_id}`}
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Ver oportunidad →
                    </Link>
                  ) : (
                    <Link
                      href={`/contratos/${selected.source_id}`}
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Ver contrato →
                    </Link>
                  )}
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
