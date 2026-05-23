"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Inbox,
  Loader2,
  Mail,
  Phone,
  Plus,
  Star,
  StarOff,
  UserRound,
} from "lucide-react";

import type { Database } from "@/lib/database.types";
import {
  createContactAction,
  setPrimaryContactAction,
} from "@/lib/actions/clientes";
import type { CreateContactInput } from "@/lib/actions/clientes-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Contact = Database["public"]["Tables"]["client_contacts"]["Row"];

type Props = {
  clientId: string;
  contacts: Contact[];
};

export function ContactosTab({ clientId, contacts }: Props) {
  const [showForm, setShowForm] = React.useState(contacts.length === 0);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {contacts.length} contacto{contacts.length === 1 ? "" : "s"}
        </p>
        {!showForm ? (
          <Button size="sm" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nuevo contacto
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <NewContactForm
          clientId={clientId}
          onDone={() => setShowForm(false)}
          allowCancel={contacts.length > 0}
        />
      ) : null}

      {contacts.length === 0 && !showForm ? (
        <EmptyContacts onAdd={() => setShowForm(true)} />
      ) : null}

      <ul className="flex flex-col gap-2">
        {contacts.map((c) => (
          <ContactRow key={c.id} contact={c} clientId={clientId} />
        ))}
      </ul>
    </div>
  );
}

function ContactRow({
  contact,
  clientId,
}: {
  contact: Contact;
  clientId: string;
}) {
  const [pending, startTransition] = React.useTransition();

  const togglePrimary = () => {
    if (contact.is_primary) return;
    startTransition(async () => {
      const res = await setPrimaryContactAction(clientId, contact.id);
      if (res.ok) toast.success(`${contact.name} es el contacto primario`);
      else toast.error(res.error);
    });
  };

  return (
    <li className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
          <UserRound className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{contact.name}</span>
            {contact.is_primary ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                <Star className="h-3 w-3 fill-current" />
                Primario
              </span>
            ) : null}
          </div>
          {contact.role ? (
            <p className="truncate text-xs text-muted-foreground">
              {contact.role}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground">
            {contact.email ? (
              <a
                href={`mailto:${contact.email}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Mail className="h-3 w-3" />
                {contact.email}
              </a>
            ) : null}
            {contact.phone ? (
              <a
                href={`tel:${contact.phone}`}
                className="inline-flex items-center gap-1 hover:text-foreground"
              >
                <Phone className="h-3 w-3" />
                {contact.phone}
              </a>
            ) : null}
          </div>
          {contact.notes ? (
            <p className="pt-1 text-xs text-muted-foreground">{contact.notes}</p>
          ) : null}
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={togglePrimary}
        disabled={pending || contact.is_primary}
        aria-label={
          contact.is_primary ? "Contacto primario" : "Marcar como primario"
        }
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : contact.is_primary ? (
          <Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
        ) : (
          <StarOff className="h-3.5 w-3.5" />
        )}
      </Button>
    </li>
  );
}

function NewContactForm({
  clientId,
  onDone,
  allowCancel,
}: {
  clientId: string;
  onDone: () => void;
  allowCancel: boolean;
}) {
  const [form, setForm] = React.useState<CreateContactInput>({
    name: "",
    email: null,
    phone: null,
    role: null,
    notes: null,
    is_primary: false,
  });
  const [pending, startTransition] = React.useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      const res = await createContactAction(clientId, form);
      if (res.ok) {
        toast.success("Contacto creado");
        setForm({
          name: "",
          email: null,
          phone: null,
          role: null,
          notes: null,
          is_primary: false,
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
        <Field label="Nombre" required htmlFor="contact-name">
          <Input
            id="contact-name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
        </Field>
        <Field label="Rol" htmlFor="contact-role">
          <Input
            id="contact-role"
            value={form.role ?? ""}
            onChange={(e) =>
              setForm({ ...form, role: e.target.value || null })
            }
            placeholder="Comprador, finanzas..."
          />
        </Field>
        <Field label="Email" htmlFor="contact-email">
          <Input
            id="contact-email"
            type="email"
            value={form.email ?? ""}
            onChange={(e) =>
              setForm({ ...form, email: e.target.value || null })
            }
          />
        </Field>
        <Field label="Teléfono" htmlFor="contact-phone">
          <Input
            id="contact-phone"
            value={form.phone ?? ""}
            onChange={(e) =>
              setForm({ ...form, phone: e.target.value || null })
            }
          />
        </Field>
      </div>
      <Field label="Notas" htmlFor="contact-notes">
        <Textarea
          id="contact-notes"
          rows={2}
          value={form.notes ?? ""}
          onChange={(e) =>
            setForm({ ...form, notes: e.target.value || null })
          }
        />
      </Field>
      <label className="inline-flex items-center gap-2 text-xs">
        <input
          type="checkbox"
          checked={form.is_primary ?? false}
          onChange={(e) =>
            setForm({ ...form, is_primary: e.target.checked })
          }
          className="h-3.5 w-3.5 rounded border-input"
        />
        Marcar como contacto primario
      </label>
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
        <Button type="submit" size="sm" disabled={pending || !form.name.trim()}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plus className="h-3.5 w-3.5" />
          )}
          Crear contacto
        </Button>
      </div>
    </form>
  );
}

function EmptyContacts({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/30 p-8 text-center">
      <Inbox className="h-6 w-6 text-muted-foreground/60" />
      <p className="text-sm font-medium">Sin contactos</p>
      <p className="text-xs text-muted-foreground">
        Agregá al menos un contacto para este cliente.
      </p>
      <Button size="sm" variant="outline" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
        Nuevo contacto
      </Button>
    </div>
  );
}

function Field({
  label,
  required,
  htmlFor,
  children,
}: {
  label: string;
  required?: boolean;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}
