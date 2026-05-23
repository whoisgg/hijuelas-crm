"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronDown as ChevronDownIcon,
  ChevronUp,
  ChevronsUpDown,
  Search,
  Plus,
  List,
  Globe2,
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
import { CountryFlag } from "@/components/clientes/country-flag";
import { formatMoney, formatDate } from "@/components/contratos/format";
import { FxRatesLegend } from "@/components/contratos/fx-rates-legend";
import type { FxRates } from "@/lib/actions/fx-rates";

type ContractStatus = Database["public"]["Enums"]["contract_status"];

export type SpeciesOption = { id: string; name: string };

export type CountryContractRow = {
  id: string;
  number: string;
  status: ContractStatus;
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
    () => new Set(["activos"]),
  );
  const [drilldown, setDrilldown] = React.useState<{
    iso2: string | null;
    clientId: string | null;
  }>({ iso2: null, clientId: null });

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
  }, [rows, search, speciesId, species, allowedStatuses]);

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
    return Array.from(map.values()).sort((a, b) => b.contracts - a.contracts);
  }, [filtered]);

  // Aggregate by client within a country
  type ClientAgg = {
    id: string;
    name: string;
    contracts: number;
    plants: number;
    usd: number;
  };
  const clientsInCountry = React.useMemo(() => {
    if (!drilldown.iso2) return [] as ClientAgg[];
    const map = new Map<string, ClientAgg>();
    for (const r of filtered) {
      if (r.client.countryIso2 !== drilldown.iso2) continue;
      let agg = map.get(r.client.id);
      if (!agg) {
        agg = { id: r.client.id, name: r.client.name, contracts: 0, plants: 0, usd: 0 };
        map.set(r.client.id, agg);
      }
      agg.contracts += 1;
      agg.plants += r.totalPlants;
      agg.usd += r.totalUsd;
    }
    return Array.from(map.values()).sort((a, b) => b.usd - a.usd);
  }, [filtered, drilldown.iso2]);

  // Contracts for a selected client within a country
  const contractsForClient = React.useMemo(() => {
    if (!drilldown.clientId) return [] as CountryContractRow[];
    return filtered.filter((r) => r.client.id === drilldown.clientId);
  }, [filtered, drilldown.clientId]);

  const selectedCountryName =
    drilldown.iso2 ? byCountry.find((c) => c.iso2 === drilldown.iso2)?.name ?? "" : "";
  const selectedClientName =
    drilldown.clientId
      ? filtered.find((r) => r.client.id === drilldown.clientId)?.client.name ?? ""
      : "";

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
      {drilldown.iso2 || drilldown.clientId ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => setDrilldown({ iso2: null, clientId: null })}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Globe2 className="h-3.5 w-3.5" />
            Países
          </button>
          {drilldown.iso2 ? (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <button
                type="button"
                onClick={() => setDrilldown({ iso2: drilldown.iso2, clientId: null })}
                className={
                  drilldown.clientId
                    ? "hover:text-foreground"
                    : "text-foreground font-medium"
                }
              >
                {selectedCountryName}
              </button>
            </>
          ) : null}
          {drilldown.clientId ? (
            <>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="text-foreground font-medium">{selectedClientName}</span>
            </>
          ) : null}
        </div>
      ) : null}

      {/* FX rates legend + Summary totales — siempre visible */}
      {!drilldown.iso2 ? (
        <>
          <div className="flex items-center justify-end">
            <FxRatesLegend initial={fxRates} />
          </div>
          <SummaryTotals countries={byCountry} />
        </>
      ) : null}

      {/* Body */}
      {!drilldown.iso2 ? (
        <CountryGrid
          countries={byCountry}
          onSelect={(iso2) => setDrilldown({ iso2, clientId: null })}
        />
      ) : !drilldown.clientId ? (
        <ClientListForCountry
          clients={clientsInCountry}
          onBack={() => setDrilldown({ iso2: null, clientId: null })}
          onSelect={(id) => setDrilldown({ iso2: drilldown.iso2, clientId: id })}
        />
      ) : (
        <ContractsForClient
          contracts={contractsForClient}
          onBack={() => setDrilldown({ iso2: drilldown.iso2, clientId: null })}
        />
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
// Summary totales (sticky top de la grid)
// ----------------------------------------------------------------------------
function SummaryTotals({
  countries,
}: {
  countries: {
    contracts: number;
    clients: Set<string>;
    plants: number;
    usd: number;
  }[];
}) {
  const totals = React.useMemo(() => {
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
    return { contracts, clients, plants, usd, countries: countries.length };
  }, [countries]);

  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <SummaryStat label="Países" value={numFmt.format(totals.countries)} />
        <SummaryStat label="Contratos" value={numFmt.format(totals.contracts)} />
        <SummaryStat label="Clientes" value={numFmt.format(totals.clients)} />
        <SummaryStat label="Total plantas" value={numFmt.format(totals.plants)} accent />
        <SummaryStat label="Total USD" value={formatMoney(totals.usd, "USD")} accent />
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
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
            ? "text-base font-bold text-foreground"
            : "text-base font-semibold")
        }
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
              <div className="font-mono text-sm font-medium tabular-nums">{numFmt.format(c.plants)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">USD</div>
              <div className="font-mono text-sm font-medium tabular-nums">{formatMoney(c.usd, "USD")}</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Client list inside a country
// ----------------------------------------------------------------------------
type ClientSortKey = "name" | "contracts" | "plants" | "usd";

function ClientListForCountry({
  clients,
  onBack,
  onSelect,
}: {
  clients: { id: string; name: string; contracts: number; plants: number; usd: number }[];
  onBack: () => void;
  onSelect: (clientId: string) => void;
}) {
  const [sort, setSort] = React.useState<{ key: ClientSortKey; dir: "asc" | "desc" } | null>(null);

  const onHeaderClick = (key: ClientSortKey) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null; // tercer click → reset
    });
  };

  const sorted = React.useMemo(() => {
    if (!sort) return clients;
    const cmp = (a: typeof clients[number], b: typeof clients[number]): number => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sort.key) {
        case "name":
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
          break;
        case "contracts":
          av = a.contracts;
          bv = b.contracts;
          break;
        case "plants":
          av = a.plants;
          bv = b.plants;
          break;
        case "usd":
          av = a.usd;
          bv = b.usd;
          break;
      }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    };
    return [...clients].sort(cmp);
  }, [clients, sort]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Volver a países
        </Button>
        <Badge variant="secondary">{clients.length} clientes</Badge>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <SortableHeader sort={sort} sortKey="name" onClick={onHeaderClick} align="left">
              Cliente
            </SortableHeader>
            <SortableHeader sort={sort} sortKey="contracts" onClick={onHeaderClick} align="right">
              Contratos
            </SortableHeader>
            <SortableHeader sort={sort} sortKey="plants" onClick={onHeaderClick} align="right">
              Total plantas
            </SortableHeader>
            <SortableHeader sort={sort} sortKey="usd" onClick={onHeaderClick} align="right">
              Total USD
            </SortableHeader>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="cursor-pointer border-b last:border-b-0 hover:bg-muted/50"
            >
              <td className="px-3 py-2 font-medium">{c.name}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {numFmt.format(c.contracts)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {numFmt.format(c.plants)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {formatMoney(c.usd, "USD")}
              </td>
              <td className="px-3 text-muted-foreground">
                <ChevronDown className="h-4 w-4 -rotate-90" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Generic sortable header (3-state: none → asc → desc → none)
function SortableHeader<K extends string>({
  sort,
  sortKey,
  onClick,
  align,
  children,
}: {
  sort: { key: K; dir: "asc" | "desc" } | null;
  sortKey: K;
  onClick: (key: K) => void;
  align: "left" | "right";
  children: React.ReactNode;
}) {
  const isActive = sort?.key === sortKey;
  return (
    <th
      className={
        "cursor-pointer select-none px-3 py-2 font-medium hover:text-foreground " +
        (align === "right" ? "text-right" : "text-left")
      }
      onClick={() => onClick(sortKey)}
    >
      <span
        className={
          "inline-flex items-center gap-1 " +
          (align === "right" ? "justify-end" : "justify-start") +
          (isActive ? " text-foreground" : "")
        }
      >
        {children}
        {isActive ? (
          sort?.dir === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDownIcon className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}

// ----------------------------------------------------------------------------
// Contracts for a selected client
// ----------------------------------------------------------------------------
type ContractSortKey = "number" | "organization" | "status" | "plants" | "usd" | "signed";

function ContractsForClient({
  contracts,
  onBack,
}: {
  contracts: CountryContractRow[];
  onBack: () => void;
}) {
  const [sort, setSort] = React.useState<{ key: ContractSortKey; dir: "asc" | "desc" } | null>(
    null,
  );
  const onHeaderClick = (key: ContractSortKey) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };
  const sorted = React.useMemo(() => {
    if (!sort) return contracts;
    const cmp = (a: CountryContractRow, b: CountryContractRow): number => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sort.key) {
        case "number":
          av = a.number;
          bv = b.number;
          break;
        case "organization":
          av = a.organization?.name ?? "";
          bv = b.organization?.name ?? "";
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "plants":
          av = a.totalPlants;
          bv = b.totalPlants;
          break;
        case "usd":
          av = a.totalUsd;
          bv = b.totalUsd;
          break;
        case "signed":
          av = a.signed_at ?? "";
          bv = b.signed_at ?? "";
          break;
      }
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    };
    return [...contracts].sort(cmp);
  }, [contracts, sort]);

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="h-4 w-4" />
          Volver a clientes
        </Button>
        <Badge variant="secondary">{contracts.length} contratos</Badge>
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr className="border-b">
            <SortableHeader sort={sort} sortKey="number" onClick={onHeaderClick} align="left">
              # Contrato
            </SortableHeader>
            <SortableHeader sort={sort} sortKey="organization" onClick={onHeaderClick} align="left">
              Organización
            </SortableHeader>
            <SortableHeader sort={sort} sortKey="status" onClick={onHeaderClick} align="left">
              Estado
            </SortableHeader>
            <SortableHeader sort={sort} sortKey="plants" onClick={onHeaderClick} align="right">
              Total plantas
            </SortableHeader>
            <SortableHeader sort={sort} sortKey="usd" onClick={onHeaderClick} align="right">
              Total USD
            </SortableHeader>
            <SortableHeader sort={sort} sortKey="signed" onClick={onHeaderClick} align="left">
              Firma
            </SortableHeader>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/50">
              <td className="px-3 py-2 font-mono text-xs">
                <Link href={`/contratos/${c.id}`} className="hover:underline">
                  {c.number}
                </Link>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {c.organization?.name ?? "—"}
              </td>
              <td className="px-3 py-2">
                <ContractStatusBadge status={c.status} />
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {numFmt.format(c.totalPlants)}
              </td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {formatMoney(c.totalUsd, "USD")}
              </td>
              <td className="px-3 py-2 text-muted-foreground">{formatDate(c.signed_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
