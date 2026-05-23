"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Filter, Sparkles } from "lucide-react";

import type { LookupItem } from "@/lib/actions/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  species: LookupItem[];
  years: number[];
};

const STATUS_GROUPS: { key: string; label: string; statuses: string[] }[] = [
  { key: "activos", label: "Activos", statuses: ["firmado", "en_proceso", "finalizado"] },
  { key: "por_firmar", label: "Por firmar", statuses: ["borrador", "por_revisar"] },
  { key: "cancelados", label: "Cancelados", statuses: ["cancelado"] },
];

export function MapFilters({ species, years }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const year = params.get("year") ?? String(new Date().getUTCFullYear());
  const speciesId = params.get("species") ?? "all";
  const includeOpps = params.get("opps") === "1";

  // status filter via URL: ?status=activos,por_firmar (default "activos")
  const statusParam = params.get("status");
  const activeStatusKeys = React.useMemo(() => {
    if (statusParam === null) return new Set(["activos"]); // default
    if (statusParam === "" || statusParam === "all")
      return new Set(STATUS_GROUPS.map((g) => g.key));
    return new Set(statusParam.split(",").filter(Boolean));
  }, [statusParam]);

  const updateParam = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value == null || value === "" || value === "all") next.delete(key);
      else next.set(key, value);
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const toggleStatus = (key: string) => {
    const next = new Set(activeStatusKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const value =
      next.size === STATUS_GROUPS.length
        ? "all"
        : Array.from(next).join(",");
    updateParam("status", value || null);
  };

  const allActive = activeStatusKeys.size === STATUS_GROUPS.length;
  const toggleAll = () => {
    if (allActive) updateParam("status", null); // back to default "activos"
    else updateParam("status", "all");
  };

  return (
    <Card size="sm" className="w-full lg:w-72">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Filter className="size-4 text-primary" />
          Filtros
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status checkboxes (mismo patrón que /contratos) */}
        <div className="space-y-2">
          <Label className="text-xs">Estado contrato</Label>
          <div className="flex flex-wrap gap-1">
            <label
              className={
                "inline-flex h-7 items-center gap-1.5 cursor-pointer rounded-md border px-2 text-[11px] font-medium transition-colors " +
                (allActive
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted")
              }
            >
              <input
                type="checkbox"
                className="accent-primary"
                checked={allActive}
                onChange={toggleAll}
              />
              Todos
            </label>
            {STATUS_GROUPS.map((g) => {
              const on = activeStatusKeys.has(g.key);
              return (
                <label
                  key={g.key}
                  className={
                    "inline-flex h-7 items-center gap-1.5 cursor-pointer rounded-md border px-2 text-[11px] font-medium transition-colors " +
                    (on
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-muted")
                  }
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={on}
                    onChange={() => toggleStatus(g.key)}
                  />
                  {g.label}
                </label>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Año</Label>
          <Select value={year} onValueChange={(v) => updateParam("year", v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Especie</Label>
          <Select value={speciesId} onValueChange={(v) => updateParam("species", v)}>
            <SelectTrigger className="w-full">
              {speciesId === "all" ? (
                <span className="text-muted-foreground">Todas</span>
              ) : (
                <SelectValue />
              )}
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {species.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between gap-2 border-t pt-3">
          <div className="space-y-0.5">
            <Label className="flex items-center gap-1 text-xs">
              <Sparkles className="size-3" />
              Incluir oportunidades
            </Label>
            <p className="text-[10px] text-muted-foreground">
              Suma pipeline ponderado por probabilidad.
            </p>
          </div>
          <Switch
            checked={includeOpps}
            onCheckedChange={(v: boolean) => updateParam("opps", v ? "1" : null)}
          />
        </div>

        <div className="border-t pt-3 text-[10px] text-muted-foreground">
          <p className="leading-relaxed">
            Cada país tiene un color distinto. La tag muestra plantas y total USD.
            Hover para ver detalle. Click para drilldown a clientes del país.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
