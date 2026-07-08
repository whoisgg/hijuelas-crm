import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Dna,
  Mail,
  Phone,
  ShieldCheck,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { getKAMDetail } from "@/lib/actions/kam";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CountryFlag } from "@/components/clientes/country-flag";
import { ContractStatusBadge } from "@/components/contratos/status-badge";
import { Button } from "@/components/ui/button";
import { isInPeriod, resolveKamPeriod } from "@/lib/kam-period";
import { parseKamStatuses } from "@/lib/kam-status";
import { parseContractConditions } from "@/lib/contract-condition";
import { KamPeriodFilter } from "@/components/kam/kam-period-filter";
import { KamStatusFilter } from "@/components/kam/kam-status-filter";
import { KamConditionFilter } from "@/components/kam/kam-condition-filter";
import { ContractConditionBadge } from "@/components/contratos/condition-badge";
import { DocTypeBadge } from "@/components/contratos/doc-type-badge";
import {
  formatCompact,
  formatMoneyCompact,
  formatMoney,
} from "@/components/contratos/format";
import type { Database } from "@/lib/database.types";

type ContractStatus = Database["public"]["Enums"]["contract_status"];

export const dynamic = "force-dynamic";

const numFmt = new Intl.NumberFormat("es-CL");
const dateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
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

