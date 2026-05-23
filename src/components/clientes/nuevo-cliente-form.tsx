"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

import { createClientAction } from "@/lib/actions/clientes";
import type {
  CountryOption,
  CreateClientInput,
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

const NONE = "__none__";

type Props = {
  countries: CountryOption[];
  initialError?: string;
  initialErrorField?: string;
};

export function NuevoClienteForm({
  countries,
  initialError,
  initialErrorField,
}: Props) {
  const router = useRouter();
  const [form, setForm] = React.useState<CreateClientInput>({
    name: "",
    legal_name: null,
    tax_id: null,
    giro: null,
    country_id: null,
    region: null,
    notes: null,
  });
  const [error, setError] = React.useState<string | undefined>(initialError);
  const [errorField, setErrorField] = React.useState<string | undefined>(
    initialErrorField,
  );
  const [pending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);
    setErrorField(undefined);
    startTransition(async () => {
      const res = await createClientAction(form);
      if (res.ok) {
        toast.success("Cliente creado");
        router.push(`/clientes/${res.data.id}`);
        router.refresh();
      } else {
        setError(res.error);
        setErrorField(res.field);
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      <div>
        <Link
          href="/clientes"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Volver a clientes
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-4 rounded-xl border bg-card p-5"
      >
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight">Nuevo cliente</h2>
          <p className="text-xs text-muted-foreground">
            Los campos con <span className="text-destructive">*</span> son
            obligatorios. Podrás agregar contactos y direcciones después de
            crearlo.
          </p>
        </div>

        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        ) : null}

        <Field
          label="Nombre"
          htmlFor="name"
          required
          error={errorField === "name" ? error : undefined}
        >
          <Input
            id="name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            aria-invalid={errorField === "name" || undefined}
            placeholder="Ecuablue, Hortifrut, ..."
            autoFocus
          />
        </Field>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Razón social" htmlFor="legal_name">
            <Input
              id="legal_name"
              value={form.legal_name ?? ""}
              onChange={(e) =>
                setForm({ ...form, legal_name: e.target.value || null })
              }
            />
          </Field>

          <Field
            label="Tax ID / RUT"
            htmlFor="tax_id"
            error={errorField === "tax_id" ? error : undefined}
          >
            <Input
              id="tax_id"
              value={form.tax_id ?? ""}
              onChange={(e) =>
                setForm({ ...form, tax_id: e.target.value || null })
              }
              aria-invalid={errorField === "tax_id" || undefined}
              className="font-mono"
            />
          </Field>

          <Field label="Giro" htmlFor="giro">
            <Input
              id="giro"
              value={form.giro ?? ""}
              onChange={(e) =>
                setForm({ ...form, giro: e.target.value || null })
              }
              placeholder="Productor de berries, distribuidor..."
            />
          </Field>

          <Field label="País" htmlFor="country">
            <Select
              value={form.country_id ?? NONE}
              onValueChange={(v) =>
                setForm({
                  ...form,
                  country_id: v === NONE ? null : String(v),
                })
              }
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
          </Field>

          <Field label="Región" htmlFor="region">
            <Input
              id="region"
              value={form.region ?? ""}
              onChange={(e) =>
                setForm({ ...form, region: e.target.value || null })
              }
            />
          </Field>
        </div>

        <Field label="Notas" htmlFor="notes">
          <Textarea
            id="notes"
            rows={3}
            value={form.notes ?? ""}
            onChange={(e) =>
              setForm({ ...form, notes: e.target.value || null })
            }
            placeholder="Cualquier detalle relevante..."
          />
        </Field>

        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => router.push("/clientes")}
          >
            Cancelar
          </Button>
          <Button type="submit" disabled={pending || !form.name.trim()}>
            {pending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Crear cliente
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  required,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
