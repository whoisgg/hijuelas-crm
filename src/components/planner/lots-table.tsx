"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Dna, Pencil, Search, Sprout } from "lucide-react";
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
  /** programa genético (cruce con los maestros del CRM por variedad) */
  program: string | null;
  year: number;
  start_week: number;
  end_week: number | null;
  plants: number;
  trays: number | null;
  rooting_area: string | null;
  status: string;
};

const SIN_PROGRAMA = "Sin programa";

export function LotsTable({ lots, scenario = false }: { lots: LotRow[]; scenario?: boolean }) {
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<LotRow | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? lots.filter(
        (l) =>
          l.lot_code.toLowerCase().includes(q) ||
          l.species.toLowerCase().includes(q) ||
          (l.variety ?? "").toLowerCase().includes(q) ||
          (l.program ?? "").toLowerCase().includes(q),
      )
    : lots;

  // Agrupado especie → programa genético (mismo patrón que /kam con los
  // contratos): headers con totales, primer grupo abierto, búsqueda expande.
  const groups = React.useMemo(() => {
    const bySpecies = new Map<string, LotRow[]>();
    for (const l of filtered) {
      const arr = bySpecies.get(l.species) ?? [];
      arr.push(l);
      bySpecies.set(l.species, arr);
    }
    return [...bySpecies.entries()]
      .map(([species, rows]) => {
        const byProgram = new Map<string, LotRow[]>();
        for (const r of rows) {
          const key = r.program ?? SIN_PROGRAMA;
          const arr = byProgram.get(key) ?? [];
          arr.push(r);
          byProgram.set(key, arr);
        }
        const programs = [...byProgram.entries()]
          .map(([program, prows]) => ({
            program,
            rows: prows,
            plants: prows.reduce((s, r) => s + r.plants, 0),
            trays: prows.reduce((s, r) => s + (r.trays ?? 0), 0),
          }))
          .sort((a, b) =>
            a.program === SIN_PROGRAMA
              ? 1
              : b.program === SIN_PROGRAMA
                ? -1
                : b.plants - a.plants,
          );
        return {
          species,
          rows,
          plants: rows.reduce((s, r) => s + r.plants, 0),
          trays: rows.reduce((s, r) => s + (r.trays ?? 0), 0),
          varieties: new Set(rows.map((r) => r.variety).filter(Boolean)).size,
          programs,
          // Sin ningún programa conocido, el subnivel no aporta — tabla plana.
          hasPrograms: programs.some((p) => p.program !== SIN_PROGRAMA),
        };
      })
      .sort((a, b) => b.plants - a.plants);
  }, [filtered]);

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

      {groups.length === 0 ? (
        <p className="rounded-lg border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
          Sin lotes para ese filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g, idx) => (
            <details
              // Remount al cambiar el modo búsqueda para re-aplicar `open`.
              key={`${g.species}-${q ? "s" : "g"}`}
              open={q ? true : idx === 0}
              className="group/especie overflow-hidden rounded-lg border bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/especie:rotate-90" />
                <Sprout className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{g.species}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {g.rows.length} {g.rows.length === 1 ? "lote" : "lotes"}
                    {g.varieties
                      ? ` · ${g.varieties} ${g.varieties === 1 ? "variedad" : "variedades"}`
                      : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-right">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Plantas
                    </div>
                    <div className="font-mono text-sm font-bold tabular-nums">
                      {g.plants.toLocaleString("es-CL")}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Bandejas
                    </div>
                    <div className="font-mono text-sm font-bold tabular-nums">
                      {g.trays.toLocaleString("es-CL")}
                    </div>
                  </div>
                </div>
              </summary>

              {g.hasPrograms ? (
                <div className="border-t bg-background/50 px-2 py-2">
                  {g.programs.map((pg) => (
                    <details
                      key={`${g.species}-${pg.program}`}
                      open
                      className="group/programa mb-1 overflow-hidden rounded-md last:mb-0"
                    >
                      <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/40">
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/programa:rotate-90" />
                        <Dna className="h-3.5 w-3.5 shrink-0 text-primary" />
                        <span
                          className={
                            pg.program === SIN_PROGRAMA
                              ? "min-w-0 flex-1 truncate text-sm text-muted-foreground"
                              : "min-w-0 flex-1 truncate text-sm font-medium"
                          }
                        >
                          {pg.program}
                          <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                            {pg.rows.length} {pg.rows.length === 1 ? "lote" : "lotes"}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-xs font-semibold tabular-nums">
                          {pg.plants.toLocaleString("es-CL")}{" "}
                          <span className="font-normal text-muted-foreground">pl ·</span>{" "}
                          {pg.trays.toLocaleString("es-CL")}{" "}
                          <span className="font-normal text-muted-foreground">band.</span>
                        </span>
                      </summary>
                      <RowsTable rows={pg.rows} onEdit={setEditing} />
                    </details>
                  ))}
                </div>
              ) : (
                <div className="border-t">
                  <RowsTable rows={g.rows} onEdit={setEditing} />
                </div>
              )}
            </details>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {filtered.length.toLocaleString("es-CL")} de {lots.length.toLocaleString("es-CL")}{" "}
        asignaciones · {groups.length} {groups.length === 1 ? "especie" : "especies"}
      </p>

      {editing ? (
        <LotEditDialog lot={editing} scenario={scenario} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function RowsTable({ rows, onEdit }: { rows: LotRow[]; onEdit: (l: LotRow) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Lote</th>
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
          {rows.map((l) => (
            <tr key={l.id} className="hover:bg-muted/30">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">
                {l.lot_code}
              </td>
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
              <td className="px-3 py-2 text-muted-foreground">{l.rooting_area ?? "—"}</td>
              <td className="px-3 py-2">
                <Badge variant="outline" className="text-[10px]">
                  {l.status}
                </Badge>
              </td>
              <td className="px-3 py-2 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${l.lot_code}`}
                  onClick={() => onEdit(l)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
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
