"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
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
import { proposeModule } from "@/lib/actions/module-requests";
import { createDraftModule } from "@/lib/actions/custom-modules";

/**
 * Tarjeta "+" del selector. Para un builder abre el ambiente sandbox (crea un
 * módulo borrador y lleva al editor). Para el resto, captura la idea como
 * especificación (la construimos después).
 */
export function ProposeModuleCard({ isBuilder = false }: { isBuilder?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      if (isBuilder) {
        const res = await createDraftModule(name, description.trim() || null);
        if (res.ok && res.key) {
          toast.success("Módulo borrador creado. Define sus campos.");
          setOpen(false);
          router.push(`/m/${res.key}/builder`);
        } else {
          toast.error(res.error ?? "No se pudo crear.");
        }
        return;
      }
      const res = await proposeModule(name, description);
      if (res.ok) {
        toast.success("Idea guardada. La usaremos para construir el módulo.");
        setName("");
        setDescription("");
        setOpen(false);
      } else {
        toast.error(res.error ?? "No se pudo guardar.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[132px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/50 p-5 text-center text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-muted">
          <Plus className="h-6 w-6" />
        </div>
        <span className="text-sm font-medium">Nuevo módulo</span>
        <span className="text-xs">
          {isBuilder ? "Créalo en un sandbox" : "Propón una idea y la construimos"}
        </span>
      </button>

      {open ? (
        <Dialog
          open
          onOpenChange={(o: boolean) => {
            if (!o) setOpen(false);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                {isBuilder ? "Nuevo módulo (sandbox)" : "Proponer un módulo"}
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground">
              {isBuilder
                ? "Se crea un módulo borrador aislado. Defines sus campos (pueden conectar maestros de solo lectura) y un admin lo publica cuando esté listo."
                : "Describe qué debería hacer el módulo. Tu idea queda como especificación y la construimos con Claude Code — no se autodespliega, pasa por desarrollo."}
            </p>
            <div className="mt-3 space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="pm-name">Nombre del módulo</Label>
                <Input
                  id="pm-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: Control de Heladas"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pm-desc">¿Qué hace?</Label>
                <textarea
                  id="pm-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  placeholder="Qué problema resuelve, qué datos maneja, quién lo usa…"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={submit} disabled={saving}>
                  {saving ? "Guardando…" : "Enviar idea"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