export default async function KAMDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    period?: string;
    statuses?: string;
    conditions?: string;
  }>;
}) {
  const { id } = await params;
  const {
    period: rawPeriod,
    statuses: rawStatuses,
    conditions: rawConditions,
  } = await searchParams;
  const period = resolveKamPeriod(rawPeriod);
  const statuses = parseKamStatuses(rawStatuses);
  const conditions = parseContractConditions(rawConditions);

  let data;
  try {
    data = await getKAMDetail(id, rawStatuses, rawConditions);
  } catch {
    notFound();
  }
  if (!data.user) notFound();

  const { user, contracts, groups } = data;

  // Summary metrics (respeta el filtro de status + período)
  const totalFiltered = contracts.length;
  const periodContracts = contracts.filter((c) =>
    isInPeriod(c.signed_at ?? c.created_at, period),
  );
  const plantsInPeriod = periodContracts.reduce((s, c) => s + c.totalPlants, 0);
  const usdInPeriod = periodContracts.reduce((s, c) => s + c.totalUsd, 0);
  const plantsAll = contracts.reduce((s, c) => s + c.totalPlants, 0);
  const usdAll = contracts.reduce((s, c) => s + c.totalUsd, 0);

  return (
    <AppShell>
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" render={<Link href="/kam" />}>
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Button>
        <KamPeriodFilter value={period.value} />
      </div>

      <Card className="mb-4 p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-base font-medium">
              {initials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{user.full_name ?? "Sin nombre"}</h2>
              {!user.is_active ? (
                <Badge variant="secondary">Inactivo</Badge>
              ) : null}
              <Badge variant="outline">
                <ShieldCheck className="mr-1 h-3 w-3" />
                {ROLE_LABELS[user.role] ?? user.role}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {user.email ? (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {user.email}
                </span>
              ) : null}
              {user.phone ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {user.phone}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label="Contratos (filtro)" value={numFmt.format(totalFiltered)} />
          <Metric
            label="Plantas total"
            value={formatCompact(plantsAll)}
            fullValue={numFmt.format(plantsAll)}
          />
          <Metric
            label="Revenue total"
            value={formatMoneyCompact(usdAll, "USD")}
            fullValue={formatMoney(usdAll, "USD")}
          />
          <Metric
            label={`Plantas ${period.shortLabel}`}
            value={formatCompact(plantsInPeriod)}
            fullValue={numFmt.format(plantsInPeriod)}
            accent
          />
          <Metric
            label={`Revenue ${period.shortLabel}`}
            value={formatMoneyCompact(usdInPeriod, "USD")}
            fullValue={formatMoney(usdInPeriod, "USD")}
            accent
          />
        </div>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <KamStatusFilter selected={statuses} />
        <KamConditionFilter selected={conditions} size="sm" />
      </div>
      <p className="-mt-2 mb-3 text-xs text-muted-foreground">
        Agrupado por{" "}
        <span className="font-medium text-foreground">programa genético</span> ·
        país · contrato
      </p>

      {groups.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Este KAM no tiene contratos asignados con los filtros actuales.
        </Card>
      ) : (
        <div className="space-y-3">
          {groups.map((pg, pgIdx) => (
            <details
              key={pg.id}
              open={pgIdx === 0}
              className="group/program overflow-hidden rounded-lg border bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/program:rotate-90" />
                <Dna className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{pg.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {pg.byCountry.length} {pg.byCountry.length === 1 ? "país" : "países"} ·{" "}
                    {pg.contractCount} {pg.contractCount === 1 ? "contrato" : "contratos"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-right">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Plantas
                    </div>
                    <div
                      className="font-mono text-sm font-bold tabular-nums"
                      title={numFmt.format(pg.plants)}
                    >
                      {formatCompact(pg.plants)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      USD
                    </div>
                    <div
                      className="font-mono text-sm font-bold tabular-nums"
                      title={formatMoney(pg.usd, "USD")}
                    >
                      {formatMoneyCompact(pg.usd, "USD")}
                    </div>
                  </div>
                </div>
              </summary>

              <div className="border-t bg-background/50 px-2 py-2">
                {pg.byCountry.map((cg) => (
                  <details
                    key={`${pg.id}-${cg.iso2}`}
                    open
                    className="group/country mb-1 overflow-hidden rounded-md last:mb-0"
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/40">
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/country:rotate-90" />
                      <CountryFlag iso2={cg.iso2} name={cg.name} size="sm" />
                      <Badge variant="outline" className="text-[10px]">
                        {cg.contractCount}{" "}
                        {cg.contractCount === 1 ? "contrato" : "contratos"}
                      </Badge>
                      <div className="ml-auto flex shrink-0 items-center gap-4 text-right">
                        <div
                          className="font-mono text-xs font-semibold tabular-nums"
                          title={numFmt.format(cg.plants)}
                        >
                          {formatCompact(cg.plants)}{" "}
                          <span className="text-[10px] text-muted-foreground">
                            plantas
                          </span>
                        </div>
                        <div
                          className="font-mono text-xs font-semibold tabular-nums"
                          title={formatMoney(cg.usd, "USD")}
                        >
                          {formatMoneyCompact(cg.usd, "USD")}
                        </div>
                      </div>
                    </summary>

                    <div className="ml-7 mt-1 mr-2 mb-2 overflow-hidden rounded-md border bg-card">
                      <table className="w-full text-xs">
                        <thead className="text-[10px] text-muted-foreground">
                          <tr className="border-b">
                            <th className="px-3 py-1.5 text-left font-medium">
                              # Contrato
                            </th>
                            <th className="px-3 py-1.5 text-left font-medium">
                              Cliente
                            </th>
                            <th className="px-3 py-1.5 text-left font-medium">
                              Estado
                            </th>
                            <th className="px-3 py-1.5 text-right font-medium">
                              Plantas
                            </th>
                            <th className="px-3 py-1.5 text-right font-medium">
                              USD
                            </th>
                            <th className="px-3 py-1.5 text-left font-medium">
                              Firma
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {cg.contracts.map((c) => (
                            <tr
                              key={`${c.id}-${pg.id}-${cg.iso2}`}
                              className="border-b last:border-b-0 hover:bg-muted/40"
                            >
                              <td className="px-3 py-1.5 font-mono">
                                <Link
                                  href={`/contratos/${c.id}`}
                                  className="hover:underline"
                                >
                                  {c.number}
                                </Link>
                              </td>
                              <td className="px-3 py-1.5">{c.clientName ?? "—"}</td>
                              <td className="px-3 py-1.5">
                                <div className="flex flex-wrap items-center gap-1">
                                  <ContractStatusBadge
                                    status={c.status as ContractStatus}
                                  />
                                  {c.condition !== "venta" ? (
                                    <ContractConditionBadge
                                      condition={c.condition}
                                    />
                                  ) : null}
                                  {c.docType !== "contrato" ? (
                                    <DocTypeBadge docType={c.docType} short />
                                  ) : null}
                                </div>
                              </td>
                              <td
                                className="px-3 py-1.5 text-right font-mono tabular-nums"
                                title={
                                  c.contractTotalPlants > 0
                                    ? `${numFmt.format(c.plants)} de ${numFmt.format(c.contractTotalPlants)} plantas del contrato`
                                    : numFmt.format(c.plants)
                                }
                              >
                                {numFmt.format(c.plants)}
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                                {formatMoney(c.usd, "USD")}
                              </td>
                              <td className="px-3 py-1.5 text-[10px] text-muted-foreground">
                                {c.signed_at
                                  ? dateFmt.format(new Date(c.signed_at))
                                  : "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function Metric({
  label,
  value,
  fullValue,
  accent,
}: {
  label: string;
  value: string;
  fullValue?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div
        className={
          "font-mono tabular-nums " +
          (accent
            ? "text-lg font-bold text-foreground"
            : "text-base font-semibold")
        }
        title={fullValue}
      >
        {value}
      </div>
    </div>
  );
}
