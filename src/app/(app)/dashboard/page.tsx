import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import {
  getDashboardKPIs,
  getWeekStripData,
} from "@/lib/actions/analytics";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { WeekStripCalendar } from "@/components/dashboard/week-strip-calendar";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const STRIP_WEEKS = 12;

export default function DashboardPage() {
  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <PageHeader
        title="Dashboard"
        description="Compromisos de entrega por semana — próximas 12 semanas ISO."
        actions={
          <Button
            size="sm"
            render={
              <Link href="/contratos/nuevo">
                <Plus className="size-4" />
                Nuevo contrato
              </Link>
            }
          />
        }
      />

      <Suspense fallback={<WeekStripSkeleton />}>
        <WeekStripSection />
      </Suspense>

      <div className="mt-6">
        <Suspense fallback={<KpiRowSkeleton />}>
          <KpiRowSection />
        </Suspense>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Secciones                                                                   */
/* -------------------------------------------------------------------------- */

async function WeekStripSection() {
  const entries = await getWeekStripData({ weeks: STRIP_WEEKS });
  return <WeekStripCalendar entries={entries} />;
}

async function KpiRowSection() {
  const kpis = await getDashboardKPIs();
  return <KpiRow kpis={kpis} />;
}

/* -------------------------------------------------------------------------- */
/* Skeletons                                                                   */
/* -------------------------------------------------------------------------- */

function WeekStripSkeleton() {
  return (
    <Card>
      <CardHeader className="space-y-2 pb-3">
        <Skeleton className="h-4 w-56" />
        <Skeleton className="h-3 w-80" />
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <div className="min-w-[64rem] space-y-2">
            <Skeleton className="h-5 w-full" />
            <div className="grid grid-cols-12 gap-2">
              {Array.from({ length: STRIP_WEEKS }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function KpiRowSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} size="sm">
          <CardHeader className="pb-2">
            <Skeleton className="h-3 w-24" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
