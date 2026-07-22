"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Link2, Pencil, Plus } from "lucide-react";
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
import {
  createMasterProgram,
  relinkPlannerCatalogs,
  updateMasterProgram,
} from "@/lib/actions/admin-masters";

export type MasterProgramRow = {
  id: string;
  name: string;
  owner: string | null;
  varietyCount: number;
};

export function ProgramsEditor({ programs }: { programs: MasterProgramRow[] }) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<
    { mode: "create" } | { mode: "edit"; program: MasterProgramRow } | null
  >(null);
  const [relinking, setRelinking] = React.useState(false);

  const relink = async () => {
    setRelinking(true);
    try {
      const res = await relinkPlannerCatalogs();
      if (res.ok) {
        toast.success(
          `Re-vinculación lista: ${res.speciesLinked ?? 0} especies y ${res.varietiesLinked ?? 0} variedades del planner vinculadas.`,
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo re-vincular.");
      }
    } finally {
      setRelinking(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={relink} disabled={relinking}>
          <Link2 className="h-4 w-4" />
          {relinking ? "Vinculando…" : "Re-vincular planner"}
        </Button>
        <Button size="sm" onClick={() => setDialog({ mode: "create" })}>
          <Plus className="h-4 w-4" /> Nuevo programa
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Programa</th>
              <th className="px-3 py-2 text-left font-medium">Titular</th>
              <th className="px-3 py-2 text-right font-medium">Variedades</th>
              <th className="px-3 py-2 text-right font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {programs.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{p.name}</td>
                <td className="px-3 py-2 text-muted-foreground">{p.owner ?? "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums">{p.varietyCount}</td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Editar ${p.name}`}
                    onClick={() => setDialog({ mode: "edit", program: p })}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {programs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Sin programas todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        «Re-vincular planner» vuelve a cruzar los catálogos del Planner con estos
        maestros por nombre — útil después de crear las variedades que faltaban.
      </p>

      {dialog ? <ProgramDialog state={dialog} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}

function ProgramDialog({
  state,
  onClose,
}: {
  state: { mode: "create" } | { mode: "edit"; program: MasterProgramRow };
  onClose: () => void;
}) {
  const router = useRouter();
  const editing = state.mode === "edit" ? state.program : null;
  const [name, setName] = React.useState(editing?.name ?? "");
  const [owner, setOwner] = React.useState(editing?.owner ?? "");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = editing
        ? await updateMasterProgram({ id: editing.id, name, owner: owner || null })
        : await createMasterProgram({ name, owner: owner || null });
      if (res.ok) {
        toast.success(editing ? "Programa actualizado." : "Programa creado.");
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
          <DialogTitle>{editing ? `Editar ${editing.name}` : "Nuevo programa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="mprog-name">Nombre</Label>
            <Input
              id="mprog-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mprog-owner">Titular (opcional)</Label>
            <Input
              id="mprog-owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              placeholder="Fall Creek, OZblu…"
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
