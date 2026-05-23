"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, X, DollarSign } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { FxRates } from "@/lib/actions/fx-rates";
import { updateFxRates } from "@/lib/actions/fx-rates";

type Props = {
  initial: FxRates;
};

const numFmt = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

export function FxRatesLegend({ initial }: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [clp, setClp] = React.useState<string>(String(initial.clpPerUsd));
  const [eur, setEur] = React.useState<string>(String(initial.eurPerUsd));
  const [saving, startTransition] = React.useTransition();

  const onSave = () => {
    const clpNum = Number(clp);
    const eurNum = Number(eur);
    if (!clpNum || clpNum <= 0 || !eurNum || eurNum <= 0) {
      toast.error("Las tasas deben ser positivas");
      return;
    }
    startTransition(async () => {
      try {
        const res = await updateFxRates({ clpPerUsd: clpNum, eurPerUsd: eurNum });
        toast.success(`FX actualizado · ${res.updated} contratos recalculados`);
        setOpen(false);
        router.refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Error guardando FX");
      }
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
            title="Tipos de cambio aplicados"
          />
        }
      >
        <DollarSign className="h-3 w-3" />
        <span className="font-mono tabular-nums">
          USD/CLP {numFmt.format(initial.clpPerUsd)}
        </span>
        <span className="mx-1 text-border">·</span>
        <span className="font-mono tabular-nums">
          EUR/USD {numFmt.format(initial.eurPerUsd)}
        </span>
        <Pencil className="ml-1 h-3 w-3 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <div className="mb-2 flex items-center justify-between">
          <div className="text-xs font-semibold">Tipos de cambio</div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="space-y-2 text-xs">
          <div>
            <label className="text-muted-foreground">1 USD = </label>
            <div className="mt-1 flex items-center gap-1">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={clp}
                onChange={(e) => setClp(e.target.value)}
                className="h-7 font-mono text-xs"
              />
              <span className="text-muted-foreground">CLP</span>
            </div>
          </div>
          <div>
            <label className="text-muted-foreground">1 USD = </label>
            <div className="mt-1 flex items-center gap-1">
              <Input
                type="number"
                step="0.001"
                min="0"
                value={eur}
                onChange={(e) => setEur(e.target.value)}
                className="h-7 font-mono text-xs"
              />
              <span className="text-muted-foreground">EUR</span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-[10px] text-muted-foreground">
            Se aplica a todos los contratos y recalcula totales USD.
          </p>
          <Button size="sm" onClick={onSave} disabled={saving}>
            <Save className="h-3.5 w-3.5" />
            {saving ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
