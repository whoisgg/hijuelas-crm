"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  Search,
  Plus,
  List,
  Globe2,
  Building2,
} from "lucide-react";

import type { Database } from "@/lib/database.types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContractStatusBadge } from "@/components/contratos/status-badge";
import { ContractConditionBadge } from "@/components/contratos/condition-badge";
import { ContractConditionFilter } from "@/components/contratos/contract-condition-filter";
import { ContractRowActions } from "@/components/contratos/contract-row-actions";
import { CountryFlag } from "@/components/clientes/country-flag";
import {
  CONTRACT_CONDITION_OPTIONS,
  matchesContractConditions,
  type ContractCondition,
} from "@/lib/contract-condition";
import {
  formatMoney,
  formatMoneyCompact,
  formatCompact,
} from "@/components/contratos/format";
import { FxRatesLegend } from "@/components/contratos/fx-rates-legend";
import type { FxRates } from "@/lib/actions/fx-rates";

type ContractStatus = Database["public"]["Enums"]["contract_status"];

export type SpeciesOption = { id: string; name: string };

export type CountryContractRow = {
  id: string;
  number: string;
  status: ContractStatus;
  condition: ContractCondition;
  signed_at: string | null;
  totalPlants: number;
  totalUsd: number;
  speciesNames: string[];
  client: {
    id: string;
    name: string;
    countryId: string | null;
    countryIso2: string | null;
    countryName: string | null;
  };
  organization: { id: string; name: string } | null;
};

type Props = {
  rows: CountryContractRow[];
  species: SpeciesOption[];
  fxRates: FxRates;
};

const STATUS_FILTERS: { key: "activos" | "por_firmar" | "cancelados"; label: string; matches: ContractStatus[] }[] = [
  { key: "activos", label: "Activos", matches: ["firmado", "en_proceso", "finalizado"] },
  { key: "por_firmar", label: "Por firmar", matches: ["borrador", "por_revisar"] },
  { key: "cancelados", label: "Cancelados", matches: ["cancelado"] },
];

const numFmt = new Intl.NumberFormat("es-CL");

