"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Filter } from "lucide-react";

import type { LookupItem } from "@/lib/actions/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Props = {
  organizations: LookupItem[];
  species: LookupItem[];
  owners: LookupItem[];
  clients: LookupItem[];
};

export function CalendarFilters(props: Props) {
  const params = useSearchParams();
  const minProb = Number.parseInt(params.get("minProb") ?? "0", 10) || 0;
  // Forzamos remount cuando el param externo cambia para reiniciar el estado local del slider.
  return <CalendarFiltersInner key={`minProb-${minProb}`} {...props} />;
}

function CalendarFiltersInner({ organizations, species, owners, clients }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const includeOpps = params.get("opps") === "1";
  const minProb = Number.parseInt(params.get("minProb") ?? "0", 10) || 0;
  const owner = params.get("owner") ?? "all";
  const client = params.get("client") ?? "all";
  const species_ = params.get("species") ?? "all";
  const org = params.get("organization") ?? "all";

  const update = React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value == null || value === "" || value === "all" || value === "0") next.delete(key);
      else next.set(key, value);
      router.push(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [params, pathname, router],
  );

  const [draftMinProb, setDraftMinProb] = React.useState<number>(minProb);

  return (
    <Card size="sm" className="w-full lg:w-72">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Filter className="size-4 text-primary" />
          Filtros
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-xs">Mostrar oportunidades</Label>
            <p className="text-[10px] text-muted-foreground">
              Eventos con borde punteado.
            </p>
          </div>
          <Switch
            checked={includeOpps}
            onCheckedChange={(v: boolean) => update("opps", v ? "1" : null)}
          />
        </div>

        {includeOpps ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Probabilidad mínima</Label>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {draftMinProb}%
              </span>
            </div>
            <Slider
              min={0}
              max={100}
              step={5}
              value={draftMinProb}
              onValueChange={(v) => setDraftMinProb(Array.isArray(v) ? v[0] ?? 0 : v)}
              onValueCommitted={(v) => {
                const value = Array.isArray(v) ? v[0] ?? 0 : v;
                update("minProb", value > 0 ? String(value) : null);
              }}
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label className="text-xs">Owner</Label>
          <Select value={owner} onValueChange={(v) => update("owner", v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {owners.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Cliente</Label>
          <Select value={client} onValueChange={(v) => update("client", v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Especie</Label>
          <Select value={species_} onValueChange={(v) => update("species", v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
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

        <div className="space-y-1.5">
          <Label className="text-xs">Organización</Label>
          <Select value={org} onValueChange={(v) => update("organization", v)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5 border-t pt-3">
          <Label className="text-xs text-muted-foreground">Leyenda</Label>
          <div className="space-y-1 text-[11px] text-muted-foreground">
            <LegendDot color="oklch(0.50 0.18 145)" label="Contrato finalizado" />
            <LegendDot color="oklch(0.55 0.15 235)" label="Contrato en proceso" />
            <LegendDot color="oklch(0.70 0 0)" label="Contrato pendiente" />
            <LegendDot
              color="oklch(0.65 0.16 145 / 0.4)"
              label="Oportunidad (prob alta)"
              dotted
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LegendDot({
  color,
  label,
  dotted,
}: {
  color: string;
  label: string;
  dotted?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="inline-block size-3 rounded-sm border"
        style={{
          background: color,
          borderStyle: dotted ? "dashed" : "solid",
          borderColor: "var(--border)",
        }}
      />
      <span>{label}</span>
    </div>
  );
}
