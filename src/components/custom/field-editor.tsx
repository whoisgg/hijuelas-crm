"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Rocket, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addField, deleteField, setModuleStatus } from "@/lib/actions/custom-modules";
import type { CustomField, CustomFieldType } from "@/lib/custom/data";
import { MASTERS } from "@/lib/custom/masters";

const TYPES: { value: CustomFieldType; label: string }[] = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "date", label: "Fecha" },
  { value: "boolean", label: "Sí/No" },
  { value: "select", label: "Lista de opciones" },
  { value: "master", label: "Maestro (conectar)" },
];

/**
 * Editor del sandbox: define los campos del módulo (incluyendo referencias a
 * maestros) y, si eres admin, lo promueves a producción.
 */
export function FieldEditor({
  moduleId,
  status,
  fields,
  isAdmin,
}: {
  moduleId: number;
  status: "draft" | "live";
  fields: CustomField[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [label, setLabel] = React.useState("");
  const [type, setType] = React.useState<CustomFieldType>("text");
  const [masterSource, setMasterSource] = React.useState(MASTERS[0]?.key ?? "");
  const [optionsText, setOptionsText] = React.useState("");
  const [required, setRequired] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const add = async () => {
    setBusy(true);
    try {
      const res = await addField({
        moduleId,
        label,
        type,
        options: type === "select" ? optionsText.split(",").map((s) => s.trim()).filter(Boolean) : [],
        masterSource: type === "master" ? masterSource : null,
        required,
      });
      if (res.ok) {
        toast.success("Campo agregado.");
        setLabel("");
        setOptionsText("");
        setRequired(false);
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo agregar.");
      }
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: number) => {
    const res = await deleteField(id);
    if (res.ok) {
      toast.success("Campo eliminado.");
      router.refresh();
    } else {
      toast.error(res.error ?? "No se pudo eliminar.");
    }
  };

  const promote = async () => {
    const next = status === "live" ? "draft" : "live";
    if (next === "live" && !window.confirm("¿Publicar este módulo para todos?")) return;
    const res = await setModuleStatus(moduleId, next);
    if (res.ok) {
      toast.success(next === "live" ? "Módulo publicado." : "Vuelto a borrador.");
      router.refresh();
    } else {
      toast.error(res.error ?? "No se pudo cambiar el estado.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Agregar campo</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="fe-label" className="text-xs">Nombre</Label>
            <Input
              id="fe-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ej: Cuadrilla"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fe-type" className="text-xs">Tipo</Label>
            <select
              id="fe-type"
              value={type}
              onChange={(e) => setType(e.target.value as CustomFieldType)}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          {type === "master" ? (
            <div className="space-y-1.5">
              <Label htmlFor="fe-master" className="text-xs">Maestro</Label>
              <select
                id="fe-master"
                value={masterSource}
                onChange={(e) => setMasterSource(e.target.value)}
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              >
                {MASTERS.map((m) => (
                  <option key={m.key} value={m.key}>{m.label}</option>
                ))}
              </select>
            </div>
          ) : type === "select" ? (
            <div className="space-y-1.5">
              <Label htmlFor="fe-opts" className="text-xs">Opciones (coma)</Label>
              <Input
                id="fe-opts"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder="Baja, Media, Alta"
              />
            </div>
          ) : (
            <div />
          )}
          <div className="flex items-end gap-2">
            <label className="flex items-center gap-1.5 text-xs">
              <input
                type="checkbox"
                checked={required}
                onChange={(e) => setRequired(e.target.checked)}
                className="h-3.5 w-3.5"
              />
              Obligatorio
            </label>
            <Button onClick={add} disabled={busy || label.trim().length < 1} size="sm" className="ml-auto">
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Campo</th>
              <th className="px-3 py-2 text-left font-medium">Tipo</th>
              <th className="px-3 py-2 text-left font-medium">Detalle</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {fields.map((f) => (
              <tr key={f.id}>
                <td className="px-3 py-2 font-medium">
                  {f.label}
                  {f.required ? <span className="text-destructive"> *</span> : null}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {TYPES.find((t) => t.value === f.type)?.label ?? f.type}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {f.type === "master"
                    ? MASTERS.find((m) => m.key === f.masterSource)?.label ?? f.masterSource
                    : f.type === "select"
                      ? f.options.join(", ")
                      : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button variant="ghost" size="icon" aria-label="Eliminar" onClick={() => remove(f.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {fields.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                  Aún no hay campos. Agrega el primero arriba.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3 text-sm">
        <span className="text-muted-foreground">
          Estado:{" "}
          <span className="font-medium text-foreground">
            {status === "live" ? "Publicado" : "Borrador (solo tú y admin)"}
          </span>
        </span>
        {isAdmin ? (
          <Button onClick={promote} size="sm" variant={status === "live" ? "outline" : "default"} className="ml-auto">
            <Rocket className="h-4 w-4" />
            {status === "live" ? "Volver a borrador" : "Publicar a producción"}
          </Button>
        ) : (
          <span className="ml-auto text-xs text-muted-foreground">
            {status === "live" ? "" : "Un admin lo publica cuando esté listo."}
          </span>
        )}
      </div>
    </div>
  );
}
