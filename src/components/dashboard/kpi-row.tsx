import { CalendarClock, CheckCircle2, Sprout, Target } from "lucide-react";

import { formatNumber, formatPercent } from "@/lib/format";
import { KpiCard } from "@/components/dashboard/kpi-card";
import type { DashboardKPIs } from "@/lib/actions/analytics";

export type KpiRowProps = {
  kpis: DashboardKPIs;
};

/**
 * Fila lateral de KPIs compactos del dashboard (4 cards):
 *  - Plantas comprometidas próximas 12 semanas
 *  - Plantas comprometidas YTD
 *  - Plantas entregadas YTD
 *  - % cumplimiento (entregadas / comprometidas YTD)
 */
export function KpiRow({ kpis }: KpiRowProps) {
  const ratio =
    kpis.plantsCommittedYtd > 0
      ? kpis.plantsDeliveredYtd / kpis.plantsCommittedYtd
      : 0;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        label="Próximas 12 sem"
        value={formatNumber(kpis.plantsCommittedNext12w, kpis.plantsCommittedNext12w >= 10_000)}
        helper="plantas comprometidas"
        icon={CalendarClock}
      />
      <KpiCard
        label={`Comprometidas ${kpis.year}`}
        value={formatNumber(kpis.plantsCommittedYtd, kpis.plantsCommittedYtd >= 10_000)}
        helper="plantas YTD"
        icon={Sprout}
      />
      <KpiCard
        label="Entregadas YTD"
        value={formatNumber(kpis.plantsDeliveredYtd, kpis.plantsDeliveredYtd >= 10_000)}
        helper="plantas"
        icon={CheckCircle2}
        tone="positive"
      />
      <KpiCard
        label="Cumplimiento"
        value={formatPercent(ratio, 1)}
        helper={`${formatNumber(kpis.plantsPendingYtd)} pendientes`}
        icon={Target}
        tone={ratio >= 0.8 ? "positive" : ratio >= 0.5 ? "default" : "warning"}
      />
    </div>
  );
}