export function ContratosByCountryView({ rows, species, fxRates }: Props) {
  const [search, setSearch] = React.useState("");
  const [speciesId, setSpeciesId] = React.useState<string>("all");
  const [activeStatuses, setActiveStatuses] = React.useState<Set<string>>(
    // Default: todos los buckets activos. Adentro de cada org se ven igual
    // separados por sub-grupos Activos/Por firmar/Cancelados.
    () => new Set(["activos", "por_firmar", "cancelados"]),
  );
  // Condition filter (Venta / Muestra / Reposición). Default: todos.
  const [activeConditions, setActiveConditions] = React.useState<
    Set<ContractCondition>
  >(() => new Set(CONTRACT_CONDITION_OPTIONS.map((o) => o.key)));
  const [drilldown, setDrilldown] = React.useState<{ iso2: string | null }>({
    iso2: null,
  });

  const toggleStatus = (key: string) => {
    setActiveStatuses((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Compute allowed statuses set from checkboxes
  const allowedStatuses = React.useMemo(() => {
    const set = new Set<ContractStatus>();
    for (const f of STATUS_FILTERS) {
      if (activeStatuses.has(f.key)) {
        for (const s of f.matches) set.add(s);
      }
    }
    return set;
  }, [activeStatuses]);

  // Filter rows by search, species, status
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const speciesName =
      speciesId === "all" ? null : species.find((s) => s.id === speciesId)?.name ?? null;
    return rows.filter((r) => {
      if (!allowedStatuses.has(r.status)) return false;
      if (!matchesContractConditions(r.condition, activeConditions)) return false;
      if (speciesName && !r.speciesNames.includes(speciesName)) return false;
      if (q.length > 0) {
        const hit =
          r.number.toLowerCase().includes(q) ||
          r.client.name.toLowerCase().includes(q) ||
          (r.client.countryName ?? "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [rows, search, speciesId, species, allowedStatuses, activeConditions]);

  // Aggregate by country
  type CountryAgg = {
    iso2: string;
    name: string;
    contracts: number;
    clients: Set<string>;
    plants: number;
    usd: number;
  };
  const byCountry = React.useMemo(() => {
    const map = new Map<string, CountryAgg>();
    for (const r of filtered) {
      const iso2 = r.client.countryIso2 ?? "??";
      const name = r.client.countryName ?? "Sin país";
      const key = iso2;
      let agg = map.get(key);
      if (!agg) {
        agg = { iso2, name, contracts: 0, clients: new Set(), plants: 0, usd: 0 };
        map.set(key, agg);
      }
      agg.contracts += 1;
      agg.clients.add(r.client.id);
      agg.plants += r.totalPlants;
      agg.usd += r.totalUsd;
    }
    return Array.from(map.values()).sort((a, b) => b.usd - a.usd);
  }, [filtered]);

  // Rows filtered al país seleccionado (para la vista de organizaciones)
  const rowsInCountry = React.useMemo(() => {
    if (!drilldown.iso2) return [] as CountryContractRow[];
    return filtered.filter((r) => r.client.countryIso2 === drilldown.iso2);
  }, [filtered, drilldown.iso2]);

  const selectedCountryName =
    drilldown.iso2 ? byCountry.find((c) => c.iso2 === drilldown.iso2)?.name ?? "" : "";

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <div className="relative flex flex-1 min-w-[200px] items-center">
          <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar país, cliente o # contrato"
            className="pl-7"
          />
        </div>

        <Select value={speciesId} onValueChange={(v) => setSpeciesId(String(v ?? "all"))}>
          <SelectTrigger className="h-8 w-44">
            {speciesId === "all" ? (
              <span className="text-muted-foreground">Todas las especies</span>
            ) : (
              <SelectValue placeholder="Especie" />
            )}
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las especies</SelectItem>
            {species.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex flex-wrap items-center gap-1">
          {(() => {
            const allActive =
              STATUS_FILTERS.every((f) => activeStatuses.has(f.key));
            return (
              <label
                className={
                  "inline-flex h-8 items-center gap-1.5 cursor-pointer rounded-md border px-2.5 text-xs font-medium transition-colors " +
                  (allActive
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted")
                }
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={allActive}
                  onChange={() => {
                    if (allActive) setActiveStatuses(new Set());
                    else setActiveStatuses(new Set(STATUS_FILTERS.map((f) => f.key)));
                  }}
                />
                Todos
              </label>
            );
          })()}
          {STATUS_FILTERS.map((f) => {
            const active = activeStatuses.has(f.key);
            return (
              <label
                key={f.key}
                className={
                  "inline-flex h-8 items-center gap-1.5 cursor-pointer rounded-md border px-2.5 text-xs font-medium transition-colors " +
                  (active
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:bg-muted")
                }
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={active}
                  onChange={() => toggleStatus(f.key)}
                />
                {f.label}
              </label>
            );
          })}
        </div>

        {/* Condition filter (Venta / Muestra / Reposición) */}
        <ContractConditionFilter
          selected={activeConditions}
          onChange={setActiveConditions}
        />

        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" render={<Link href="/contratos?view=list" />}>
            <List className="h-4 w-4" />
            Vista lista
          </Button>
          <Button render={<Link href="/contratos/nuevo" />}>
            <Plus className="h-4 w-4" />
            Nuevo contrato
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      {drilldown.iso2 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => setDrilldown({ iso2: null })}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Globe2 className="h-3.5 w-3.5" />
            Países
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">{selectedCountryName}</span>
        </div>
      ) : null}

      {/* FX rates legend */}
      <div className="flex items-center justify-end">
        <FxRatesLegend initial={fxRates} />
      </div>

      {/* Summary totales — siempre visible, se filtran con drill-down + filtros activos */}
      <SummaryTotals
        countries={byCountry}
        drillCountry={
          drilldown.iso2
            ? byCountry.find((c) => c.iso2 === drilldown.iso2)
            : null
        }
      />

      {/* Body */}
      {!drilldown.iso2 ? (
        <CountryGrid
          countries={byCountry}
          onSelect={(iso2) => setDrilldown({ iso2 })}
        />
      ) : (
        <OrganizationsForCountry rows={rowsInCountry} />
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay contratos para los filtros aplicados.
        </div>
      ) : null}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Summary totales — adapta el alcance según el drill-down
// ----------------------------------------------------------------------------
function SummaryTotals({
  countries,
  drillCountry,
}: {
  countries: {
    iso2: string;
    name: string;
    contracts: number;
    clients: Set<string>;
    plants: number;
    usd: number;
  }[];
  drillCountry?: {
    iso2: string;
    name: string;
    contracts: number;
    clients: Set<string>;
    plants: number;
    usd: number;
  } | null;
}) {
  const totals = React.useMemo(() => {
    if (drillCountry) {
      return {
        scope: "country" as const,
        countries: 1,
        contracts: drillCountry.contracts,
        clients: drillCountry.clients.size,
        plants: drillCountry.plants,
        usd: drillCountry.usd,
      };
    }
    let contracts = 0;
    let clients = 0;
    let plants = 0;
    let usd = 0;
    for (const c of countries) {
      contracts += c.contracts;
      clients += c.clients.size;
      plants += c.plants;
      usd += c.usd;
    }
    return {
      scope: "global" as const,
      countries: countries.length,
      contracts,
      clients,
      plants,
      usd,
    };
  }, [countries, drillCountry]);

  const plantsLabel =
    totals.scope === "country" ? "Plantas país" : "Total plantas";
  const usdLabel =
    totals.scope === "country" ? "USD país" : "Total USD";

  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryStat label="Países" value={numFmt.format(totals.countries)} />
        <SummaryStat label="Contratos" value={numFmt.format(totals.contracts)} />
        <SummaryStat label="Clientes" value={numFmt.format(totals.clients)} />
        <SummaryStat
          label={plantsLabel}
          value={formatCompact(totals.plants)}
          fullValue={numFmt.format(totals.plants)}
          accent
        />
        <SummaryStat
          label={usdLabel}
          value={formatMoneyCompact(totals.usd, "USD")}
          fullValue={formatMoney(totals.usd, "USD")}
          accent
        />
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  fullValue,
  accent,
}: {
  label: string;
  value: string;
  /** Valor completo (sin abreviar) para tooltip. Opcional. */
  fullValue?: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
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

// ----------------------------------------------------------------------------
// Country grid
// ----------------------------------------------------------------------------
function CountryGrid({
  countries,
  onSelect,
}: {
  countries: {
    iso2: string;
    name: string;
    contracts: number;
    clients: Set<string>;
    plants: number;
    usd: number;
  }[];
  onSelect: (iso2: string) => void;
}) {
  if (countries.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {countries.map((c) => (
        <button
          key={c.iso2}
          type="button"
          onClick={() => onSelect(c.iso2)}
          className="group rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">
                <CountryFlag iso2={c.iso2} />
              </span>
              <span className="text-base font-semibold">{c.name}</span>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">Contratos</div>
              <div className="font-mono text-lg font-semibold tabular-nums">{numFmt.format(c.contracts)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Clientes</div>
              <div className="font-mono text-lg font-semibold tabular-nums">{numFmt.format(c.clients.size)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Plantas</div>
              <div
                className="font-mono text-sm font-medium tabular-nums"
                title={numFmt.format(c.plants)}
              >
                {formatCompact(c.plants)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">USD</div>
              <div
                className="font-mono text-sm font-medium tabular-nums"
                title={formatMoney(c.usd, "USD")}
              >
                {formatMoneyCompact(c.usd, "USD")}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Organizations inside a country → status sub-groups → contracts
// ----------------------------------------------------------------------------

type OrgStatusBucket = {
  key: "activos" | "por_firmar" | "cancelados";
  label: string;
  contracts: CountryContractRow[];
  plants: number;
  usd: number;
};

type OrgGroup = {
  id: string;
  name: string;
  contractCount: number;
  plants: number;
  usd: number;
  buckets: OrgStatusBucket[];
};

function statusBucketKey(
  status: ContractStatus,
): "activos" | "por_firmar" | "cancelados" | null {
  for (const f of STATUS_FILTERS) {
    if ((f.matches as readonly string[]).includes(status)) return f.key;
  }
  return null;
}

function OrganizationsForCountry({ rows }: { rows: CountryContractRow[] }) {
  const orgs: OrgGroup[] = React.useMemo(() => {
    const orgMap = new Map<string, OrgGroup>();
    for (const r of rows) {
      const orgId = r.organization?.id ?? "__no_org__";
      const orgName = r.organization?.name ?? "Sin organización";
      let org = orgMap.get(orgId);
      if (!org) {
        org = {
          id: orgId,
          name: orgName,
          contractCount: 0,
          plants: 0,
          usd: 0,
          buckets: STATUS_FILTERS.map((f) => ({
            key: f.key,
            label: f.label,
            contracts: [],
            plants: 0,
            usd: 0,
          })),
        };
        orgMap.set(orgId, org);
      }
      org.contractCount += 1;
      org.plants += r.totalPlants;
      org.usd += r.totalUsd;

      const bKey = statusBucketKey(r.status);
      if (!bKey) continue;
      const bucket = org.buckets.find((b) => b.key === bKey)!;
      bucket.contracts.push(r);
      bucket.plants += r.totalPlants;
      bucket.usd += r.totalUsd;
    }
    return Array.from(orgMap.values())
      .map((o) => ({
        ...o,
        buckets: o.buckets
          .filter((b) => b.contracts.length > 0)
          .map((b) => ({
            ...b,
            // Contratos dentro del bucket: USD descendente.
            contracts: [...b.contracts].sort((x, y) => y.totalUsd - x.totalUsd),
          })),
      }))
      .sort((a, b) => b.usd - a.usd);
  }, [rows]);

  if (orgs.length === 0) return null;

  return (
    <div className="space-y-3">
      {orgs.map((org) => (
        <details
          key={org.id}
          open
          className="group/org overflow-hidden rounded-lg border bg-card"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/org:rotate-90" />
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">{org.name}</div>
              <div className="text-[11px] text-muted-foreground">
                {org.contractCount}{" "}
                {org.contractCount === 1 ? "contrato" : "contratos"} ·{" "}
                {org.buckets.length}{" "}
                {org.buckets.length === 1 ? "estado" : "estados"}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-4 text-right">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Plantas
                </div>
                <div
                  className="font-mono text-sm font-bold tabular-nums"
                  title={numFmt.format(org.plants)}
                >
                  {formatCompact(org.plants)}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  USD
                </div>
                <div
                  className="font-mono text-sm font-bold tabular-nums"
                  title={formatMoney(org.usd, "USD")}
                >
                  {formatMoneyCompact(org.usd, "USD")}
                </div>
              </div>
            </div>
          </summary>

          <div className="border-t bg-background/50 px-2 py-2">
            {org.buckets.map((bucket) => (
              <details
                key={`${org.id}-${bucket.key}`}
                className="group/bucket mb-1 overflow-hidden rounded-md last:mb-0"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/40">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/bucket:rotate-90" />
                  <span className="text-sm font-medium">{bucket.label}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {bucket.contracts.length}{" "}
                    {bucket.contracts.length === 1 ? "contrato" : "contratos"}
                  </Badge>
                  <div className="ml-auto flex shrink-0 items-center gap-4 text-right">
                    <div
                      className="font-mono text-xs font-semibold tabular-nums"
                      title={numFmt.format(bucket.plants)}
                    >
                      {formatCompact(bucket.plants)}{" "}
                      <span className="text-[10px] text-muted-foreground">
                        plantas
                      </span>
                    </div>
                    <div
                      className="font-mono text-xs font-semibold tabular-nums"
                      title={formatMoney(bucket.usd, "USD")}
                    >
                      {formatMoneyCompact(bucket.usd, "USD")}
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
                        <th className="w-24 px-3 py-1.5 text-right font-medium">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {bucket.contracts.map((c) => (
                        <tr
                          key={c.id}
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
                          <td className="px-3 py-1.5">
                            {c.client.name ?? "—"}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex flex-wrap items-center gap-1">
                              <ContractStatusBadge status={c.status} />
                              {c.condition !== "venta" ? (
                                <ContractConditionBadge condition={c.condition} />
                              ) : null}
                            </div>
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                            {numFmt.format(c.totalPlants)}
                          </td>
                          <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                            {formatMoney(c.totalUsd, "USD")}
                          </td>
                          <td className="px-3 py-1.5">
                            <ContractRowActions
                              contractId={c.id}
                              contractNumber={c.number}
                            />
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
  );
}
