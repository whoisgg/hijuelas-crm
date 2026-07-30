"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Dna, Leaf, Pencil, Search, Sprout } from "lucide-react";
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
  /** texto referencial del laboratorio (ej. código de lote de Alstro); no es un vínculo real */
  plantCode: string | null;
};

const SIN_PROGRAMA = "Sin programa";
const SIN_VARIEDAD = "Sin variedad";

/** Plantas/Bandejas en dos columnas de ancho fijo con su etiqueta — el
 *  string corrido "X pl · Y band." se leía como un solo número; separadas
 *  y alineadas a la derecha, cada columna es reconocible sin leer el texto. */
function Totals({ plants, trays }: { plants: number; trays: number }) {
  return (
    <div className="flex shrink-0 items-baseline gap-3 text-right">
      <div className="w-[4.5rem]">
        <div className="font-mono text-xs font-semibold tabular-nums">
          {plants.toLocaleString("es-CL")}
        </div>
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
          plantas
        </div>
      </div>
      <div className="w-14">
        <div className="font-mono text-xs font-semibold tabular-nums">
          {trays.toLocaleString("es-CL")}
        </div>
        <div className="text-[9px] uppercase tracking-wide text-muted-foreground">
          bandejas
        </div>
      </div>
    </div>
  );
}

export function LotsTable({
  lots,
  scenario = false,
  canEdit = true,
}: {
  lots: LotRow[];
  scenario?: boolean;
  /** Editar el plan vigente (no un escenario) es solo para admin — ver /planner/movimientos. */
  canEdit?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<LotRow | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? lots.filter(
        (l) =>
          l.lot_code.toLowerCase().includes(q) ||
          l.species.toLowerCase().includes(q) ||
          (l.variety ?? "").toLowerCase().includes(q) ||
          (l.program ?? "").toLowerCase().includes(q) ||
          (l.plantCode ?? "").toLowerCase().includes(q),
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
          placeholder="Buscar por código, especie, variedad o plantcode"
          className="pl-8"
        />
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
          Sin lotes para ese filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <details
              // Remount al cambiar el modo búsqueda para re-aplicar `open`.
              // Por defecto todo colapsado; buscar expande los grupos con match.
              key={`${g.species}-${q ? "s" : "g"}`}
              open={!!q}
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
                      open={!!q}
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
                        <Totals plants={pg.plants} trays={pg.trays} />
                      </summary>
                      <VarietyGroups
                        rows={pg.rows}
                        query={q}
                        onEdit={canEdit ? setEditing : null}
                      />
                    </details>
                  ))}
                </div>
              ) : (
                <div className="border-t">
                  <VarietyGroups
                    rows={g.rows}
                    query={q}
                    onEdit={canEdit ? setEditing : null}
                  />
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

/** Subnivel variedad dentro de especie/programa (ej. agrupar los 71 lotes de
 *  OZ y ver los de "Mágica" juntos). Con una sola variedad en el grupo, el
 *  subnivel no aporta — tabla plana directa, mismo criterio que programa. */
function VarietyGroups({
  rows,
  query,
  onEdit,
}: {
  rows: LotRow[];
  query: string;
  onEdit: ((l: LotRow) => void) | null;
}) {
  const byVariety = React.useMemo(() => {
    const map = new Map<string, LotRow[]>();
    for (const r of rows) {
      const key = r.variety ?? SIN_VARIEDAD;
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return [...map.entries()]
      .map(([variety, vrows]) => ({
        variety,
        rows: vrows,
        plants: vrows.reduce((s, r) => s + r.plants, 0),
        trays: vrows.reduce((s, r) => s + (r.trays ?? 0), 0),
      }))
      .sort((a, b) =>
        a.variety === SIN_VARIEDAD
          ? 1
          : b.variety === SIN_VARIEDAD
            ? -1
            : b.plants - a.plants,
      );
  }, [rows]);

  if (byVariety.length <= 1) {
    return <RowsTable rows={rows} onEdit={onEdit} />;
  }

  return (
    <div className="px-2 py-2">
      {byVariety.map((vg) => (
        <details
          key={vg.variety}
          open={!!query}
          className="group/variedad mb-1 overflow-hidden rounded-md border last:mb-0"
        >
          <summary className="flex cursor-pointer list-none items-center gap-3 px-3 py-2 transition-colors hover:bg-muted/40">
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/variedad:rotate-90" />
            <Leaf className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span
              className={
                vg.variety === SIN_VARIEDAD
                  ? "min-w-0 flex-1 truncate text-sm text-muted-foreground"
                  : "min-w-0 flex-1 truncate text-sm font-medium"
              }
            >
              {vg.variety}
              <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                {vg.rows.length} {vg.rows.length === 1 ? "lote" : "lotes"}
              </span>
            </span>
            <Totals plants={vg.plants} trays={vg.trays} />
          </summary>
          <RowsTable rows={vg.rows} onEdit={onEdit} />
        </details>
      ))}
    </div>
  );
}

function RowsTable({
  rows,
  onEdit,
}: {
  rows: LotRow[];
  /** null: sin permiso para editar — no se muestra el lápiz. */
  onEdit: ((l: LotRow) => void) | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Lote</th>
            <th
              className="px-3 py-2 text-left font-medium"
              title="Texto referencial del laboratorio (ej. código de lote de Alstro) — no es un vínculo real"
            >
              Plantcode
            </th>
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
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs text-muted-foreground">
                {l.plantCode ?? "—"}
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
                {onEdit ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${l.lot_code}`}
                    onClick={() => onEdit(l)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                ) : null}
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
  const [plantCode, setPlantCode] = React.useState(lot.plantCode ?? "");
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
      // planner_scenario_lots (mesa de trabajo/simulador) no tiene columna
      // plant_code — es solo referencia del laboratorio sobre el plan real.
      const res = scenario
        ? await updateScenarioLot(payload)
        : await updateLot({ ...payload, plantCode: plantCode.trim() || null });
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
          {!scenario ? (
            <div className="space-y-1.5">
              <Label htmlFor="lot-plantcode">Plantcode</Label>
              <Input
                id="lot-plantcode"
                value={plantCode}
                onChange={(e) => setPlantCode(e.target.value)}
                placeholder="Código de lote del laboratorio (opcional)"
              />
              <p className="text-xs text-muted-foreground">
                Solo texto referencial (ej. Alstro) — no vincula datos entre sistemas.
              </p>
            </div>
          ) : null}
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
