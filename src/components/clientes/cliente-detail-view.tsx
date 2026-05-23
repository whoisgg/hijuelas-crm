"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Briefcase,
  Calendar,
  FileText,
  GitBranch,
  Hash,
  MapPin,
  UserCircle2,
  Users,
} from "lucide-react";

import type {
  ClientDetail,
  CountryOption,
} from "@/lib/actions/clientes-types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { HighlightsPanel } from "@/components/design-system/highlights-panel";
import { RecordPageShell } from "@/components/design-system/record-page-shell";
import { CountryFlag } from "@/components/clientes/country-flag";
import { ClienteDetallesForm } from "@/components/clientes/cliente-detalles-form";
import { ClienteHeaderActions } from "@/components/clientes/cliente-header-actions";
import { ContactosTab } from "@/components/clientes/contactos-tab";
import { DireccionesTab } from "@/components/clientes/direcciones-tab";

type Props = {
  detail: ClientDetail;
  countries: CountryOption[];
};

const CONTRACT_STATUS_LABEL: Record<string, string> = {
  borrador: "Borrador",
  por_revisar: "Por revisar",
  firmado: "Firmado",
  en_proceso: "En proceso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

const CONTRACT_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  firmado: "default",
  en_proceso: "default",
  borrador: "outline",
  por_revisar: "secondary",
  finalizado: "secondary",
  cancelado: "outline",
};

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function formatCurrency(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-CL", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency} ${value.toLocaleString("es-CL")}`;
  }
}

