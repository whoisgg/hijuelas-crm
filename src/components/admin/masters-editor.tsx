"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Pencil, Plus, Sprout } from "lucide-react";
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
  createMasterSpecies,
  createMasterVariety,
  updateMasterSpecies,
  updateMasterVariety,
} from "@/lib/actions/admin-masters";

export type MasterVarietyRow = {
  id: string;
  name: string;
  programId: string | null;
  programName: string | null;
  isActive: boolean;
};

export type MasterSpeciesRow = {
  id: string;
  name: string;
  code: string | null;
  varieties: MasterVarietyRow[];
};

export type MasterProgramOption = { id: string; name: string };

type SpeciesDialogState = { mode: "create" } | { mode: "edit"; species: MasterSpeciesRow };
type VarietyDialogState =
  | { mode: "create"; species: MasterSpeciesRow }
  | { mode: "edit"; species: MasterSpeciesRow; variety: MasterVarietyRow };

export function MastersEditor({
  species,
  programs,
}: {
  species: MasterSpeciesRow[];
  programs: MasterProgramOption[];
}) {
  const [speciesDialog, setSpeciesDialog] = React.useState<SpeciesDialogState | null>(null);
  const [varietyDialog, setVarietyDialog] = React.useState<VarietyDialogState | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setSpeciesDialog({ mode: "create" })}>
          <Plus className="h-4 w-4" /> Nueva especie
        </Button>
      </div>

      {species.map((sp) => (
        <details key={sp.id} className="group/msp overflow-hidden rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/msp:rotate-90" />
            <Sprout className="h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{sp.name}</span>
              {sp.code ? (
                <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                  {sp.code}
                </span>
              ) : null}
            </div>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              {sp.varieties.length}{" "}
              {sp.varieties.length === 1 ? "variedad" : "variedades"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Editar especie ${sp.name}`}
              onClick={(e: React.MouseEvent) => {
                e.preventDefault();
                setSpeciesDialog({ mode: "edit", species: sp });
              }}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </summary>

          <div className="border-t">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Variedad</th>
                  <th className="px-3 py-2 text-left font-medium">Programa genético</th>
                  <th className="px-3 py-2 text-left font-medium">Estado</th>
                  <th className="px-3 py-2 text-right font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {sp.varieties.map((v) => (
                  <tr key={v.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">{v.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {v.programName ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <Badge
                        variant={v.isActive ? "outline" : "secondary"}
                        className="text-[10px]"
                      >
                        {v.isActive ? "ACTIVA" : "INACTIVA"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar ${v.name}`}
                        onClick={() =>
                          setVarietyDialog({ mode: "edit", species: sp, variety: v })
                        }
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {sp.varieties.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Sin variedades.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            <div className="border-t px-3 py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVarietyDialog({ mode: "create", species: sp })}
              >
                <Plus className="h-3.5 w-3.5" /> Nueva variedad en {sp.name}
              </Button>
            </div>
          </div>
        </details>
      ))}

      {speciesDialog ? (
        <SpeciesDialog state={speciesDialog} onClose={() => setSpeciesDialog(null)} />
      ) : null}
      {varietyDialog ? (
        <VarietyDialog
          state={varietyDialog}
          programs={programs}
          onClose={() => setVarietyDialog(null)}
        />
      ) : null}
    </div>
  );
}

function SpeciesDialog({
  state,
  onClose,
}: {
  state: SpeciesDialogState;
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = state.mode === "edit" ? state.species : null;
  const [name, setName] = React.useState(editing?.name ?? "");
  const [code, setCode] = React.useState(editing?.code ?? "");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = editing
        ? await updateMasterSpecies({ id: editing.id, name, code: code || null })
        : await createMasterSpecies({ name, code: code || null });
      if (res.ok) {
        toast.success(editing ? "Especie actualizada." : "Especie creada.");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo guardar.");
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
          <DialogTitle>{editing ? `Editar ${editing.name}` : "Nueva especie"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="msp-name">Nombre</Label>
            <Input
              id="msp-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="msp-code">Código (opcional)</Label>
            <Input
              id="msp-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ARA"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving || name.trim().length < 2}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function VarietyDialog({
  state,
  programs,
  onClose,
}: {
  state: VarietyDialogState;
  programs: MasterProgramOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = state.mode === "edit" ? state.variety : null;
  const [name, setName] = React.useState(editing?.name ?? "");
  const [programId, setProgramId] = React.useState<string | null>(
    editing?.programId ?? null,
  );
  const [isActive, setIsActive] = React.useState(editing?.isActive ?? true);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = editing
        ? await updateMasterVariety({
            id: editing.id,
            name,
            geneticProgramId: programId,
            isActive,
          })
        : await createMasterVariety({
            speciesId: state.species.id,
            name,
            geneticProgramId: programId,
          });
      if (res.ok) {
        toast.success(editing ? "Variedad actualizada." : "Variedad creada.");
        onClose();
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo guardar.");
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
            {editing
              ? `Editar ${editing.name}`
              : `Nueva variedad · ${state.species.name}`}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mvar-name">Nombre</Label>
            <Input
              id="mvar-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mvar-program">Programa genético</Label>
            <select
              id="mvar-program"
              value={programId ?? ""}
              onChange={(e) => setProgramId(e.target.value || null)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              <option value="">— sin programa —</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          {editing ? (
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 accent-[#185FA5]"
              />
              Variedad activa
            </label>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving || name.trim().length < 2}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
