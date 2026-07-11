import { notFound } from "next/navigation";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import {
  Building2,
  Calendar,
  Mail,
  MapPin,
  Phone,
  Sprout,
  UserRound,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export const dynamic = "force-dynamic";
export const metadata = { title: "Compartido — Grupo Hijuelas" };

type SharedItem = {
  variety_name: string | null;
  species_name: string | null;
  qty_plants: number;
  qty_delivered: number | null;
  qty_pending: number;
  format: string | null;
  material_type: string | null;
  delivery_year: number | null;
  delivery_week: number | null;
  delivery_month: number | null;
  status: string | null;
};

type SharedPayment = {
  type: string;
  amount: number;
  iva: number | null;
  currency: string;
  status: string;
  due_date: string | null;
  paid_at: string | null;
  reference: string | null;
};

type SharedContract = {
  id: string;
  number: string;
  status: string;
  condition: string | null;
  sale_type: string | null;
  currency: string;
  signed_at: string | null;
  total_neto: number | null;
  total_neto_usd: number | null;
  incoterm: string | null;
  items: SharedItem[];
  payments: SharedPayment[];
};

type SharedTotals = {
  contracts_count: number;
  total_usd: number;
  plants_total: number;
  plants_delivered: number;
  payments_paid: number;
  payments_pending: number;
  payments_overdue_count: number;
};

type SharedClient = {
  id: string;
  name: string;
  legal_name: string | null;
  giro: string | null;
  region: string | null;
  country_name: string | null;
  country_iso2: string | null;
  kam_name: string | null;
  kam_email: string | null;
  kam_phone: string | null;
  contacts: {
    name: string;
    role: string | null;
    email: string | null;
    phone: string | null;
    is_primary: boolean;
  }[];
  contracts: SharedContract[];
  totals: SharedTotals;
};

async function fetchSharedClient(token: string): Promise<SharedClient | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  const supabase = createSupabaseClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: SharedClient | null; error: { message: string } | null }>)(
    "public_get_shared_client",
    { p_token: token },
  );
  if (error || !data) return null;
  return data;
}

function fmtUsd(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function fmtNumber(n: number | null): string {
  if (n === null || n === undefined) return "0";
  return new Intl.NumberFormat("es-CL").format(n);
}

function fmtMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${currency} ${fmtNumber(amount)}`;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("es-CL", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function fmtDeliveryWindow(item: SharedItem): string {
  if (!item.delivery_year) return "Sin fecha";
  if (item.delivery_week) return `${item.delivery_year} · Sem ${item.delivery_week}`;
  if (item.delivery_month) {
    const months = [
      "ene", "feb", "mar", "abr", "may", "jun",
      "jul", "ago", "sep", "oct", "nov", "dic",
    ];
    const m = months[item.delivery_month - 1] ?? `M${item.delivery_month}`;
    return `${m} ${item.delivery_year}`;
  }
  return `${item.delivery_year}`;
}

function paymentTypeLabel(type: string): string {
  return {
    anticipo_1: "Anticipo 1",
    anticipo_2: "Anticipo 2",
    saldo: "Saldo final",
  }[type] ?? type;
}

function paymentStatusBadge(status: string): { label: string; tone: "ok" | "warn" | "bad" | "muted" } {
  switch (status) {
    case "pagado":
      return { label: "Pagado", tone: "ok" };
    case "pendiente":
      return { label: "Pendiente", tone: "warn" };
    case "vencido":
      return { label: "Vencido", tone: "bad" };
    default:
      return { label: status, tone: "muted" };
  }
}

export default async function SharedClientPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const client = await fetchSharedClient(token);
  if (!client) notFound();

  const t = client.totals;

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 md:px-6 md:py-16">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-5 w-5" />
          </div>
          <span className="text-sm font-semibold text-muted-foreground">
            Hijuelas Growth
          </span>
        </div>
        <Badge variant="outline">Ficha pública</Badge>
      </div>

      {/* Identidad del cliente */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-2xl">{client.name}</CardTitle>
          {client.legal_name ? (
            <CardDescription>{client.legal_name}</CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <section className="grid gap-3 text-sm md:grid-cols-2">
            {client.country_name ? (
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>
                  {client.country_name}
                  {client.region ? ` · ${client.region}` : ""}
                </span>
              </div>
            ) : null}
            {client.giro ? (
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span>{client.giro}</span>
              </div>
            ) : null}
          </section>

          <Separator />

          {/* KAM */}
          <section className="space-y-2">
            <h3 className="text-sm font-semibold text-muted-foreground">
              Tu contacto en Hijuelas
            </h3>
            {client.kam_name ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 font-medium">
                  <UserRound className="h-4 w-4 text-primary" />
                  {client.kam_name}
                </div>
                {client.kam_email ? (
                  <a
                    href={`mailto:${client.kam_email}`}
                    className="ml-6 flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" /> {client.kam_email}
                  </a>
                ) : null}
                {client.kam_phone ? (
                  <a
                    href={`tel:${client.kam_phone}`}
                    className="ml-6 flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" /> {client.kam_phone}
                  </a>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Sin KAM asignado.</p>
            )}
          </section>
        </CardContent>
      </Card>

      {/* Resumen comercial — KPIs */}
      {t.contracts_count > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Resumen comercial</CardTitle>
            <CardDescription>
              Visión rápida de tu relación con Hijuelas (sin contratos
              cancelados).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <Kpi label="Ventas" value={fmtNumber(t.contracts_count)} />
              <Kpi label="Total USD" value={fmtUsd(t.total_usd)} />
              <Kpi
                label="Plantas comprometidas"
                value={fmtNumber(t.plants_total)}
                sub={
                  t.plants_delivered > 0
                    ? `${fmtNumber(t.plants_delivered)} entregadas`
                    : null
                }
              />
              <Kpi
                label="Por cobrar"
                value={fmtUsd(t.payments_pending)}
                sub={
                  t.payments_overdue_count > 0
                    ? `${t.payments_overdue_count} vencido${
                        t.payments_overdue_count === 1 ? "" : "s"
                      }`
                    : null
                }
                tone={t.payments_overdue_count > 0 ? "warn" : "default"}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Contratos vigentes */}
      {client.contracts.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Contratos vigentes</CardTitle>
            <CardDescription>
              Detalle de variedades, ventanas de entrega y estado de pagos por
              contrato.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {client.contracts.map((c) => (
              <ContractCard key={c.id} contract={c} />
            ))}
          </CardContent>
        </Card>
      ) : null}

      {/* Contactos del cliente */}
      {client.contacts.length > 0 ? (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base">Contactos del cliente</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {client.contacts.map((c, i) => (
                <li key={i} className="rounded-md border bg-card/50 p-3">
                  <div className="flex items-center gap-2 font-medium">
                    {c.name}
                    {c.is_primary ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Principal
                      </Badge>
                    ) : null}
                  </div>
                  {c.role ? (
                    <div className="text-xs text-muted-foreground">{c.role}</div>
                  ) : null}
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {c.email ? (
                      <a
                        href={`mailto:${c.email}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Mail className="h-3 w-3" /> {c.email}
                      </a>
                    ) : null}
                    {c.phone ? (
                      <a
                        href={`tel:${c.phone}`}
                        className="flex items-center gap-1 text-primary hover:underline"
                      >
                        <Phone className="h-3 w-3" /> {c.phone}
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <p className="mt-6 text-center text-xs text-muted-foreground">
        Este link puede ser revocado o expirar. Si necesitas acceso permanente,
        contacta a tu KAM.
      </p>
    </main>
  );
}

