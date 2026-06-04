"use client";

import * as React from "react";
import { toast } from "sonner";
import { Building2, Save, ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateOrganizationLegal,
  type OrganizationLegalRow,
} from "@/lib/actions/admin-organizations";

type FieldKey =
  | "legal_name"
  | "tax_id"
  | "legal_representative_name"
  | "legal_representative_id"
  | "legal_domicile"
  | "bank_name"
  | "bank_account"
  | "notice_name"
  | "notice_email"
  | "signer_email";

const FIELDS: { key: FieldKey; label: string; placeholder?: string }[] = [
  { key: "legal_name", label: "Razón social" },
  { key: "tax_id", label: "RUT" },
  { key: "legal_representative_name", label: "Representante legal" },
  { key: "legal_representative_id", label: "Cédula del representante" },
  { key: "legal_domicile", label: "Domicilio" },
  { key: "bank_name", label: "Banco" },
  { key: "bank_account", label: "Cuenta corriente" },
  { key: "notice_name", label: "Contacto avisos (nombre)" },
  { key: "notice_email", label: "Contacto avisos (email)" },
  {
    key: "signer_email",
    label: "Email firmante DocuSign (vendedor)",
    placeholder: "firma@grupohijuelas.com",
  },
];

function OrgCard({ org }: { org: OrganizationLegalRow }) {
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState<Record<FieldKey, string>>(() => {
    const init = {} as Record<FieldKey, string>;
    for (const f of FIELDS) init[f.key] = (org[f.key] as string | null) ?? "";
    return init;
  });
  const [pending, startTransition] = React.useTransition();

  const complete = org.legal_representative_name && org.signer_email;

  const save = () => {
    startTransition(async () => {
      const res = await updateOrganizationLegal({
        id: org.id,
        legal_name: form.legal_name || null,
        tax_id: form.tax_id || null,
        legal_representative_name: form.legal_representative_name || null,
        legal_representative_id: form.legal_representative_id || null,
        legal_domicile: form.legal_domicile || null,
        bank_name: form.bank_name || null,
        bank_account: form.bank_account || null,
        notice_name: form.notice_name || null,
        notice_email: form.notice_email || null,
        signer_email: form.signer_email || null,
      });
      if (res.ok) toast.success(`${org.name} actualizada`);
      else toast.error(res.message ?? "Error");
    });
  };

  return (
    <div className="rounded-xl border bg-card">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <div className="flex items-center gap-3">
          <Building2 className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">{org.name}</p>
            <p className="text-xs text-muted-foreground">
              {org.contract_prefix ?? "—"}
              {org.legal_representative_name
                ? ` · ${org.legal_representative_name}`
                : " · sin representante legal"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              complete
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
            )}
          >
            {complete ? "Completo" : "Incompleto"}
          </span>
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
          />
        </div>
      </button>

      {open ? (
        <div className="border-t p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1">
                <Label htmlFor={`${org.id}-${f.key}`} className="text-xs">
                  {f.label}
                </Label>
                <Input
                  id={`${org.id}-${f.key}`}
                  value={form[f.key]}
                  placeholder={f.placeholder}
                  onChange={(e) =>
                    setForm((s) => ({ ...s, [f.key]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <Button size="sm" disabled={pending} onClick={save}>
              <Save className="h-3.5 w-3.5" />
              Guardar
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function OrganizationsLegalEditor({
  organizations,
}: {
  organizations: OrganizationLegalRow[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Datos legales del vendedor por organización. Se usan al generar el
        contrato para firma (representante, banco, avisos) y el firmante DocuSign
        del lado vendedor (<code className="rounded bg-muted px-1">signer_email</code>).
      </p>
      {organizations.map((org) => (
        <OrgCard key={org.id} org={org} />
      ))}
    </div>
  );
}
