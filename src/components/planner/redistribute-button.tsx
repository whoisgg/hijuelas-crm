"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createScenario } from "@/lib/actions/planner-scenarios";

/**
 * Entrada a la mesa de trabajo desde el banner de sobrecupo: la
 * redistribución vive en un escenario (nunca el plan real). Elige uno
 * existente o crea uno nuevo y salta al inbox del sector en esa semana.
 */
export function RedistributeButton({
  areaId,
  week,
  scenarios,
  lot,
  label = "Redistribuir",
  fullWidth = false,
}: {
  areaId: number;
  week: number;
  scenarios: { id: number; name: string }[];
  /** código de lote a preseleccionar en la mesa de trabajo */
  lot?: string;
  label?: string;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const go = (scenarioId: number) => {
    const loteParam = lot ? `&lote=${encodeURIComponent(lot)}` : "";
    router.push(
      `/planner/sector/${areaId}?week=${week}&escenario=${scenarioId}${loteParam}`,
    );
  };

  const createAndGo = async () => {
    setBusy(true);
    try {
      const res = await createScenario(
        `Redistribución S${week}`,
        "Creado desde el sobrecupo del sector.",
      );
      if (res.ok && res.id) {
        toast.success("Escenario creado con la copia del plan.");
        go(res.id);
      } else {
        toast.error(res.error ?? "No se pudo crear el escenario.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className={cn(
          "border-red-300 text-red-700 hover:bg-red-100 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950",
          fullWidth && "w-full justify-center",
        )}
        onClick={() => setOpen(true)}
      >
        <Wand2 className="h-4 w-4" /> {label}
      </Button>

      {open ? (
        <Dialog
          open
          onOpenChange={(o: boolean) => {
            if (!o) setOpen(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Redistribuir en un escenario</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              Los movimientos se hacen sobre un escenario sandbox; el plan real
              no se modifica hasta que lo apruebes.
            </p>
            <div className="mt-3 space-y-1.5">
              <Button
                onClick={createAndGo}
                disabled={busy}
                className="w-full justify-start"
              >
                <Plus className="h-4 w-4" /> Nuevo escenario desde el plan actual
              </Button>
              {scenarios.length ? (
                <>
                  <p className="px-1 pt-2 text-xs text-muted-foreground">
                    o continuar en uno existente:
                  </p>
                  {scenarios.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={busy}
                      onClick={() => go(s.id)}
                      className="flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50"
                    >
                      <FlaskConical className="h-4 w-4 text-primary" />
                      {s.name}
                    </button>
                  ))}
                </>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
