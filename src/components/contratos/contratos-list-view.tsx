"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search, Globe2 } from "lucide-react";

import type { Database } from "@/lib/database.types";
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
import { ContractStatusBadge } from "@/components/contratos/status-badge";
import { formatMoney, formatDate } from "@/components/contratos/format";
import { ExportAllButton } from "@/components/contratos/export-all-button";
import { ImportContractsButton } from "@/components/contratos/import-contracts-button";

const plantsFormatter = new Intl.NumberFormat("es-CL");

type ContractStatus = Database["public"]["Enums"]["contract_status"];
type CurrencyCode = Database["public"]["Enums"]["currency_code"];

export type ContractListRow = {
  id: string;
  number: string;
  status: ContractStatus;
  currency: CurrencyCode;
  total_neto_usd: number;
  totalPlants: number;
  signed_at: string | null;
  created_at: string;
  client: { id: string; name: string } | null;
  organization: { id: string; name: string; contract_prefix: string } | null;
  itemsCount: number;
};

export type OrgOption = { id: string; name: string };

type SavedView = {
  id: string;
  name: string;
  status: ContractStatus | "all";
};

const DEFAULT_VIEWS: SavedView[] = [
  { id: "all", name: "Todos", status: "all" },
  { id: "activos", name: "Activos", status: "en_proceso" },
  { id: "por_firmar", name: "Por firmar", status: "borrador" },
  { id: "cancelados", name: "Cancelados", status: "cancelado" },
];

const STATUS_OPTIONS: { value: ContractStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos los estados" },
  { value: "borrador", label: "Borrador" },
  { value: "firmado", label: "Firmado" },
  { value: "en_proceso", label: "En proceso" },
  { value: "finalizado", label: "Finalizado" },
  { value: "cancelado", label: "Cancelado" },
];

const CURRENCY_OPTIONS: { value: CurrencyCode | "all"; label: string }[] = [
  { value: "all", label: "Todas las monedas" },
  { value: "CLP", label: "CLP" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
];

const STORAGE_KEY = "hijuelas-contratos-view";

type Props = {
  rows: ContractListRow[];
  organizations: OrgOption[];
  isAdmin?: boolean;
};

// Reads the saved view from localStorage. Returns the default on SSR.
function readStoredView(): SavedView {
  if (typeof window === "undefined") return DEFAULT_VIEWS[0];
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const found = DEFAULT_VIEWS.find((v) => v.id === stored);
      if (found) return found;
    }
  } catch {
    // ignore
  }
  return DEFAULT_VIEWS[0];
}

export function ContratosListView({ rows, organizations, isAdmin = false }: Props) {
  const router = useRouter();
  // Use lazy initializers so the saved view is read once on mount. SSR will
  // render the default, then the client will reconcile on hydration.
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<ContractStatus | "all">(
    () => readStoredView().status,
  );
  const [orgId, setOrgId] = React.useState<string>("all");
  const [currency, setCurrency] = React.useState<CurrencyCode | "all">("all");
  const [year, setYear] = React.useState<string>("all");
  const [viewId, setViewId] = React.useState<string>(() => readStoredView().id);

  const handleViewChange = (id: string) => {
    setViewId(id);
    const view = DEFAULT_VIEWS.find((v) => v.id === id);
    if (view) setStatus(view.status);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // ignore
    }
  };

  const years = React.useMemo(() => {
    const set = new Set<number>();
    for (const r of rows) {
      set.add(new Date(r.created_at).getFullYear());
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [rows]);

  const filtered = React.useMemo(() => {
    return rows.filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (orgId !== "all" && r.organization?.id !== orgId) return false;
      if (currency !== "all" && r.currency !== currency) return false;
      if (year !== "all") {
        const y = new Date(r.created_at).getFullYear();
        if (String(y) !== year) return false;
      }
      if (search.trim().length > 0) {
        const q = search.trim().toLowerCase();
        const hits =
          r.number.toLowerCase().includes(q) ||
          (r.client?.name ?? "").toLowerCase().includes(q);
        if (!hits) return false;
      }
      return true;
    });
  }, [rows, status, orgId, currency, year, search]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1">
        {DEFAULT_VIEWS.map((v) => (
          <button
            key={v.id}
            onClick={() => handleViewChange(v.id)}
            className={
              "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors " +
              (viewId === v.id
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-transparent text-muted-foreground hover:bg-muted")
            }
          >
            {v.name}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {isAdmin ? <ImportContractsButton /> : null}
          <ExportAllButton />
          <Button variant="outline" size="sm" render={<Link href="/contratos" />}>
            <Globe2 className="h-4 w-4" />
            Vista país
          </Button>
          <Button render={<Link href="/contratos/nuevo" />}>
            <Plus className="h-4 w-4" />
            Nuevo contrato
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <div className="relative flex flex-1 items-center">
          <Search className="absolute left-2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por número o cliente"
            className="pl-7"
          />
        </div>

        <Select value={status} onValueChange={(v) => setStatus((v ?? "all") as ContractStatus | "all")}>
          <SelectTrigger className="h-8 w-44">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={orgId} onValueChange={(v) => setOrgId(String(v ?? "all"))}>
          <SelectTrigger className="h-8 w-52">
            <SelectValue placeholder="Organización" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las organizaciones</SelectItem>
            {organizations.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                {o.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={currency} onValueChange={(v) => setCurrency((v ?? "all") as CurrencyCode | "all")}>
          <SelectTrigger className="h-8 w-36">
            <SelectValue placeholder="Moneda" />
          </SelectTrigger>
          <SelectContent>
            {CURRENCY_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {years.length > 0 ? (
          <Select value={year} onValueChange={(v) => setYear(String(v ?? "all"))}>
            <SelectTrigger className="h-8 w-28">
              <SelectValue placeholder="Año" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los años</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead># Contrato</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Organización</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Total plantas</TableHead>
              <TableHead className="text-right">Total USD</TableHead>
              <TableHead className="text-right">Items</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  No hay contratos para los filtros seleccionados.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/contratos/${row.id}`)}
                >
                  <TableCell className="font-mono text-xs">
                    <Link href={`/contratos/${row.id}`} className="hover:underline">
                      {row.number}
                    </Link>
                  </TableCell>
                  <TableCell>{row.client?.name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.organization?.name ?? "—"}
                  </TableCell>
                  <TableCell>
                    <ContractStatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {plantsFormatter.format(row.totalPlants)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {formatMoney(row.total_neto_usd, "USD")}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(row.signed_at)}
                  </TableCell>
                  <TableCell className="text-right">{row.itemsCount}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
