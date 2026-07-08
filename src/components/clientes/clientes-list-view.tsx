"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  LayoutGrid,
  Plus,
  Search,
  Users,
  X,
} from "lucide-react";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";

import type {
  ClientListItem,
  CountryOption,
  OwnerOption,
} from "@/lib/actions/clientes-types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CountryFlag } from "@/components/clientes/country-flag";

type Props = {
  data: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
  countries: CountryOption[];
  owners: OwnerOption[];
  initialSearch: string;
  initialCountryId: string;
  initialOwnerId: string;
  initialIsActive: "all" | "true" | "false";
};

const ACTIVE_OPTIONS: { value: "all" | "true" | "false"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "true", label: "Activos" },
  { value: "false", label: "Inactivos" },
];

export function ClientesListView({
  data,
  total,
  page,
  pageSize,
  countries,
  owners,
  initialSearch,
  initialCountryId,
  initialOwnerId,
  initialIsActive,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = React.useState(initialSearch);
  const [, startTransition] = React.useTransition();

  const updateParams = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      // reset page when filters change
      if (Object.keys(patch).some((k) => k !== "page")) {
        next.delete("page");
      }
      startTransition(() => {
        router.replace(`/clientes?${next.toString()}`, { scroll: false });
      });
    },
    [router, searchParams],
  );

  // Debounce búsqueda
  React.useEffect(() => {
    if (search === initialSearch) return;
    const t = setTimeout(() => updateParams({ q: search || null }), 300);
    return () => clearTimeout(t);
  }, [search, initialSearch, updateParams]);

  const columnHelper = createColumnHelper<ClientListItem>();
  const columns = React.useMemo(
    () => [
      columnHelper.accessor("name", {
        header: "Cliente",
        cell: (info) => {
          const row = info.row.original;
          return (
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-foreground">
                {row.name}
              </span>
              {row.legal_name ? (
                <span className="truncate text-xs text-muted-foreground">
                  {row.legal_name}
                </span>
              ) : null}
            </div>
          );
        },
      }),
      columnHelper.accessor("country", {
        header: "País",
        cell: (info) => {
          const c = info.getValue();
          if (!c) return <span className="text-muted-foreground">—</span>;
          return <CountryFlag iso2={c.iso2} name={c.name_es} />;
        },
      }),
      columnHelper.accessor("tax_id", {
        header: "Tax ID",
        cell: (info) => (
          <span className="font-mono text-xs">
            {info.getValue() ?? <span className="text-muted-foreground">—</span>}
          </span>
        ),
      }),
      columnHelper.accessor("owner", {
        header: "Owner",
        cell: (info) => {
          const o = info.getValue();
          if (!o)
            return (
              <Badge variant="outline" className="h-5 px-2 text-[11px]">
                Sin owner
              </Badge>
            );
          return (
            <span className="truncate text-sm">
              {o.full_name ?? o.email ?? "—"}
            </span>
          );
        },
      }),
      columnHelper.accessor("active_contracts", {
        header: "Ventas",
        cell: (info) => {
          const count = info.getValue();
          if (count === 0)
            return <span className="text-muted-foreground">0</span>;
          return (
            <Badge variant="secondary" className="h-5 px-2 text-[11px]">
              {count}
            </Badge>
          );
        },
      }),
      columnHelper.accessor("last_activity_at", {
        header: "Última actividad",
        cell: (info) => {
          const v = info.getValue();
          if (!v) return <span className="text-muted-foreground">—</span>;
          return (
            <span
              className="text-xs text-muted-foreground"
              title={new Date(v).toLocaleString("es-CL")}
            >
              {formatDistanceToNow(new Date(v), {
                addSuffix: true,
                locale: es,
              })}
            </span>
          );
        },
      }),
    ],
    [columnHelper],
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const hasActiveFilters =
    initialCountryId !== "" ||
    initialOwnerId !== "" ||
    initialIsActive !== "all" ||
    initialSearch !== "";

  const clearFilters = () => {
    setSearch("");
    updateParams({
      q: null,
      country: null,
      owner: null,
      active: null,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, razón social, tax ID..."
              className="pl-7"
            />
            {search ? (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute top-1/2 right-2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpiar búsqueda"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <FilterSelect
            placeholder="País"
            value={initialCountryId}
            onChange={(v) => updateParams({ country: v || null })}
            options={[
              { value: "", label: "Todos los países" },
              ...countries.map((c) => ({ value: c.id, label: c.name_es })),
            ]}
          />

          <FilterSelect
            placeholder="Owner"
            value={initialOwnerId}
            onChange={(v) => updateParams({ owner: v || null })}
            options={[
              { value: "", label: "Todos los owners" },
              ...owners.map((o) => ({
                value: o.id,
                label: o.full_name ?? o.email ?? "Sin nombre",
              })),
            ]}
          />

          <FilterSelect
            placeholder="Estado"
            value={initialIsActive}
            onChange={(v) =>
              updateParams({ active: v === "all" ? null : v })
            }
            options={ACTIVE_OPTIONS}
          />

          {hasActiveFilters ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" />
              Limpiar
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            render={
              <Link href="/clientes">
                <LayoutGrid className="h-4 w-4" />
                <span className="hidden sm:inline">Vista cards</span>
              </Link>
            }
          />
          <Button
            render={
              <Link href="/clientes/nuevo">
                <Plus className="h-4 w-4" />
                Nuevo cliente
              </Link>
            }
          />
        </div>
      </div>

      {/* Resultados */}
      {data.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} />
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((hg) => (
                <TableRow
                  key={hg.id}
                  className="bg-muted/40 hover:bg-muted/40"
                >
                  {hg.headers.map((header) => (
                    <TableHead
                      key={header.id}
                      className="text-xs font-medium text-muted-foreground uppercase"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() =>
                    router.push(`/clientes/${row.original.id}`)
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-2">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Paginación */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {total === 0
            ? "Sin resultados"
            : `Mostrando ${(page - 1) * pageSize + 1}–${Math.min(
                page * pageSize,
                total,
              )} de ${total}`}
        </span>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page <= 1}
            onClick={() =>
              updateParams({ page: page > 2 ? String(page - 1) : null })
            }
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="px-2">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={page >= totalPages}
            onClick={() => updateParams({ page: String(page + 1) })}
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FilterSelect({
  placeholder,
  value,
  onChange,
  options,
}: {
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  // base-ui Select no tolera value="" para "todos"; usamos sentinel.
  const SENTINEL = "__all__";
  const normalized = value === "" ? SENTINEL : value;
  return (
    <Select
      value={normalized}
      onValueChange={(v) => onChange(v === SENTINEL ? "" : String(v))}
    >
      <SelectTrigger size="sm" className="min-w-[140px]">
        <span className="flex items-center gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5 text-muted-foreground" />
          {/* base-ui SelectValue muestra el value crudo si no se le pasa
              children function. Acá mapeamos value→label de las options. */}
          <SelectValue placeholder={placeholder}>
            {(v) => {
              const key = v === SENTINEL || v == null ? "" : String(v);
              return options.find((o) => o.value === key)?.label ?? placeholder;
            }}
          </SelectValue>
        </span>
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value || SENTINEL} value={opt.value || SENTINEL}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EmptyState({
  hasFilters,
  onClear,
}: {
  hasFilters: boolean;
  onClear: () => void;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card/30 px-6 py-12 text-center",
      )}
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Users className="h-5 w-5 text-muted-foreground" />
      </div>
      {hasFilters ? (
        <>
          <p className="text-sm font-medium">Sin resultados con esos filtros</p>
          <p className="text-xs text-muted-foreground">
            Probá limpiar los filtros o ajustar la búsqueda.
          </p>
          <Button variant="outline" size="sm" onClick={onClear}>
            <X className="h-3.5 w-3.5" />
            Limpiar filtros
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm font-medium">Todavía no tenés clientes</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Creá tu primer cliente para empezar a registrar contratos,
            oportunidades y actividades.
          </p>
          <Button render={<Link href="/clientes/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Link>} />
        </>
      )}
    </div>
  );
}
