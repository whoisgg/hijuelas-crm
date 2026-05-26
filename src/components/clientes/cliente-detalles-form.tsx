"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save, X } from "lucide-react";

import { updateClientAction } from "@/lib/actions/clientes";
import type {
  CountryOption,
  UpdateClientInput,
} from "@/lib/actions/clientes-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type Initial = {
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  giro: string | null;
  country_id: string | null;
  region: string | null;
  notes: string | null;
};

type Props = {
  clientId: string;
  initial: Initial;
  countries: CountryOption[];
  editing: boolean;
  onCancel: () => void;
  onSaved: () => void;
};

const NONE = "__none__";

export function ClienteDetallesForm({
  clientId,
  initial,
  countries,
  editing,
  onCancel,
  onSaved,
}: Props) {
  const [state, setState] = React.useState(initial);
  const [pending, startTransition] = React.useTransition();

  // Si el caller cancela (o cambia de cliente), revertir cambios locales.
  React.useEffect(() => {
    if (!editing) setState(initial);
  }, [editing, initial]);

  const handleChange = <K extends keyof typeof state>(
    key: K,
    value: (typeof state)[K],
  ) => setState((s) => ({ ...s, [key]: value }));

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const payload: UpdateClientInput = {
      name: state.name,
      legal_name: state.legal_name,
      tax_id: state.tax_id,
      giro: state.giro,
      country_id: state.country_id,
      region: state.region,
      notes: state.notes,
    };

    startTransition(async () => {
      const res = await updateClientAction(clientId, payload);
      if (res.ok) {
        toast.success("Cliente actualizado");
        onSaved();
      } else {
        toast.error(res.error);
      }
    });
  };

  const disabled = !editing;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField label="Nombre" required htmlFor="name">
          <Input
            id="name"
            value={state.name}
            onChange={(e) => handleChange("name", e.target.value)}
            required
            disabled={disabled}
          />
        </FormField>

        <FormField label="Razón social" htmlFor="legal_name">
          <Input
            id="legal_name"
            value={state.legal_name ?? ""}
            onChange={(e) =>
              handleChange("legal_name", e.target.value || null)
            }
            disabled={disabled}
          />
        </FormField>

        <FormField label="Tax ID / RUT" htmlFor="tax_id">
          <Input
            id="tax_id"
            value={state.tax_id ?? ""}
            onChange={(e) => handleChange("tax_id", e.target.value || null)}
            className="font-mono"
            disabled={disabled}
          />
        </FormField>

        <FormField label="Giro" htmlFor="giro">
          <Input
            id="giro"
            value={state.giro ?? ""}
            onChange={(e) => handleChange("giro", e.target.value || null)}
            disabled={disabled}
          />
        </FormField>

        <FormField label="País" htmlFor="country">
          <Select
            value={state.country_id ?? NONE}
            onValueChange={(v) =>
              handleChange("country_id", v === NONE ? null : String(v))
            }
            disabled={disabled}
          >
            <SelectTrigger id="country" className="w-full">
              <SelectValue placeholder="Seleccionar país" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Sin país</SelectItem>
              {countries.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name_es}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>

        <FormField label="Región" htmlFor="region">
          <Input
            id="region"
            value={state.region ?? ""}
            onChange={(e) => handleChange("region", e.target.value || null)}
            disabled={disabled}
          />
        </FormField>
      </div>

      <FormField label="Notas" htmlFor="notes">
        <Textarea
          id="notes"
          rows={4}
          value={state.notes ?? ""}
          onChange={(e) => handleChange("notes", e.target.value || null)}
          placeholder="Información interna del cliente..."
          disabled={disabled}
        />
      </FormField>

      {editing ? (
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
            <X className="h-4 w-4" />
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Guardar cambios
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function FormField({
  label,
  htmlFor,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
