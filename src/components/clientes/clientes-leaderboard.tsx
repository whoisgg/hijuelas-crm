"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { List, Search, TrendingUp } from "lucide-react";

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

/**
 * Vista clientes — leaderboard. Cards rankeadas por totalUsd
 * comprometido. Cada card combina avatar de iniciales (color estable
 * desde hash del nombre), bandera del país, KAM, y métricas clave.
 * Diferente a la vista contratos (que es transaccional/tabular).
 */
export function ClientesLeaderboard({ rows }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const [search, setSearch] = React.useState("");
  const [kamFilter, setKamFilter] = React.useState<string>("all");
  const [activeOnly, setActiveOnly] = React.useState(false);

  // Lista única de KAMs para el filtro
  const kams = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const r of rows) {
      if (r.kam) map.set(r.kam.id, r.kam.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "es"));
  }, [rows]);

  // Filtros + sort por USD desc
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = rows.filter((r) => {
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
    // Sort: clientes con actividad arriba (USD desc), después por nombre.
    list = list.sort((a, b) => {
      if (b.totalUsd !== a.totalUsd) return b.totalUsd - a.totalUsd;
      return a.name.localeCompare(b.name, "es");
    });
    return list;
  }, [rows, search, kamFilter, activeOnly]);

  const switchToListView = () => {
    const next = new URLSearchParams(params.toString());
    next.set("view", "list");
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <div className="relative flex flex-1 min-w-[180px] items-center">
          <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente, país o KAM..."
            className="pl-7"
          />
        </div>

        {/* KAM chips */}
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

      {/* Stats summary */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span>
          <span className="font-semibold text-foreground tabular-nums">
            {filtered.length}
          </span>{" "}
          cliente{filtered.length === 1 ? "" : "s"}
        </span>
        <span>·</span>
        <span className="inline-flex items-center gap-1">
          <TrendingUp className="size-3" />
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

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="flex h-32 items-center justify-center rounded-lg border bg-card text-sm text-muted-foreground">
          No hay clientes que coincidan con el filtro.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c, idx) => (
            <ClientCard key={c.id} client={c} rank={idx + 1} />
          ))}
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
        "group flex flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30",
        rank === 1 && hasActivity && "border-primary/30 bg-primary/5",
        !client.isActive && "opacity-60",
      )}
    >
      {/* Header: avatar + nombre + rank */}
      <div className="flex items-start gap-3">
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
          {client.country ? (
            <div className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CountryFlag
                iso2={client.country.iso2 ?? null}
                size="xs"
                showName={false}
              />
              <span className="truncate">{client.country.name}</span>
            </div>
          ) : null}
        </div>
      </div>

      {/* Métricas */}
      <div className="flex items-baseline gap-3">
        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Comprometido
          </span>
          <span className="text-lg font-bold tabular-nums text-foreground">
            {hasActivity ? formatUsd(client.totalUsd, true) : "—"}
          </span>
        </div>
        <div className="ml-auto flex flex-col items-end">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Plantas
          </span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {hasActivity
              ? formatNumber(client.totalPlants, client.totalPlants >= 1000)
              : "—"}
          </span>
        </div>
      </div>

      {/* Footer: contratos + KAM + status */}
      <div className="flex flex-wrap items-center gap-2 border-t pt-2 text-[11px]">
        <span className="text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {client.activeContracts}
          </span>{" "}
          contrato{client.activeContracts === 1 ? "" : "s"}
        </span>
        {client.kam ? (
          <span className="ml-auto inline-flex items-center gap-1 text-muted-foreground">
            <MiniAvatar name={client.kam.name} />
            <span className="truncate">{client.kam.name}</span>
          </span>
        ) : (
          <span className="ml-auto text-muted-foreground/60">Sin KAM</span>
        )}
        {!client.isActive ? (
          <Badge variant="secondary" className="text-[10px]">
            Inactivo
          </Badge>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * Avatar circular con iniciales y color estable derivado del hash del
 * nombre. Sin imágenes para mantener performance y consistencia visual.
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
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Hash determinístico → hue para OKLCH. Mantiene saturación/luminosidad fijas. */
function hashToColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) | 0;
  }
  const hue = Math.abs(h) % 360;
  return `oklch(0.58 0.13 ${hue})`;
}
