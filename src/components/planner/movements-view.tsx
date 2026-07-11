"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightLeft, PackageCheck, PackagePlus, Plus, Trash2 } from "lucide-react";
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
import {
  createMovement,
  deleteMovement,
  type CreateMovementInput,
} from "@/lib/actions/planner-movements";

export type MovementRow = {
  id: number;
  type: string;
  lot_code: string | null;
  area_from: string | null;
  area_to: string | null;
  year: number;
  week: number;
  trays: number;
  plants: number;
  notes: string | null;
  created_by_name: string | null;
  created_at: string;
};

export type AreaOption = { id: number; name: string };

const TYPE_META: Record<string, { label: string; icon: React.ElementType }> = {
  recepcion: { label: "Recepción", icon: PackagePlus },
  traslado: { label: "Traslado", icon: ArrowRightLeft },
  despacho: { label: "Despacho", icon: PackageCheck },
};

export function MovementsView({
  movements,
  areas,
  defaultYear,
  defaultWeek,
}: {
  movements: MovementRow[];
  areas: AreaOption[];
  defaultYear: number;
  defaultWeek: number;
}) {
  const [creating, setCreating] = React.useState(false);
  const router = useRouter();

  const remove = async (m: MovementRow) => {
    if (!window.confirm(`¿Eliminar el movimiento #${m.id}?`)) return;
    const res = await deleteMovement(m.id);
    if (res.ok) {
      toast.success("Movimiento eliminado.");
      router.refresh();
    } else {
      toast.error(res.error ?? "No se pudo eliminar.");
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)} size="sm">
          <Plus className="h-4 w-4" /> Nuevo movimiento
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tipo</th>
              <th className="px-3 py-2 text-left font-medium">Lote</th>
              <th className="px-3 py-2 text-left font-medium">Desde → hacia</th>
              <th className="px-3 py-2 text-right font-medium">Semana</th>
              <th className="px-3 py-2 text-right font-medium">Bandejas</th>
              <th className="px-3 py-2 text-right font-medium">Plantas</th>
              <th className="px-3 py-2 text-left font-medium">Notas</th>
              <th className="px-3 py-2 text-left font-medium">Por</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {movements.map((m) => {
              const meta = TYPE_META[m.type] ?? TYPE_META.traslado;
              const Icon = meta.icon;
              return (
                <tr key={m.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="gap-1 text-[10px]">
                      <Icon className="h-3 w-3" /> {meta.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{m.lot_code ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {m.area_from ?? "—"} → {m.area_to ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    S{m.week} {m.year}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.trays.toLocaleString("es-CL")}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {m.plants.toLocaleString("es-CL")}
                  </td>
                  <td className="max-w-48 truncate px-3 py-2 text-xs text-muted-foreground">
                    {m.notes ?? ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {m.created_by_name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Eliminar"
                      onClick={() => remove(m)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {movements.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  Sin movimientos registrados. Registra recepciones, traslados y
                  despachos a medida que ocurren.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating ? (
        <MovementDialog
          areas={areas}
          defaultYear={defaultYear}
          defaultWeek={defaultWeek}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </div>
  );
}

function MovementDialog({
  areas,
  defaultYear,
  defaultWeek,
  onClose,
}: {
  areas: AreaOption[];
  defaultYear: number;
  defaultWeek: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [type, setType] = React.useState<CreateMovementInput["type"]>("traslado");
  const [lotCode, setLotCode] = React.useState("");
  const [areaFrom, setAreaFrom] = React.useState<string>("");
  const [areaTo, setAreaTo] = React.useState<string>("");
  const [week, setWeek] = React.useState(String(defaultWeek));
  const [trays, setTrays] = React.useState("0");
  const [plants, setPlants] = React.useState("0");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await createMovement({
        type,
        lotCode: lotCode.trim() || null,
        areaFromId: areaFrom ? Number(areaFrom) : null,
        areaToId: areaTo ? Number(areaTo) : null,
        year: defaultYear,
        week: Number(week),
        trays: Number(trays) || 0,
        plants: Number(plants) || 0,
        notes: notes.trim() || null,
      });
      if (res.ok) {
        toast.success("Movimiento registrado.");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo registrar.");
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
          <DialogTitle>Nuevo movimiento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mv-type">Tipo</Label>
            <select
              id="mv-type"
              value={type}
              onChange={(e) => setType(e.target.value as CreateMovementInput["type"])}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="recepcion">Recepción (entra al vivero)</option>
              <option value="traslado">Traslado (cambio de área/etapa)</option>
              <option value="despacho">Despacho (sale del vivero)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-lot">Código de lote (opcional)</Label>
            <Input
              id="mv-lot"
              value={lotCode}
              onChange={(e) => setLotCode(e.target.value)}
              placeholder="2026-23-CER-COL"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mv-from">Desde</Label>
              <select
                id="mv-from"
                value={areaFrom}
                onChange={(e) => setAreaFrom(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">—</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mv-to">Hacia</Label>
              <select
                id="mv-to"
                value={areaTo}
                onChange={(e) => setAreaTo(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                <option value="">—</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mv-week">Semana</Label>
              <Input
                id="mv-week"
                type="number"
                min={1}
                max={53}
                value={week}
                onChange={(e) => setWeek(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mv-trays">Bandejas</Label>
              <Input
                id="mv-trays"
                type="number"
                min={0}
                value={trays}
                onChange={(e) => setTrays(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mv-plants">Plantas</Label>
              <Input
                id="mv-plants"
                type="number"
                min={0}
                value={plants}
                onChange={(e) => setPlants(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-notes">Notas</Label>
            <Input
              id="mv-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? "Guardando…" : "Registrar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