export function ClienteDetailView({ detail, countries }: Props) {
  const router = useRouter();
  const { client, counts, contacts, addresses, contracts, opportunities, activity } =
    detail;

  // TODO: replace with <HighlightsPanel> — usando ya el DS HighlightsPanel.
  const highlights = (
    <HighlightsPanel
      title={client.name}
      subtitle={client.legal_name ?? client.giro ?? undefined}
      avatar={{ fallback: initialsOf(client.name) }}
      badges={[
        ...(client.is_active
          ? [{ label: "Activo" as const, variant: "success" as const }]
          : [{ label: "Inactivo" as const, variant: "secondary" as const }]),
        ...(client.country
          ? [
              {
                label: `${client.country.name_es}`,
                variant: "default" as const,
              },
            ]
          : []),
      ]}
      highlights={[
        {
          label: "Tax ID",
          value: client.tax_id ? (
            <span className="font-mono">{client.tax_id}</span>
          ) : (
            "—"
          ),
        },
        {
          label: "País",
          value: client.country ? (
            <CountryFlag
              iso2={client.country.iso2}
              name={client.country.name_es}
            />
          ) : (
            "—"
          ),
        },
        {
          label: "Owner",
          value: client.owner?.full_name ?? client.owner?.email ?? "Sin owner",
        },
        {
          label: "Giro",
          value: client.giro ?? "—",
        },
        {
          label: "Contratos",
          value: counts.contracts,
        },
        {
          label: "Oportunidades",
          value: counts.opportunities,
        },
      ]}
    />
  );

  const detallesTab = (
    <ClienteDetallesForm
      clientId={client.id}
      initial={{
        name: client.name,
        legal_name: client.legal_name,
        tax_id: client.tax_id,
        giro: client.giro,
        country_id: client.country?.id ?? null,
        region: client.region,
        notes: client.notes,
      }}
      countries={countries}
    />
  );

  const contactosTab = (
    <ContactosTab clientId={client.id} contacts={contacts} />
  );

  const direccionesTab = (
    <DireccionesTab
      clientId={client.id}
      addresses={addresses}
      countries={countries}
    />
  );

  const contratosTab = contracts.length === 0 ? (
    <EmptyTab
      icon={FileText}
      title="Sin contratos"
      hint="Cuando se cree un contrato para este cliente, aparecerá acá."
    />
  ) : (
    <ul className="flex flex-col gap-2">
      {contracts.map((c) => (
        <li
          key={c.id}
          className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <FileText className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <Link
                href={`/contratos/${c.id}`}
                className="text-sm font-medium hover:underline"
              >
                {c.number}
              </Link>
              <div className="flex items-center gap-2 pt-0.5">
                <Badge
                  variant={CONTRACT_STATUS_VARIANT[c.status] ?? "outline"}
                  className="h-5 px-1.5 text-[10px]"
                >
                  {CONTRACT_STATUS_LABEL[c.status] ?? c.status}
                </Badge>
                {c.signed_at ? (
                  <span className="text-[11px] text-muted-foreground">
                    Firmado {new Date(c.signed_at).toLocaleDateString("es-CL")}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">
              {formatCurrency(Number(c.total_neto ?? 0), c.currency)}
            </div>
            {c.currency !== "USD" ? (
              <div className="text-[11px] text-muted-foreground">
                ≈ {formatCurrency(Number(c.total_neto_usd ?? 0), "USD")}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );

  const oportunidadesTab = opportunities.length === 0 ? (
    <EmptyTab
      icon={Briefcase}
      title="Sin oportunidades"
      hint="Las oportunidades vinculadas a este cliente aparecerán acá."
    />
  ) : (
    <ul className="flex flex-col gap-2">
      {opportunities.map((o) => (
        <li
          key={o.id}
          className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <Link
                href={`/oportunidades/${o.id}`}
                className="text-sm font-medium hover:underline"
              >
                {o.name}
              </Link>
              <div className="flex items-center gap-2 pt-0.5 text-[11px] text-muted-foreground">
                <span>{o.probability_pct}%</span>
                {o.expected_close_date ? (
                  <>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(o.expected_close_date).toLocaleDateString(
                        "es-CL",
                      )}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="text-right">
            {o.estimated_value ? (
              <div className="text-sm font-medium">
                {formatCurrency(Number(o.estimated_value), o.currency)}
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );

  const actividadTab = activity.length === 0 ? (
    <EmptyTab
      icon={GitBranch}
      title="Sin actividad registrada"
      hint="Cada cambio en el cliente queda registrado acá."
    />
  ) : (
    <ul className="flex flex-col gap-2">
      {activity.map((a) => (
        <li
          key={a.id}
          className="flex items-start gap-3 rounded-lg border bg-card p-3"
        >
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
            <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium">{a.action}</span>
              <time
                className="shrink-0 text-[11px] text-muted-foreground"
                dateTime={a.created_at}
              >
                {formatDistanceToNow(new Date(a.created_at), {
                  addSuffix: true,
                  locale: es,
                })}
              </time>
            </div>
            {a.diff_json ? (
              <pre className="mt-1 overflow-x-auto rounded bg-muted/40 p-2 text-[11px] text-muted-foreground">
                {JSON.stringify(a.diff_json, null, 2)}
              </pre>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );

  const tabs = [
    { id: "detalles", label: "Detalles", content: detallesTab },
    {
      id: "contactos",
      label: "Contactos",
      content: contactosTab,
      count: counts.contacts,
    },
    {
      id: "direcciones",
      label: "Direcciones",
      content: direccionesTab,
      count: counts.addresses,
    },
    {
      id: "contratos",
      label: "Contratos",
      content: contratosTab,
      count: counts.contracts,
    },
    {
      id: "oportunidades",
      label: "Oportunidades",
      content: oportunidadesTab,
      count: counts.opportunities,
    },
    {
      id: "actividad",
      label: "Actividad",
      content: actividadTab,
      count: activity.length,
    },
  ];

  // TODO: replace with <ActivityTimeline> — por ahora se renderiza dentro del
  // tab Actividad. Cuando esté listo el componente, pasarlo a `timeline`.

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <BreadcrumbBack />
        <ClienteHeaderActions
          clientId={client.id}
          onEdit={() => router.push(`/clientes/${client.id}?tab=detalles`)}
        />
      </div>
      <RecordPageShell tabs={tabs} highlights={highlights} defaultTab="detalles" />
    </div>
  );
}

function BreadcrumbBack() {
  return (
    <Link
      href="/clientes"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <Users className="h-3.5 w-3.5" />
      Volver a clientes
    </Link>
  );
}

function EmptyTab({
  icon: Icon,
  title,
  hint,
  className,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed bg-card/30 p-8 text-center",
        className,
      )}
    >
      <Icon className="h-6 w-6 text-muted-foreground/60" />
      <p className="text-sm font-medium">{title}</p>
      {hint ? (
        <p className="max-w-md text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

// Unused for now but exported for potential reuse.
export const _Icons = { Hash, MapPin, UserCircle2 };
