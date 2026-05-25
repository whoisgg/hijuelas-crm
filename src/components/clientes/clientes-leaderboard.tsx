"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, List, Search } from "lucide-react";

import type { ClientLeaderRow } from "@/lib/actions/clientes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CountryFlag } from "@/components/clientes/country-flag";
import { formatNumber, formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  rows: ClientLeaderRow[];
};

const NO_COUNTRY = "??";

type CountryGroup = {
  iso2: string;
  name: string;
  clients: ClientLeaderRow[];
  totalUsd: number;
  totalPlants: number;
};

/**
 * Vista clientes — agrupada por país (acordeón) con cards estilo
 * leaderboard adentro. Combina la jerarquía del /contratos (no abruma
 * con 150 cards de una) con la identidad relacional (avatares humanos,
 * KAM, métricas de valor).
 */
export function ClientesLeaderboard({ rows }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [search, setSearch] = React.useState("");
  const [kamFilter, setKamFilter] = React.useState<string>("all");
  const [activeOnly, setActiveOnly] = React.useState(false);

  // KAMs únicos para chips de filtro
  const kams = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) if (r.kam) map.set(r.kam.id, r.kam.name);
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [rows]);

  // Filtro client-side
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (q) {
        const hay =
          r.name.toLowerCase().includes(q) ||
          (r.country?.name ?? "").toLowerCase().includes(q) ||
          (r.kam?.name ?? "").toLowerCase().includes(q);
        if (!hay) return false;
      }
      if (kamFilter !== "all" && r.kam?.id !== kamFilter) return false;
      if (activeOnly && !r.isActive) return false;
      return true;
    });
  }, [rows, search, kamFilter, activeOnly]);

  // Agrupar por país, sort countries por totalUsd desc, clients dentro
  // de cada país también por totalUsd desc.
  const groups = React.useMemo<CountryGroup[]>(() => {
    const byIso = new Map<string, CountryGroup>();
    for (const r of filtered) {
      const iso2 = r.country?.iso2 ?? NO_COUNTRY;
      const name = r.country?.name ?? "Sin país";
      let g = byIso.get(iso2);
      if (!g) {
        g = { iso2, name, clients: [], totalUsd: 0, totalPlants: 0 };
        byIso.set(iso2, g);
      }
      g.clients.push(r);
      g.totalUsd += r.totalUsd;
      g.totalPlants += r.totalPlants;
    }
    for (const g of byIso.values()) {
      g.clients.sort((a, b) => {
        if (b.totalUsd !== a.totalUsd) return b.totalUsd - a.totalUsd;
        return a.name.localeCompare(b.name, "es");
      });
    }
    return Array.from(byIso.values()).sort((a, b) => {
      if (b.totalUsd !== a.totalUsd) return b.totalUsd - a.totalUsd;
      return a.name.localeCompare(b.name, "es");
    });
  }, [filtered]);

  // Defaults: primeros 2 países expandidos, resto colapsado. Al
  // buscar/filtrar expandimos todo para que se vea el match.
  const isSearching = search.trim().length > 0 || kamFilter !== "all";
  const defaultExpanded = React.useMemo(() => {
    if (isSearching) return new Set(groups.map((g) => g.iso2));
    return new Set(groups.slice(0, 2).map((g) => g.iso2));
  }, [groups, isSearching]);

  const [expanded, setExpanded] = React.useState<Set<string>>(defaultExpanded);
  // Re-sync cuando cambia el filtro: si buscamos, expandir todo.
  React.useEffect(() => {
    setExpanded(defaultExpanded);
  }, [defaultExpanded]);

  const toggle = (iso2: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(iso2)) next.delete(iso2);
      else next.add(iso2);
      return next;
    });
  };

  const switchToListView = () => {
    const next = new URLSearchParams(params.toString());
    next.set("view", "list");
    router.push(`${pathname}?${next.toString()}`);
  };

  // Cumulative rank across all visible countries (para mostrar #N por
  // cliente respecto al universo filtrado, no por país).
  let cumulativeRank = 0;

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <div className="relative flex flex-1 min-w-[200px] items-center">
          <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, país o KAM..."
            className="pl-7"
          />
        </div>

        <div className="inline-flex flex-wrap items-center gap-1">
          <FilterChip
            active={kamFilter === "all"}
            onClick={() => setKamFilter("all")}
          >
            Todos los KAM
          </FilterChip>
          {kams.map((k) => (
            <FilterChip
              key={k.id}
              active={kamFilter === k.id}
              onClick={() => setKamFilter(k.id)}
            >
              {k.name}
            </FilterChip>
          ))}
        </div>

        <label
          className={cn(
            "inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-md border px-2 text-[11px] font-medium transition-colors",
            activeOnly
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border text-muted-foreground hover:bg-muted",
          )}
        >
          <input
            type="checkbox"
            className="accent-primary"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Solo activos
        </label>

        <Button variant="outline" size="sm" onClick={switchToListView}>
          <List className="size-3.5" />
          <span className="hidden sm:inline">Vista lista</span>
        </Button>
      </div>

      {/* Resumen totales (filtrado) */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground tabular-nums">
            {filtered.length}
          </span>{" "}
          cliente{filtered.length === 1 ? "" : "s"} en{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {groups.length}
          </span>{" "}
          país{groups.length === 1 ? "" : "es"}
        </span>
        <span>·</span>
        <span>
          {formatUsd(
            filtered.reduce((a, c) => a + c.totalUsd, 0),
            true,
          )}{" "}
          comprometido
        </span>
        <span>·</span>
        <span>
          {formatNumber(
            filtered.reduce((a, c) => a + c.totalPlants, 0),
            true,
          )}{" "}
          plantas
        </span>
      </div>

      {/* Acordeón por país */}
      {groups.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
          No hay clientes que coincidan con el filtro.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {groups.map((g) => {
            const isOpen = expanded.has(g.iso2);
            return (
              <section
                key={g.iso2}
                className="overflow-hidden rounded-lg border bg-card"
              >
                <button
                  type="button"
                  onClick={() => toggle(g.iso2)}
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
                >
                  {isOpen ? (
                    <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <CountryFlag
                    iso2={g.iso2 === NO_COUNTRY ? null : g.iso2}
                    size="sm"
                    showName={false}
                  />
                  <h2 className="text-sm font-semibold text-foreground">
                    {g.name}
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    {g.clients.length} cliente{g.clients.length === 1 ? "" : "s"}
                  </span>
                  <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="tabular-nums">
                      {formatUsd(g.totalUsd, true)}
                    </span>
                    <span className="hidden sm:inline tabular-nums">
                      {formatNumber(g.totalPlants, g.totalPlants >= 1000)} plantas
                    </span>
                  </div>
                </button>
                {isOpen ? (
                  <div className="grid grid-cols-1 gap-2 border-t bg-background/40 p-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {g.clients.map((c) => {
                      cumulativeRank += 1;
                      return (
                        <ClientCard
                          key={c.id}
                          client={c}
                          rank={cumulativeRank}
                        />
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2 text-[11px] font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function ClientCard({
  client,
  rank,
}: {
  client: ClientLeaderRow;
  rank: number;
}) {
  const hasActivity = client.totalUsd > 0;
  return (
    <Link
      href={`/clientes/${client.id}`}
      className={cn(
        "group flex flex-col gap-2.5 rounded-md border bg-card p-3 transition-colors hover:border-primary/40 hover:bg-muted/30",
        rank === 1 && hasActivity && "border-primary/40 bg-primary/5",
        !client.isActive && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2.5">
        <Avatar name={client.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1.5">
            <h3 className="truncate text-sm font-semibold text-foreground group-hover:text-primary">
              {client.name}
            </h3>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
              #{rank}
            </span>
          </div>
          {client.kam ? (
            <div className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <MiniAvatar name={client.kam.name} />
              <span className="truncate">{client.kam.name}</span>
            </div>
          ) : (
            <span className="mt-0.5 inline-block text-[11px] text-muted-foreground/60">
              Sin KAM
            </span>
          )}
        </div>
      </div>

      <div className="flex items-baseline gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            $ Comprometido
          </span>
          <span className="text-base font-bold tabular-nums text-foreground">
            {hasActivity ? formatUsd(client.totalUsd, true) : "—"}
          </span>
        </div>
        <div className="ml-auto flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Plantas
          </span>
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {hasActivity
              ? formatNumber(client.totalPlants, client.totalPlants >= 1000)
              : "—"}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Contratos
          </span>
          <span className="text-xs font-semibold tabular-nums text-foreground">
            {client.activeContracts}
          </span>
        </div>
      </div>

      {!client.isActive ? (
        <Badge variant="secondary" className="self-start text-[10px]">
          Inactivo
        </Badge>
      ) : null}
    </Link>
  );
}

/**
 * Avatar circular con iniciales y color OKLCH estable derivado del
 * hash del nombre.
 */
function Avatar({ name }: { name: string }) {
  const initials = React.useMemo(() => getInitials(name), [name]);
  const color = React.useMemo(() => hashToColor(name), [name]);
  return (
    <div
      aria-hidden
      className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white shadow-sm ring-1 ring-black/10"
      style={{ backgroundColor: color }}
    >
      {initials}
    </div>
  );
}

function MiniAvatar({ name }: { name: string }) {
  const initials = React.useMemo(() => getInitials(name).slice(0, 1), [name]);
  const color = React.useMemo(() => hashToColor(name), [name]);
  return (
    <span
      aria-hidden
      className="flex size-4 items-center justify-center rounded-full text-[8px] font-bold text-white ring-1 ring-black/10"
      style={{ backgroundColor: color }}
    >
      {initials}
    </span>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashToColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const hue = Math.abs(h) % 360;
  return `oklch(0.58 0.13 ${hue})`;
}
