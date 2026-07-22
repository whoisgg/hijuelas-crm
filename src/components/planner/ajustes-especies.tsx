"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Link2, Link2Off, Pencil } from "lucide-react";
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
import { updatePlannerSpecies } from "@/lib/actions/planner-masters";

export type AjustesEspecieRow = {
  id: number;
  name: string;
  code: string | null;
  trayFormat: number;
  rootingWeeks: number;
  maturationWeeks: number;
  predispatchWeeks: number;
  rootingAreaId: number | null;
  maturationAreaId: number | null;
  predispatchAreaId: number | null;
  priority: number;
  active: boolean;
  /** vinculada a la especie maestra compartida del CRM */
  masterLinked: boolean;
};

export type AjustesArea = { id: number; name: string; stage: string };

export function AjustesEspecies({
  species,
  areas,
}: {
  species: AjustesEspecieRow[];
  areas: AjustesArea[];
}) {
  const [editing, setEditing] = React.useState<AjustesEspecieRow | null>(null);
  const areaName = React.useMemo(
    () => new Map(areas.map((a) => [a.id, a.name])),
    [areas],
  );
  const nameOf = (id: number | null) => (id !== null ? (areaName.get(id) ?? "¿?") : "—");

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Especie</th>
            <th className="px-3 py-2 text-right font-medium">Formato</th>
            <th className="px-3 py-2 text-left font-medium">Enraiz.</th>
            <th className="px-3 py-2 text-left font-medium">Madur.</th>
            <th className="px-3 py-2 text-left font-medium">Predesp.</th>
            <th className="px-3 py-2 text-center font-medium" title="Vinculada a los maestros compartidos del CRM">
              Maestro
            </th>
            <th className="px-3 py-2 text-left font-medium">Estado</th>
            <th className="px-3 py-2 text-right font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {species.map((s) => (
            <tr key={s.id} className="hover:bg-muted/30">
              <td className="px-3 py-2">
                <span className="font-medium">{s.name}</span>
                {s.code ? (
                  <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                    {s.code}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{s.trayFormat}</td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {s.rootingWeeks > 0 ? `${s.rootingWeeks} sem · ${nameOf(s.rootingAreaId)}` : "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {s.maturationWeeks > 0
                  ? `${s.maturationWeeks} sem · ${nameOf(s.maturationAreaId)}`
                  : "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                {s.predispatchWeeks > 0
                  ? `${s.predispatchWeeks} sem · ${nameOf(s.predispatchAreaId)}`
                  : "—"}
              </td>
              <td className="px-3 py-2 text-center">
                {s.masterLinked ? (
                  <Link2
                    className="mx-auto h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
                    aria-label="Vinculada al maestro"
                  />
                ) : (
                  <Link2Off
                    className="mx-auto h-3.5 w-3.5 text-muted-foreground/50"
                    aria-label="Sin vínculo al maestro"
                  />
                )}
              </td>
              <td className="px-3 py-2">
                <Badge variant={s.active ? "outline" : "secondary"} className="text-[10px]">
                  {s.active ? "ACTIVA" : "INACTIVA"}
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

      {editing ? (
        <EspecieDialog especie={editing} areas={areas} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function AreaSelect({
  id,
  label,
  stage,
  areas,
  value,
  onChange,
}: {
  id: string;
  label: string;
  stage: string;
  areas: AjustesArea[];
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const options = areas.filter((a) => a.stage === stage);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        value={value === null ? "" : String(value)}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">— sin sector —</option>
        {options.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function EspecieDialog({
  especie,
  areas,
  onClose,
}: {
  especie: AjustesEspecieRow;
  areas: AjustesArea[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [trayFormat, setTrayFormat] = React.useState(String(especie.trayFormat));
  const [rWeeks, setRWeeks] = React.useState(String(especie.rootingWeeks));
  const [mWeeks, setMWeeks] = React.useState(String(especie.maturationWeeks));
  const [pWeeks, setPWeeks] = React.useState(String(especie.predispatchWeeks));
  const [rArea, setRArea] = React.useState<number | null>(especie.rootingAreaId);
  const [mArea, setMArea] = React.useState<number | null>(especie.maturationAreaId);
  const [pArea, setPArea] = React.useState<number | null>(especie.predispatchAreaId);
  const [priority, setPriority] = React.useState(String(especie.priority));
  const [active, setActive] = React.useState(especie.active);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await updatePlannerSpecies({
        id: especie.id,
        trayFormat: Number(trayFormat),
        rootingWeeks: Number(rWeeks),
        maturationWeeks: Number(mWeeks),
        predispatchWeeks: Number(pWeeks),
        rootingAreaId: rArea,
        maturationAreaId: mArea,
        predispatchAreaId: pArea,
        priority: Number(priority),
        active,
      });
      if (res.ok) {
        toast.success(`Ficha de ${especie.name} actualizada.`);
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
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ficha operacional · {especie.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Los cambios aplican a los lotes que se importen o creen desde ahora;
            los existentes conservan sus semanas y sectores.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sp-format">Formato (plantas/bandeja)</Label>
              <Input
                id="sp-format"
                type="number"
                min={1}
                value={trayFormat}
                onChange={(e) => setTrayFormat(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-priority">Prioridad</Label>
              <Input
                id="sp-priority"
                type="number"
                min={0}
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sp-rw">Enraiz. (sem)</Label>
              <Input
                id="sp-rw"
                type="number"
                min={0}
                value={rWeeks}
                onChange={(e) => setRWeeks(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-mw">Madur. (sem)</Label>
              <Input
                id="sp-mw"
                type="number"
                min={0}
                value={mWeeks}
                onChange={(e) => setMWeeks(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-pw">Predesp. (sem)</Label>
              <Input
                id="sp-pw"
                type="number"
                min={0}
                value={pWeeks}
                onChange={(e) => setPWeeks(e.target.value)}
              />
            </div>
          </div>

          <AreaSelect
            id="sp-rarea"
            label="Sector de enraizamiento"
            stage="enraizamiento"
            areas={areas}
            value={rArea}
            onChange={setRArea}
          />
          <AreaSelect
            id="sp-marea"
            label="Sector de maduración"
            stage="maduracion"
            areas={areas}
            value={mArea}
            onChange={setMArea}
          />
          <AreaSelect
            id="sp-parea"
            label="Sector de predespacho"
            stage="predespacho"
            areas={areas}
            value={pArea}
            onChange={setPArea}
          />

          <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="h-4 w-4 accent-[#185FA5]"
            />
            Especie activa
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
