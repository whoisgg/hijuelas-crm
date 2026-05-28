"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Sparkles, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CountryFlag } from "@/components/clientes/country-flag";
import { KAM_STATUS_GROUPS, type KamStatusKey } from "@/lib/kam-status";
import type { ForecastResult } from "@/lib/actions/forecast";

type Kam = { id: string; label: string; role: string };
type Org = { id: string; name: string; prefix: string | null };

type Props = {
  forecast: ForecastResult;
  kams: Kam[];
  orgs: Org[];
  year: number;
  statusKeys: Set<KamStatusKey>;
  kamId: string | null;
  orgId: string | null;
  includeOpps: boolean;
  minYear: number;
};

const MONTHS_ES = [
  "Ene", "Feb", "Mar", "Abr", "May", "Jun",
  "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
];

const numFmt = new Intl.NumberFormat("es-CL");
const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtPlants(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  return numFmt.format(n);
}

export function ForecastView({
  forecast,
  kams,
  orgs,
  year,
  statusKeys,
  kamId,
  orgId,
  includeOpps,
  minYear,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  function pushParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  }

  function toggleStatus(key: KamStatusKey) {
    const next = new Set(statusKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const csv = Array.from(next).join(",");
    pushParams({ statuses: csv || null });
  }

  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = minYear; y <= currentYear + 3; y++) yearOptions.push(y);

  const totals = forecast.totals;
  const showPipelineCol = includeOpps;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={String(year)}
          onValueChange={(v) => v && pushParams({ year: v })}
        >
          <SelectTrigger className="h-9 w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {yearOptions.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Status checkboxes — mismo patrón que /kam */}
        <div className="flex flex-wrap gap-1">
          {KAM_STATUS_GROUPS.map((g) => {
            const active = statusKeys.has(g.key);
            return (
              <label
                key={g.key}
                className={cn(
                  "inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors",
                  active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted",
                )}
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={active}
                  onChange={() => toggleStatus(g.key)}
                />
                {g.label}
              </label>
            );
          })}
        </div>

        <Select
          value={orgId ?? "all"}
          onValueChange={(v) => pushParams({ org: v && v !== "all" ? v : null })}
        >
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Organización" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las orgs</SelectItem>
            {orgs.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.prefix ? `${o.prefix} · ${o.name}` : o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={kamId ?? "all"}
          onValueChange={(v) => pushParams({ kam: v && v !== "all" ? v : null })}
        >
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="KAM" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los KAMs</SelectItem>
            {kams
              .filter((k) => k.role === "sales")
              .map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        {/* Toggle Oportunidades */}
        <label className="ml-auto inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs">
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-muted-foreground">Incluir oportunidades</span>
          <Switch
            checked={includeOpps}
            onCheckedChange={(checked) =>
              pushParams({ opps: checked ? "1" : null })
            }
          />
        </label>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label={`Facturación ${year}`} value={usdFmt.format(totals.billing_usd)} highlight />
        <Kpi
          label={`Anticipos de contratos a facturar ${year}`}
          value={usdFmt.format(totals.anticipos_paid_usd)}
          sub={
            totals.anticipos_paid_count > 0
              ? `${totals.anticipos_paid_count} anticipos pagados (cualquier fecha)`
              : "Sin anticipos asociados"
          }
          tone="cash"
        />
        <Kpi label="Plantas comprometidas" value={fmtPlants(totals.plants_total)} />
        <Kpi label="Contratos" value={numFmt.format(totals.contracts_count)} />
        <Kpi label="Clientes" value={numFmt.format(totals.clients_count)} />
        {includeOpps ? (
          <Kpi
            label={`Pipeline ${year} (weighted)`}
            value={usdFmt.format(totals.pipeline_usd)}
            sub={`${totals.pipeline_count} oportunidades`}
            tone="warn"
          />
        ) : null}
      </div>

      {/* Tabla mensual */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Proyección mensual {year}
          </CardTitle>
          <CardDescription>
            Items <strong>pendientes</strong> de entrega (qty_delivered &lt; qty_plants),
            facturación atómica por item (no se prorratea por % entregado). Excluye
            reposición/muestra y legacy sin precio. USD usando fx_rate del contrato.
            {year === currentYear ? " · Mostrando desde el mes actual." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-10" />
                  <th className="px-3 py-2 text-left">Mes</th>
                  <th className="px-3 py-2 text-right">Plantas</th>
                  <th className="px-3 py-2 text-right">Clientes</th>
                  <th className="px-3 py-2 text-right">Facturación USD</th>
                  {showPipelineCol ? (
                    <th className="px-3 py-2 text-right">
                      <span className="inline-flex items-center gap-1">
                        <Sparkles className="h-3 w-3 text-amber-500" />
                        Pipeline USD
                      </span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {forecast.by_month.map((m) => {
                  const isExpanded = expanded.has(m.month);
                  const hasData =
                    m.billing_usd > 0 ||
                    m.plants > 0 ||
                    (showPipelineCol && m.pipeline_usd > 0);
                  return (
                    <React.Fragment key={m.month}>
                      <tr
                        className={cn(
                          "transition-colors",
                          hasData && "cursor-pointer hover:bg-muted/30",
                          !hasData && "opacity-50",
                        )}
                        onClick={() => {
                          if (!hasData) return;
                          setExpanded((prev) => {
                            const next = new Set(prev);
                            if (next.has(m.month)) next.delete(m.month);
                            else next.add(m.month);
                            return next;
                          });
                        }}
                      >
                        <td className="px-3 py-2">
                          {hasData ? (
                            isExpanded ? (
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 text-muted-foreground" />
                            )
                          ) : null}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {MONTHS_ES[m.month - 1]}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {hasData ? fmtPlants(m.plants) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {hasData ? numFmt.format(m.clients_count) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">
                          {hasData ? usdFmt.format(m.billing_usd) : "—"}
                        </td>
                        {showPipelineCol ? (
                          <td className="px-3 py-2 text-right tabular-nums text-amber-600 dark:text-amber-500">
                            {m.pipeline_usd > 0 ? (
                              <span title={`${m.pipeline_count} oportunidades (weighted)`}>
                                {usdFmt.format(m.pipeline_usd)}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        ) : null}
                      </tr>
                      {isExpanded && m.by_client.length > 0 ? (
                        <tr className="bg-muted/10">
                          <td colSpan={showPipelineCol ? 6 : 5} className="px-3 py-3">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="text-[10px] uppercase text-muted-foreground">
                                  <tr>
                                    <th className="px-2 py-1 text-left">Cliente</th>
                                    <th className="px-2 py-1 text-left">País</th>
                                    <th className="px-2 py-1 text-left">Variedades</th>
                                    <th className="px-2 py-1 text-right">Plantas</th>
                                    <th className="px-2 py-1 text-right">Facturación USD</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/40">
                                  {m.by_client.map((c) => (
                                    <tr key={c.client_id}>
                                      <td className="px-2 py-1.5">
                                        <a
                                          href={`/clientes/${c.client_id}`}
                                          className="text-primary hover:underline"
                                        >
                                          {c.client_name}
                                        </a>
                                      </td>
                                      <td className="px-2 py-1.5">
                                        {c.country_iso2 ? (
                                          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                                            <CountryFlag
                                              iso2={c.country_iso2}
                                              size="sm"
                                              showName={false}
                                            />
                                            {c.country_name ?? c.country_iso2}
                                          </span>
                                        ) : (
                                          "—"
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5">
                                        {c.varieties && c.varieties.length > 0 ? (
                                          <div className="flex flex-wrap gap-1">
                                            {c.varieties.map((v) => (
                                              <Badge
                                                key={v}
                                                variant="outline"
                                                className="text-[10px] font-normal"
                                              >
                                                {v}
                                              </Badge>
                                            ))}
                                          </div>
                                        ) : (
                                          <span className="text-muted-foreground">—</span>
                                        )}
                                      </td>
                                      <td className="px-2 py-1.5 text-right tabular-nums">
                                        {fmtPlants(c.plants)}
                                      </td>
                                      <td className="px-2 py-1.5 text-right tabular-nums font-medium">
                                        {usdFmt.format(c.billing_usd)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/40 text-sm">
                <tr>
                  <td className="px-3 py-2" />
                  <td className="px-3 py-2 font-semibold">Total {year}</td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {fmtPlants(totals.plants_total)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">
                    {numFmt.format(totals.clients_count)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-bold text-primary">
                    {usdFmt.format(totals.billing_usd)}
                  </td>
                  {showPipelineCol ? (
                    <td className="px-3 py-2 text-right tabular-nums font-bold text-amber-600 dark:text-amber-500">
                      {usdFmt.format(totals.pipeline_usd)}
                    </td>
                  ) : null}
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-1.5 text-[10px]">v2</Badge>
        Regla de facturación: <strong>solo items pendientes</strong> (qty_delivered &lt; qty_plants);
        items ya entregados al 100% se consideran facturados y NO entran al forecast.
        Pipeline (opps) = estimated_value_usd × probability_pct / 100 con expected_close_date en el período.
        <strong> Anticipos</strong>: suma <em>todos</em> los anticipos pagados (anticipo_1 + anticipo_2)
        de los contratos que componen el billing del año — no filtra por fecha de cobro del anticipo,
        sino por elegibilidad del contrato para facturar en {year}.
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
  tone?: "warn" | "cash";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        highlight && "border-primary/40 bg-primary/5",
        tone === "warn" && "border-amber-500/30 bg-amber-500/5",
        tone === "cash" && "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          highlight && "text-primary",
          tone === "warn" && "text-amber-600 dark:text-amber-500",
          tone === "cash" && "text-emerald-600 dark:text-emerald-500",
        )}
      >
        {value}
      </div>
      {sub ? <div className="mt-0.5 text-[10px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}
