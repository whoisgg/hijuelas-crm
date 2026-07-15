"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createRecord, deleteRecord } from "@/lib/actions/custom-modules";
import type { CustomField, CustomRecord } from "@/lib/custom/data";
import type { MasterOption } from "@/lib/custom/masters";

/**
 * Vista genérica de un módulo config-driven: tabla de registros + formulario
 * de alta generado desde los campos. Los campos "master" se resuelven a un
 * select del maestro correspondiente.
 */
export function RecordView({
  moduleId,
  fields,
  records,
  masterOptions,
}: {
  moduleId: number;
  fields: CustomField[];
  records: CustomRecord[];
  masterOptions: Record<string, MasterOption[]>;
}) {
  const router = useRouter();
  const [form, setForm] = React.useState<Record<string, unknown>>({});
  const [saving, setSaving] = React.useState(false);

  const labelFor = (f: CustomField, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "—";
    if (f.type === "boolean") return value ? "Sí" : "No";
    if (f.type === "master" && f.masterSource) {
      const opt = (masterOptions[f.masterSource] ?? []).find((o) => o.id === String(value));
      return opt?.label ?? String(value);
    }
    return String(value);
  };

  const submit = async () => {
    for (const f of fields) {
      if (f.required && !form[f.key] && form[f.key] !== false) {
        toast.error(`Falta ${f.label}.`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await createRecord(moduleId, form);
      if (res.ok) {
        toast.success("Registro agregado.");
        setForm({});
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo agregar.");
      }
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (!window.confirm("¿Eliminar este registro?")) return;
    const res = await deleteRecord(id);
    if (res.ok) {
      toast.success("Eliminado.");
      router.refresh();
    } else {
      toast.error(res.error ?? "No se pudo eliminar.");
    }
  };

  if (!fields.length) {
    return (
      <p className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
        Este módulo aún no tiene campos. Un builder los define en el editor.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Nuevo registro</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {fields.map((f) => (
            <div key={f.id} className="space-y-1.5">
              <Label htmlFor={`f-${f.id}`} className="text-xs">
                {f.label}
                {f.required ? <span className="text-destructive"> *</span> : null}
              </Label>
              <FieldInput
                field={f}
                value={form[f.key]}
                options={f.masterSource ? masterOptions[f.masterSource] : undefined}
                onChange={(v) => setForm((prev) => ({ ...prev, [f.key]: v }))}
              />
            </div>
          ))}
        </div>
        <div className="mt-3 flex justify-end">
          <Button onClick={submit} disabled={saving} size="sm">
            <Plus className="h-4 w-4" /> {saving ? "Guardando…" : "Agregar"}
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              {fields.map((f) => (
                <th key={f.id} className="px-3 py-2 text-left font-medium">
                  {f.label}
                </th>
              ))}
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {records.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                {fields.map((f) => (
                  <td key={f.id} className="px-3 py-2">
                    {labelFor(f, r.data[f.key])}
                  </td>
                ))}
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Eliminar"
                    onClick={() => remove(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
            {records.length === 0 ? (
              <tr>
                <td colSpan={fields.length + 1} className="px-3 py-6 text-center text-muted-foreground">
                  Sin registros todavía.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FieldInput({
  field,
  value,
  options,
  onChange,
}: {
  field: CustomField;
  value: unknown;
  options?: MasterOption[];
  onChange: (v: unknown) => void;
}) {
  const id = `f-${field.id}`;
  if (field.type === "boolean") {
    return (
      <input
        id={id}
        type="checkbox"
        checked={!!value}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4"
      />
    );
  }
  if (field.type === "select") {
    return (
      <select
        id={id}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">—</option>
        {field.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === "master") {
    return (
      <select
        id={id}
        value={(value as string) ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
      >
        <option value="">—</option>
        {(options ?? []).map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  return (
    <Input
      id={id}
      type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
      value={(value as string) ?? ""}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
