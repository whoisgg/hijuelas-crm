"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePlannerArea } from "@/lib/actions/planner-masters";

export type AjustesSectorRow = {
  id: number;
  name: string;
  stage: string;
  capacityTrays: number;
  priority: number;
  active: boolean;
  locations: number;
  physicalTrays: number;
};

const STAGE_LABEL: Record<string, string> = {
  enraizamiento: "Enraizamiento",
  maduracion: "Maduración",
  predespacho: "Predespacho",
};

export function AjustesSectores({ sectors }: { sectors: AjustesSectorRow[] }) {
  const [editing, setEditing] = React.useState<AjustesSectorRow | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Sector</th>
            <th className="px-3 py-2 text-left font-medium">Etapa</th>
            <th className="px-3 py-2 text-right font-medium">Capacidad plan</th>
            <th className="px-3 py-2 text-right font-medium">Cap. física</th>
            <th className="px-3 py-2 text-right font-medium">Mesones</th>
            <th className="px-3 py-2 text-right font-medium">Prioridad</th>
            <th className="px-3 py-2 text-left font-medium">Estado</th>
            <th className="px-3 py-2 text-right font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {sectors.map((s) => (
            <tr key={s.id} className="hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">{s.name}</td>
              <td className="px-3 py-2 text-muted-foreground">
                {STAGE_LABEL[s.stage] ?? s.stage}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {s.capacityTrays.toLocaleString("es-CL")}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {s.physicalTrays ? s.physicalTrays.toLocaleString("es-CL") : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {s.locations || "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{s.priority}</td>
              <td className="px-3 py-2">
                <Badge variant={s.active ? "outline" : "secondary"} className="text-[10px]">
                  {s.active ? "ACTIVO" : "INACTIVO"}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${s.name}`}
                  onClick={() => setEditing(s)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing ? <SectorDialog sector={editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

function SectorDialog({
  sector,
  onClose,
}: {
  sector: AjustesSectorRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [capacity, setCapacity] = React.useState(String(sector.capacityTrays));
  const [priority, setPriority] = React.useState(String(sector.priority));
  const [active, setActive] = React.useState(sector.active);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await updatePlannerArea({
        id: sector.id,
        capacityTrays: Number(capacity),
        priority: Number(priority),
        active,
      });
      if (res.ok) {
        toast.success(`Sector ${sector.name} actualizado.`);
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo actualizar.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar sector {sector.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sector-capacity">Capacidad de planificación (bandejas)</Label>
            <Input
              id="sector-capacity"
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Base del plan, las alertas y la proyección FIFO. La capacidad física
              ({sector.physicalTrays.toLocaleString("es-CL")}) viene de los mesones
              cargados en Hotelería.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sector-priority">Prioridad (orden de llenado)</Label>
            <Input
              id="sector-priority"
              type="number"
              min={0}
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
            />
          </div>
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-[#185FA5]"
            />
            Sector activo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