function Kpi({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string | null;
  tone?: "default" | "warn";
}) {
  return (
    <div className="rounded-md border bg-card/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div
        className={`mt-0.5 text-lg font-semibold ${
          tone === "warn" ? "text-amber-600 dark:text-amber-500" : ""
        }`}
      >
        {value}
      </div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

function ContractCard({ contract: c }: { contract: SharedContract }) {
  const statusToneMap: Record<string, "ok" | "info" | "muted"> = {
    firmado: "ok",
    en_proceso: "info",
    finalizado: "muted",
    borrador: "muted",
    por_revisar: "info",
  };
  const tone = statusToneMap[c.status] ?? "muted";

  return (
    <div className="rounded-lg border bg-card/30 p-4 space-y-3">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold">{c.number}</span>
          <Badge
            variant={tone === "ok" ? "default" : "outline"}
            className="text-[10px]"
          >
            {c.status.replace(/_/g, " ")}
          </Badge>
          {c.condition ? (
            <span className="text-xs text-muted-foreground">
              {c.condition.replace(/_/g, " ")}
            </span>
          ) : null}
        </div>
        <div className="text-right">
          <div className="text-sm font-semibold">
            {c.total_neto !== null ? fmtMoney(c.total_neto, c.currency) : "—"}
          </div>
          {c.total_neto_usd !== null && c.currency !== "USD" ? (
            <div className="text-xs text-muted-foreground">
              ≈ {fmtUsd(c.total_neto_usd)}
            </div>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {c.signed_at ? (
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" /> Firmado {fmtDate(c.signed_at)}
          </span>
        ) : null}
        {c.incoterm ? <span>Incoterm: {c.incoterm}</span> : null}
        {c.sale_type ? <span>Tipo: {c.sale_type.replace(/_/g, " ")}</span> : null}
      </div>

      {/* Items */}
      {c.items.length > 0 ? (
        <div className="rounded-md border bg-background/50 p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Sprout className="h-3 w-3" /> Variedades y entregas
          </div>
          <ul className="divide-y divide-border/60">
            {c.items.map((it, i) => (
              <li key={i} className="py-2 text-sm flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{it.variety_name ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">
                    {it.species_name ? `${it.species_name} · ` : ""}
                    {it.format ?? ""}
                    {it.material_type ? ` · ${it.material_type.replace(/_/g, " ")}` : ""}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-semibold">{fmtNumber(it.qty_plants)} plantas</div>
                  {it.qty_pending > 0 && it.qty_pending !== it.qty_plants ? (
                    <div className="text-muted-foreground">
                      {fmtNumber(it.qty_pending)} pendientes
                    </div>
                  ) : null}
                  <div className="text-muted-foreground">
                    {fmtDeliveryWindow(it)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Payments */}
      {c.payments.length > 0 ? (
        <div className="rounded-md border bg-background/50 p-3 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">Pagos</div>
          <ul className="divide-y divide-border/60">
            {c.payments.map((p, i) => {
              const badge = paymentStatusBadge(p.status);
              return (
                <li key={i} className="py-2 text-sm flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <div className="font-medium">{paymentTypeLabel(p.type)}</div>
                    {p.due_date ? (
                      <div className="text-xs text-muted-foreground">
                        Vence {fmtDate(p.due_date)}
                        {p.paid_at ? ` · pagado ${fmtDate(p.paid_at)}` : ""}
                      </div>
                    ) : null}
                    {p.reference ? (
                      <div className="text-xs text-muted-foreground">
                        Ref: {p.reference}
                      </div>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">
                      {fmtMoney(p.amount, p.currency)}
                    </div>
                    <Badge
                      variant={
                        badge.tone === "ok"
                          ? "default"
                          : badge.tone === "bad"
                            ? "destructive"
                            : "outline"
                      }
                      className="text-[10px]"
                    >
                      {badge.label}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
