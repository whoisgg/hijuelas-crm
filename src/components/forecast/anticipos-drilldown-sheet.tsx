"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, TrendingUp, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { CountryFlag } from "@/components/clientes/country-flag";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getForecastContractsAnticipos,
  type ForecastContractAnticipoRow,
} from "@/lib/actions/forecast";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  year: number;
  statusIn: string[];
  countryId: string | null;
  kamId: string | null;
  organizationId: string | null;
  fromMonth: number;
};

const usdFmt = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function fmtPlants(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  return new Intl.NumberFormat("es-CL").format(n);
}

export function AnticiposDrilldownSheet({
  open,
  onOpenChange,
  year,
  statusIn,
  countryId,
  kamId,
  organizationId,
  fromMonth,
}: Props) {
  const [rows, setRows] = React.useState<ForecastContractAnticipoRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getForecastContractsAnticipos({
      year,
      country_id: countryId,
      kam_id: kamId,
      organization_id: organizationId,
      status_in: statusIn,
      from_month: fromMonth,
    })
      .then((data) => {
        if (cancelled) return;
        setRows(data?.contracts ?? []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Error desconocido");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, year, countryId, kamId, organizationId, fromMonth, statusIn]);

  const withAnticipos = rows?.filter((r) => r.anticipos_count > 0) ?? [];
  const withoutAnticipos = rows?.filter((r) => r.anticipos_count === 0) ?? [];
  const billingTotal = (rows ?? []).reduce((acc, r) => acc + r.billing_usd, 0);
  const anticiposTotal = withAnticipos.reduce((acc, r) => acc + r.anticipos_usd, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="!max-w-3xl w-full sm:!max-w-3xl"
      >
        <SheetHeader className="border-b">
          <SheetTitle className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
            Anticipos por contrato — {year}
          </SheetTitle>
          <SheetDescription>
            {rows
              ? `${rows.length} contratos elegibles · ${withAnticipos.length} con anticipo · ${usdFmt.format(anticiposTotal)} en cash`
              : "Cargando contratos elegibles…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Cargando…
            </div>
          ) : error ? (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">No se pudo cargar el detalle</div>
                <div className="text-xs">{error}</div>
              </div>
            </div>
          ) : rows && rows.length === 0 ? (
            <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              No hay contratos elegibles para facturación en {year} con estos filtros.
            </div>
          ) : (
            <div className="space-y-4">
              {/* Con anticipos */}
              {withAnticipos.length > 0 && (
                <Section
                  title={`Con anticipo pagado · ${withAnticipos.length}`}
                  total={usdFmt.format(anticiposTotal)}
                  totalLabel="Anticipos"
                  highlight
                >
                  <ContractsTable rows={withAnticipos} year={year} showAnticipos />
                </Section>
              )}

              {/* Sin anticipos */}
              {withoutAnticipos.length > 0 && (
                <Section
                  title={`Sin anticipo todavía · ${withoutAnticipos.length}`}
                  total={usdFmt.format(
                    withoutAnticipos.reduce((acc, r) => acc + r.billing_usd, 0),
                  )}
                  totalLabel="Por facturar"
                >
                  <ContractsTable
                    rows={withoutAnticipos}
                    year={year}
                    showAnticipos={false}
                  />
                </Section>
              )}

              {/* Resumen total */}
              <div className="rounded-md border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>Total facturable {year}</span>
                  <span className="font-mono font-semibold text-foreground">
                    {usdFmt.format(billingTotal)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between text-emerald-700 dark:text-emerald-500">
                  <span>Anticipos cobrados (de esos contratos)</span>
                  <span className="font-mono font-semibold">
                    {usdFmt.format(anticiposTotal)}
                  </span>
                </div>
                <div className="mt-1 flex justify-between">
                  <span>Saldo por cobrar (estimado)</span>
                  <span className="font-mono font-semibold text-foreground">
                    {usdFmt.format(Math.max(0, billingTotal - anticiposTotal))}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Section({
  title,
  total,
  totalLabel,
  highlight,
  children,
}: {
  title: string;
  total: string;
  totalLabel: string;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card",
        highlight && "border-emerald-500/30 bg-emerald-500/5",
      )}
    >
      <div
        className={cn(
          "flex items-center justify-between border-b px-3 py-2 text-xs uppercase tracking-wider",
          highlight ? "text-emerald-700 dark:text-emerald-500" : "text-muted-foreground",
        )}
      >
        <span className="font-medium">{title}</span>
        <span className="font-mono normal-case tracking-normal">
          {totalLabel}: <strong>{total}</strong>
        </span>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

function ContractsTable({
  rows,
  showAnticipos,
}: {
  rows: ForecastContractAnticipoRow[];
  year: number;
  showAnticipos: boolean;
}) {
  return (
    <table className="w-full text-xs">
      <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
        <tr>
          <th className="px-2 py-1.5 text-left">Contrato</th>
          <th className="px-2 py-1.5 text-left">Cliente</th>
          <th className="px-2 py-1.5 text-left">País</th>
          <th className="px-2 py-1.5 text-right">Facturable</th>
          {showAnticipos ? (
            <th className="px-2 py-1.5 text-right text-emerald-700 dark:text-emerald-500">
              Anticipo
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody className="divide-y divide-border/40">
        {rows.map((r) => (
          <tr key={r.contract_id} className="hover:bg-muted/30">
            <td className="px-2 py-1.5">
              <Link
                href={`/contratos/${r.contract_id}`}
                className="font-mono text-[11px] text-primary hover:underline"
              >
                {r.number}
              </Link>
              <div className="text-[10px] text-muted-foreground">
                {fmtPlants(r.plants)} pl · {r.status}
              </div>
            </td>
            <td className="px-2 py-1.5">
              <Link
                href={`/clientes/${r.client_id}`}
                className="hover:underline"
              >
                {r.client_name}
              </Link>
              {r.organization_prefix ? (
                <div className="text-[10px] text-muted-foreground">
                  {r.organization_prefix}
                </div>
              ) : null}
            </td>
            <td className="px-2 py-1.5">
              {r.country_iso2 ? (
                <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                  <CountryFlag iso2={r.country_iso2} size="sm" showName={false} />
                  <span className="text-[11px]">
                    {r.country_name ?? r.country_iso2}
                  </span>
                </span>
              ) : (
                "—"
              )}
            </td>
            <td className="px-2 py-1.5 text-right font-mono tabular-nums">
              {usdFmt.format(r.billing_usd)}
            </td>
            {showAnticipos ? (
              <td className="px-2 py-1.5 text-right">
                <div className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-500">
                  {usdFmt.format(r.anticipos_usd)}
                </div>
                <Badge variant="outline" className="text-[9px] font-normal">
                  {r.anticipos_count} pago{r.anticipos_count === 1 ? "" : "s"}
                </Badge>
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
