"use client";

import * as React from "react";
import { toast } from "sonner";
import { Inbox, Loader2, MapPin, Plus } from "lucide-react";

import type { Database } from "@/lib/database.types";
import { createAddressAction } from "@/lib/actions/clientes";
import type {
  CountryOption,
  CreateAddressInput,
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
import { CountryFlag } from "@/components/clientes/country-flag";

type Address = Database["public"]["Tables"]["client_addresses"]["Row"] & {
  country: { id: string; name_es: string; iso2: string } | null;
};

const NONE = "__none__";

type Props = {
  clientId: string;
  addresses: Address[];
  countries: CountryOption[];
};

const TYPE_LABELS: Record<string, string> = {
  fiscal: "Fiscal",
  envio: "Envío",
  otra: "Otra",
};

export function DireccionesTab({ clientId, addresses, countries }: Props) {
  const [showForm, setShowForm] = React.useState(addresses.length === 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {addresses.length} dirección{addresses.length === 1 ? "" : "es"}
        </p>
        {!showForm ? (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Agregar
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <NewAddressForm
          clientId={clientId}
          countries={countries}
          onDone={() => setShowForm(false)}
          allowCancel={addresses.length > 0}
        />
      ) : null}

      {addresses.length === 0 && !showForm ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/30 p-8 text-center">
          <Inbox className="h-6 w-6 text-muted-foreground/60" />
          <p className="text-sm font-medium">Sin direcciones</p>
          <p className="text-xs text-muted-foreground">
            Agregá direcciones fiscales o de envío para este cliente.
          </p>
        </div>
      ) : null}

      <ul className="flex flex-col gap-2">
        {addresses.map((addr) => (
          <li
            key={addr.id}
            className="flex items-start gap-3 rounded-lg border bg-card p-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <MapPin className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {addr.type ? TYPE_LABELS[addr.type] ?? addr.type : "Otra"}
                </span>
                {addr.country ? (
                  <CountryFlag
                    iso2={addr.country.iso2}
                    name={addr.country.name_es}
                    className="text-xs text-muted-foreground"
                  />
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">
                {[addr.line1, addr.line2, addr.region, addr.postal_code]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NewAddressForm({
  clientId,
  countries,
  onDone,
  allowCancel,
}: {
  clientId: string;
  countries: CountryOption[];
  onDone: () => void;
  allowCancel: boolean;
}) {
  const [form, setForm] = React.useState<CreateAddressInput>({
    type: "fiscal",
    line1: null,
    line2: null,
    region: null,
    postal_code: null,
    country_id: null,
  });
  const [pending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createAddressAction(clientId, form);
      if (res.ok) {
        toast.success("Dirección agregada");
        setForm({
          type: "fiscal",
          line1: null,
          line2: null,
          region: null,
          postal_code: null,
          country_id: null,
        });
        onDone();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-3 rounded-lg border bg-card p-3"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Tipo" htmlFor="addr-type">
          <Select
            value={form.type ?? "otra"}
            onValueChange={(v) =>
              setForm({
                ...form,
                type: String(v) as CreateAddressInput["type"],
              })
            }
          >
            <SelectTrigger id="addr-type" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fiscal">Fiscal</SelectItem>
              <SelectItem value="envio">Envío</SelectItem>
              <SelectItem value="otra">Otra</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="País" htmlFor="addr-country">
          <Select
            value={form.country_id ?? NONE}
            onValueChange={(v) =>
              setForm({ ...form, country_id: v === NONE ? null : String(v) })
            }
          >
            <SelectTrigger id="addr-country" className="w-full">
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
        <Field label="Calle / línea 1" htmlFor="addr-line1">
          <Input
            id="addr-line1"
            value={form.line1 ?? ""}
            onChange={(e) =>
              setForm({ ...form, line1: e.target.value || null })
            }
          />
        </Field>
        <Field label="Línea 2" htmlFor="addr-line2">
          <Input
            id="addr-line2"
            value={form.line2 ?? ""}
            onChange={(e) =>
              setForm({ ...form, line2: e.target.value || null })
            }
          />
        </Field>
        <Field label="Región / Ciudad" htmlFor="addr-region">
          <Input
            id="addr-region"
            value={form.region ?? ""}
            onChange={(e) =>
              setForm({ ...form, region: e.target.value || null })
            }
          />
        </Field>
        <Field label="Código postal" htmlFor="addr-cp">
          <Input
            id="addr-cp"
            value={form.postal_code ?? ""}
            onChange={(e) =>
              setForm({ ...form, postal_code: e.target.value || null })
            }
          />
        </Field>
      </div>
      <div className="flex justify-end gap-2">
        {allowCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDone}
            disabled={pending}
          >
            Cancelar
          </Button>
        ) : null}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Agregar dirección
        </Button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
