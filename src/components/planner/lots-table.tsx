"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Search } from "lucide-react";
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
import { updateLot } from "@/lib/actions/planner-lots";
import { updateScenarioLot } from "@/lib/actions/planner-scenarios";

export type LotRow = {
  id: number;
  lot_code: string;
  species: string;
  variety: string | null;
  year: number;
  start_week: number;
  end_week: number | null;
  plants: number;
  trays: number | null;
  rooting_area: string | null;
  status: string;
};

export function LotsTable({ lots, scenario = false }: { lots: LotRow[]; scenario?: boolean }) {
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<LotRow | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? lots.filter(
        (l) =>
          l.lot_code.toLowerCase().includes(q) ||
          l.species.toLowerCase().includes(q) ||
          (l.variety ?? "").toLowerCase().includes(q),
      )
    : lots;

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por código, especie o variedad"
          className="pl-8"
        />
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Lote</th>
              <th className="px-3 py-2 text-left font-medium">Especie</th>
              <th className="px-3 py-2 text-left font-medium">Variedad</th>
              <th className="px-3 py-2 text-right font-medium">Semanas</th>
              <th className="px-3 py-2 text-right font-medium">Plantas</th>
              <th className="px-3 py-2 text-right font-medium">Bandejas</th>
              <th className="px-3 py-2 text-left font-medium">Enraiza en</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
              <th className="px-3 py-2 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.map((l) => (
              <tr key={l.id} className="hover:bg-muted/30">
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                  {l.lot_code}
                </td>
                <td className="px-3 py-2">{l.species}</td>
                <td className="px-3 py-2 text-muted-foreground">{l.variety ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  S{l.start_week}
                  {l.end_week !== null ? ` → S${l.end_week}` : ""}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.plants.toLocaleString("es-CL")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.trays?.toLocaleString("es-CL") ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {l.rooting_area ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                  >
                    {l.status}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${l.lot_code}`}
                    onClick={() => setEditing(l)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  Sin lotes para ese filtro.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {filtered.length.toLocaleString("es-CL")} de {lots.length.toLocaleString("es-CL")} asignaciones
      </p>

      {editing ? (
        <LotEditDialog lot={editing} scenario={scenario} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function LotEditDialog({
  lot,
  scenario,
  onClose,
}: {
  lot: LotRow;
  scenario: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [plants, setPlants] = React.useState(String(lot.plants));
  const [startWeek, setStartWeek] = React.useState(String(lot.start_week));
  const [status, setStatus] = React.useState(lot.status);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const payload = {
        id: lot.id,
        plants: Number(plants),
        startWeek: Number(startWeek),
        status,
      };
      const res = scenario ? await updateScenarioLot(payload) : await updateLot(payload);
      if (res.ok) {
        toast.success(`Lote ${lot.lot_code} actualizado.`);
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
          <DialogTitle>
            Editar lote <span className="font-mono text-sm">{lot.lot_code}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lot-plants">Plantas</Label>
            <Input
              id="lot-plants"
              type="number"
              min={0}
              value={plants}
              onChange={(e) => setPlants(e.target.value)}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Las bandejas se recalculan con el formato de la especie.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lot-week">Semana de inicio (campaña)</Label>
            <Input
              id="lot-week"
              type="number"
              min={1}
              value={startWeek}
              onChange={(e) => setStartWeek(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Mover la semana desplaza todas las etapas por el mismo delta.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lot-status">Estado</Label>
            <select
              id="lot-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="ACTIVO">ACTIVO</option>
              <option value="PAUSADO">PAUSADO</option>
              <option value="CANCELADO">CANCELADO</option>
              <option value="DESPACHADO">DESPACHADO</option>
            </select>
          </div>
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
