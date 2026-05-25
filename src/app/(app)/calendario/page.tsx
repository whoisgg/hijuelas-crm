import { Suspense } from "react";
import { CalendarRange } from "lucide-react";

import { getCalendarEvents, getSpeciesLookup } from "@/lib/actions/analytics";
import { PageHeader } from "@/components/page-header";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarGrid } from "@/components/calendario/calendar-grid";
import { EmptyState } from "@/components/dashboard/empty-state";

export const metadata = { title: "Calendario" };
export const dynamic = "force-dynamic";

type CalSearchParams = {
  opps?: string;
};

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<CalSearchParams>;
}) {
  const params = await searchParams;
  const includeOpps = params.opps === "1";

  return (
    <AppShell>
      <PageHeader title="Calendario de entregas" />

      <Suspense fallback={<CalendarSkeleton />}>
        <CalendarContent includeOpps={includeOpps} />
      </Suspense>
    </AppShell>
  );
}

async function CalendarContent({ includeOpps }: { includeOpps: boolean }) {
  const [events, species] = await Promise.all([
    getCalendarEvents({
      includeOpportunities: includeOpps,
      fromYear: new Date().getFullYear() - 1,
      toYear: new Date().getFullYear() + 2,
    }),
    getSpeciesLookup(),
  ]);

  if (events.length === 0) {
    return (
      <Card className="p-10">
        <EmptyState
          icon={CalendarRange}
          title="Sin entregas"
          description="No hay entregas ni oportunidades cargadas."
        />
      </Card>
    );
  }

  const speciesOptions = species.map((s) => ({ id: s.id, name: s.label }));

  return (
    <CalendarGrid
      events={events}
      species={speciesOptions}
      initialIncludeOpps={includeOpps}
      visibleWeeks={6}
      visibleMonths={4}
    />
  );
}

function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-[500px] w-full" />
    </div>
  );
}
