"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  Plus,
  List,
  Globe2,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CountryFlag } from "@/components/clientes/country-flag";

export type ClientRow = {
  id: string;
  name: string;
  countryId: string | null;
  countryIso2: string | null;
  countryName: string | null;
  isActive: boolean;
  activeContracts: number;
};

type Props = {
  rows: ClientRow[];
};

const numFmt = new Intl.NumberFormat("es-CL");

export function ClientesByCountryView({ rows }: Props) {
  const router = useRouter();
  const [search, setSearch] = React.useState("");
  const [drilldown, setDrilldown] = React.useState<string | null>(null);

  // Filter rows by search
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        (r.countryName ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  // Aggregate by country
  type CountryAgg = {
    iso2: string;
    name: string;
    clients: number;
    activeClients: number;
    totalContracts: number;
  };
  const byCountry = React.useMemo(() => {
    const map = new Map<string, CountryAgg>();
    for (const r of filtered) {
      const iso2 = r.countryIso2 ?? "??";
      const name = r.countryName ?? "Sin país";
      let agg = map.get(iso2);
      if (!agg) {
        agg = { iso2, name, clients: 0, activeClients: 0, totalContracts: 0 };
        map.set(iso2, agg);
      }
      agg.clients += 1;
      if (r.isActive) agg.activeClients += 1;
      agg.totalContracts += r.activeContracts;
    }
    return Array.from(map.values()).sort((a, b) => b.clients - a.clients);
  }, [filtered]);

  // Clients in selected country
  const clientsInCountry = React.useMemo(() => {
    if (!drilldown) return [] as ClientRow[];
    return filtered
      .filter((r) => r.countryIso2 === drilldown)
      .sort((a, b) => b.activeContracts - a.activeContracts);
  }, [filtered, drilldown]);

  const selectedCountryName = drilldown
    ? byCountry.find((c) => c.iso2 === drilldown)?.name ?? ""
    : "";

  // Totales globales (con filtros)
  const totals = React.useMemo(() => {
    let clients = 0;
    let activeClients = 0;
    let contracts = 0;
    for (const r of filtered) {
      clients += 1;
      if (r.isActive) activeClients += 1;
      contracts += r.activeContracts;
    }
    return {
      countries: byCountry.length,
      clients,
      activeClients,
      contracts,
    };
  }, [filtered, byCountry]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <div className="relative flex flex-1 min-w-[220px] items-center">
          <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente o país"
            className="pl-7"
          />
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" render={<Link href="/clientes?view=list" />}>
            <List className="h-4 w-4" />
            Vista lista
          </Button>
          <Button render={<Link href="/clientes/nuevo" />}>
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Button>
        </div>
      </div>

      {/* Summary */}
      {!drilldown ? (
        <div className="rounded-lg border bg-card px-4 py-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Países" value={numFmt.format(totals.countries)} />
            <Stat label="Clientes" value={numFmt.format(totals.clients)} accent />
            <Stat label="Activos" value={numFmt.format(totals.activeClients)} />
            <Stat label="Contratos vigentes" value={numFmt.format(totals.contracts)} />
          </div>
        </div>
      ) : null}

      {/* Breadcrumb */}
      {drilldown ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button
            type="button"
            onClick={() => setDrilldown(null)}
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <Globe2 className="h-3.5 w-3.5" />
            Países
          </button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground font-medium">{selectedCountryName}</span>
        </div>
      ) : null}

      {/* Body */}
      {!drilldown ? (
        <CountryGrid
          countries={byCountry}
          onSelect={(iso2) => setDrilldown(iso2)}
        />
      ) : (
        <ClientsTable
          clients={clientsInCountry}
          onBack={() => setDrilldown(null)}
          onClickClient={(id) => router.push(`/clientes/${id}`)}
        />
      )}

      {filtered.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center text-sm text-muted-foreground">
          No hay clientes para los filtros aplicados.
        </div>
      ) : null}
    </div>
  );
}

function Stat({
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
          (accent ? "text-base font-bold" : "text-base font-semibold")
        }
      >
        {value}
      </div>
    </div>
  );
}

function CountryGrid({
  countries,
  onSelect,
}: {
  countries: {
    iso2: string;
    name: string;
    clients: number;
    activeClients: number;
    totalContracts: number;
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
              <div className="text-muted-foreground">Clientes</div>
              <div className="font-mono text-lg font-semibold tabular-nums">
                {numFmt.format(c.clients)}
              </div>
            </div>
            <div>
              <div className="text-muted-foreground">Activos</div>
              <div className="font-mono text-lg font-semibold tabular-nums">
                {numFmt.format(c.activeClients)}
              </div>
            </div>
            <div className="col-span-2">
              <div className="text-muted-foreground">Contratos vigentes</div>
              <div className="font-mono text-sm font-medium tabular-nums">
                {numFmt.format(c.totalContracts)}
              </div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}

type ClientSortKey = "name" | "contracts" | "status";

function ClientsTable({
  clients,
  onBack,
  onClickClient,
}: {
  clients: ClientRow[];
  onBack: () => void;
  onClickClient: (id: string) => void;
}) {
  const [sort, setSort] = React.useState<{ key: ClientSortKey; dir: "asc" | "desc" } | null>(
    null,
  );
  const onHeaderClick = (key: ClientSortKey) => {
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };
  const sorted = React.useMemo(() => {
    if (!sort) return clients;
    const cmp = (a: ClientRow, b: ClientRow): number => {
      let av: string | number = "";
      let bv: string | number = "";
      switch (sort.key) {
        case "name":
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
          break;
        case "contracts":
          av = a.activeContracts;
          bv = b.activeContracts;
          break;
        case "status":
          av = a.isActive ? 1 : 0;
          bv = b.isActive ? 1 : 0;
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
              Contratos vigentes
            </SortableHeader>
            <SortableHeader sort={sort} sortKey="status" onClick={onHeaderClick} align="left">
              Estado
            </SortableHeader>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((c) => (
            <tr
              key={c.id}
              onClick={() => onClickClient(c.id)}
              className="cursor-pointer border-b last:border-b-0 hover:bg-muted/50"
            >
              <td className="px-3 py-2 font-medium">{c.name}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">
                {numFmt.format(c.activeContracts)}
              </td>
              <td className="px-3 py-2">
                {c.isActive ? (
                  <Badge variant="outline" className="text-[10px]">Activo</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Inactivo</Badge>
                )}
              </td>
              <td className="px-3 text-muted-foreground">
                <ChevronRight className="h-4 w-4" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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
            <ChevronDown className="h-3 w-3" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-40" />
        )}
      </span>
    </th>
  );
}
