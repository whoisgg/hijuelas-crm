"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { updatePlannerParameter } from "@/lib/actions/planner-masters";

export type AjustesParametroRow = {
  key: string;
  value: string;
  comment: string | null;
};

export function AjustesParametros({ parameters }: { parameters: AjustesParametroRow[] }) {
  const [editing, setEditing] = React.useState<AjustesParametroRow | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Parámetro</th>
            <th className="px-3 py-2 text-right font-medium">Valor</th>
            <th className="px-3 py-2 text-left font-medium">Descripción</th>
            <th className="px-3 py-2 text-right font-medium" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {parameters.map((p) => (
            <tr key={p.key} className="hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">{p.key}</td>
              <td className="px-3 py-2 text-right font-mono tabular-nums">{p.value}</td>
              <td className="px-3 py-2 text-muted-foreground">{p.comment ?? "—"}</td>
              <td className="px-3 py-2 text-right">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Editar ${p.key}`}
                  onClick={() => setEditing(p)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </td>
            </tr>
          ))}
          {parameters.length === 0 ? (
            <tr>
              <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                Sin parámetros cargados.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {editing ? (
        <ParametroDialog parametro={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

function ParametroDialog({
  parametro,
  onClose,
}: {
  parametro: AjustesParametroRow;
  onClose: () => void;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(parametro.value);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await updatePlannerParameter({ key: parametro.key, value });
      if (res.ok) {
        toast.success(`Parámetro actualizado.`);
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
          <DialogTitle>{parametro.key}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {parametro.comment ? (
            <p className="text-xs text-muted-foreground">{parametro.comment}</p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="param-value">Valor</Label>
            <Input
              id="param-value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
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
