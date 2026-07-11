"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createScenarioLot } from "@/lib/actions/planner-scenarios";

export function AddScenarioLot({
  scenarioId,
  species,
  defaultWeek,
  year,
}: {
  scenarioId: number;
  species: { id: number; name: string }[];
  defaultWeek: number;
  year: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [speciesId, setSpeciesId] = React.useState(String(species[0]?.id ?? ""));
  const [plants, setPlants] = React.useState("10000");
  const [week, setWeek] = React.useState(String(defaultWeek));
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await createScenarioLot({
        scenarioId,
        speciesId: Number(speciesId),
        plants: Number(plants),
        startWeek: Number(week),
        year,
      });
      if (res.ok) {
        toast.success("Demanda agregada al escenario.");
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo agregar.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nueva demanda what-if
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
              <DialogTitle>Nueva demanda what-if</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="wl-species">Especie</Label>
                <select
                  id="wl-species"
                  value={speciesId}
                  onChange={(e) => setSpeciesId(e.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                >
                  {species.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Las etapas y áreas se derivan de la ficha de la especie.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="wl-plants">Plantas</Label>
                  <Input
                    id="wl-plants"
                    type="number"
                    min={1}
                    value={plants}
                    onChange={(e) => setPlants(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="wl-week">Semana de inicio</Label>
                  <Input
                    id="wl-week"
                    type="number"
                    min={1}
                    value={week}
                    onChange={(e) => setWeek(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={saving}>
                  {saving ? "Agregando…" : "Agregar"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
