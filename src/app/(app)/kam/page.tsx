import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { listKAMs } from "@/lib/actions/kam";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserCheck } from "lucide-react";
import { resolveKamPeriod } from "@/lib/kam-period";
import { parseKamStatuses } from "@/lib/kam-status";
import { parseContractConditions } from "@/lib/contract-condition";
import { KamPeriodFilter } from "@/components/kam/kam-period-filter";
import { KamStatusFilter } from "@/components/kam/kam-status-filter";
import { KamConditionFilter } from "@/components/kam/kam-condition-filter";

export const metadata = { title: "KAM" };
export const dynamic = "force-dynamic";

const numFmt = new Intl.NumberFormat("es-CL");
const usdFmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function initials(name: string | null): string {
  if (!name) return "??";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  sales: "Sales",
  finance: "Finance",
  viewer: "Viewer",
};

export default async function KAMPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    statuses?: string;
    conditions?: string;
  }>;
}) {
  const {
    period: rawPeriod,
    statuses: rawStatuses,
    conditions: rawConditions,
  } = await searchParams;
  const period = resolveKamPeriod(rawPeriod);
  const statuses = parseKamStatuses(rawStatuses);
  const conditions = parseContractConditions(rawConditions);
  const kams = await listKAMs(period.value, rawStatuses, rawConditions);

  // Mantener los searchParams al navegar a un KAM detail
  const childSearch = new URLSearchParams();
  if (period.value !== "current") childSearch.set("period", period.value);
  if (rawStatuses) childSearch.set("statuses", rawStatuses);
  if (rawConditions) childSearch.set("conditions", rawConditions);
  const childQs = childSearch.toString() ? `?${childSearch.toString()}` : "";

  return (
    <AppShell>
      <PageHeader
        title="KAM"
        description={`Key Account Managers · ${period.longLabel}`}
        actions={<KamPeriodFilter value={period.value} />}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <KamStatusFilter selected={statuses} />
        <KamConditionFilter selected={conditions} size="sm" />
      </div>

      {kams.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No hay usuarios registrados. Crealos desde Supabase Auth o invitalos.
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {kams.map((k) => (
            <Link
              key={k.id}
              href={`/kam/${k.id}${childQs}`}
              className="group rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-primary/5"
            >
              <div className="flex items-start gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="text-xs font-medium">
                    {initials(k.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate text-sm font-semibold">
                      {k.fullName ?? "Sin nombre"}
                    </h3>
                    {!k.isActive ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Inactivo
                      </Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{k.email}</p>
                  <Badge variant="outline" className="mt-1 text-[10px]">
                    {ROLE_LABELS[k.role] ?? k.role}
                  </Badge>
                </div>
                <UserCheck className="h-4 w-4 text-muted-foreground transition-opacity opacity-0 group-hover:opacity-100" />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-muted-foreground">Contratos activos</div>
                  <div className="font-mono text-base font-semibold tabular-nums">
                    {numFmt.format(k.activeContracts)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">Histórico</div>
                  <div className="font-mono text-base font-semibold tabular-nums">
                    {numFmt.format(k.totalContracts)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    Plantas {period.shortLabel}
                  </div>
                  <div className="font-mono text-sm font-medium tabular-nums">
                    {numFmt.format(k.plantsInPeriod)}
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground">
                    Revenue {period.shortLabel}
                  </div>
                  <div className="font-mono text-sm font-medium tabular-nums">
                    {usdFmt.format(k.revenueUsdInPeriod)}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </AppShell>
  );
}
