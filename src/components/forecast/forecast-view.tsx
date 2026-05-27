"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, TrendingUp } from "lucide-react";

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
import { CountryFlag } from "@/components/clientes/country-flag";
import type { ForecastResult } from "@/lib/actions/forecast";

type Kam = { id: string; label: string; role: string };

type Props = {
  forecast: ForecastResult;
  kams: Kam[];
  year: number;
  kamId: string | null;
  statusFilter: string | null;
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
  year,
  kamId,
  statusFilter,
  minYear,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  function pushParams(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams?.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v === null) params.delete(k);
      else params.set(k, v);
    }
    router.push(`?${params.toString()}`, { scroll: false });
  }

  const currentYear = new Date().getFullYear();
  const yearOptions: number[] = [];
  for (let y = minYear; y <= currentYear + 3; y++) yearOptions.push(y);

  const totals = forecast.totals;

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

        <Select
          value={statusFilter ?? "active"}
          onValueChange={(v) =>
            pushParams({ status: v && v !== "active" ? v : null })
          }
        >
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Activos (sin cancelados)</SelectItem>
            <SelectItem value="signed">Solo firmados</SelectItem>
            <SelectItem value="pending">Solo por firmar</SelectItem>
            <SelectItem value="all">Todos (incl. cancelados)</SelectItem>
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
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Kpi label={`Facturación ${year}`} value={usdFmt.format(totals.billing_usd)} highlight />
        <Kpi label="Plantas comprometidas" value={fmtPlants(totals.plants_total)} />
        <Kpi label="Contratos" value={numFmt.format(totals.contracts_count)} />
        <Kpi label="Clientes" value={numFmt.format(totals.clients_count)} />
      </div>

      {/* Tabla mensual */}
      <Card>
        <CardHeader className="space-y-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-primary" />
            Proyección mensual {year}
          </CardTitle>
          <CardDescription>
            Solo cuenta items con precio (excluye reposición/muestra y contratos
            legacy sin precio). USD usando fx_rate del contrato.
            Click en un mes para ver el drill-down por cliente.
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
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {forecast.by_month.map((m) => {
                  const isExpanded = expanded.has(m.month);
                  const hasData = m.billing_usd > 0 || m.plants > 0;
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
                          {MONTHS_ES[m.month - 1]} {year}
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
                      </tr>
                      {isExpanded && m.by_client.length > 0 ? (
                        <tr className="bg-muted/10">
                          <td colSpan={5} className="px-3 py-3">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead className="text-[10px] uppercase text-muted-foreground">
                                  <tr>
                                    <th className="px-2 py-1 text-left">Cliente</th>
                                    <th className="px-2 py-1 text-left">País</th>
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
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
        <Badge variant="outline" className="mr-1.5 text-[10px]">
          v1
        </Badge>
        El módulo muestra <strong>facturación proyectada</strong> (lo que se va
        a cobrar) según el mes planificado de entrega. <strong>Flujo de caja</strong>{" "}
        (caja real con anticipos) se agregará cuando los <code className="rounded bg-muted px-1">payments</code> tengan{" "}
        <code className="rounded bg-muted px-1">due_date</code> y{" "}
        <code className="rounded bg-muted px-1">amount</code> completos en los contratos.
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3",
        highlight && "border-primary/40 bg-primary/5",
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={cn(
          "mt-1 text-xl font-semibold tabular-nums",
          highlight && "text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}
