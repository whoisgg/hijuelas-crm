import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { getContract, listVarietiesForSelect } from "@/lib/actions/contratos";
import { listAttachments } from "@/lib/actions/attachments";
import { ContractStatusBadge } from "@/components/contratos/status-badge";
import { ContratoStatusBar } from "@/components/contratos/contrato-status-bar";
import { ContratoTabs } from "@/components/contratos/contrato-tabs";
import { ContratoModifyDialog } from "@/components/contratos/contrato-modify-dialog";
import { formatMoney, formatDate } from "@/components/contratos/format";
import type {
  ContractItemRow,
  ContractPayment,
  ContractAmendment,
  ContractVersion,
} from "@/components/contratos/types";
import type { Database, Json } from "@/lib/database.types";

type ContractStatus = Database["public"]["Enums"]["contract_status"];
type CurrencyCode = Database["public"]["Enums"]["currency_code"];
type PaymentStatus = Database["public"]["Enums"]["payment_status"];
type PaymentType = Database["public"]["Enums"]["payment_type"];
type AmendmentType = Database["public"]["Enums"]["amendment_type"];
type MaterialType = Database["public"]["Enums"]["material_type"];
type DeliveryStatus = Database["public"]["Enums"]["delivery_status"];

type RawContract = {
  id: string;
  number: string;
  status: ContractStatus;
  currency: CurrencyCode;
  total_neto: number | string;
  total_iva: number | string;
  total_neto_usd: number | string;
  signed_at: string | null;
  created_at: string;
  notes: string | null;
  incoterm: string | null;
  client: unknown;
  organization: unknown;
  items: unknown;
  payments: unknown;
  amendments: unknown;
  versions: unknown;
};

function pickOne<T>(v: unknown): T | null {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return v as T;
}

type RawItem = {
  id: string;
  variety_id: string;
  qty_plants: number;
  qty_delivered: number;
  unit_price: number;
  currency: CurrencyCode;
  delivery_year: number;
  delivery_week: number;
  format: string | null;
  material_type: MaterialType | null;
  status: DeliveryStatus;
  notes: string | null;
  variety: unknown;
};

type RawPayment = {
  id: string;
  type: PaymentType;
  amount: number;
  iva: number;
  currency: CurrencyCode;
  status: PaymentStatus;
  due_date: string | null;
  paid_at: string | null;
  reference: string | null;
};

type RawAmendment = {
  id: string;
  type: AmendmentType;
  reason: string | null;
  diff_json: Json | null;
  applied_at: string;
  created_by: string | null;
  created_at: string;
};

type RawVersion = {
  id: string;
  version_n: number;
  pdf_url: string | null;
  frozen_at: string;
  created_at: string;
};

export const metadata = { title: "Contrato" };

// Computa la fecha aproximada del lunes ISO de la última semana/año de entrega
// del contrato. Usado para sugerir el due_date de pagos saldo.
function lastDeliveryDate(items: ContractItemRow[]): string | null {
  let bestYear = -Infinity;
  let bestWeek = -Infinity;
  for (const it of items) {
    if (it.delivery_year == null || it.delivery_week == null) continue;
    if (
      it.delivery_year > bestYear ||
      (it.delivery_year === bestYear && it.delivery_week > bestWeek)
    ) {
      bestYear = it.delivery_year;
      bestWeek = it.delivery_week;
    }
  }
  if (bestYear === -Infinity) return null;
  // ISO week → Monday date
  const jan4 = new Date(Date.UTC(bestYear, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  const monday = new Date(week1Monday);
  monday.setUTCDate(week1Monday.getUTCDate() + (bestWeek - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

export default async function ContratoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let contract: RawContract | null = null;
  try {
    contract = (await getContract(id)) as unknown as RawContract;
  } catch {
    notFound();
  }
  if (!contract) notFound();

  const [varieties, attachments] = await Promise.all([
    listVarietiesForSelect(),
    listAttachments("contract", id),
  ]);

  const client = pickOne<{
    id: string;
    name: string;
    tax_id: string | null;
  }>(contract.client);
  const organization = pickOne<{
    id: string;
    name: string;
    contract_prefix: string;
  }>(contract.organization);

  const rawItems = Array.isArray(contract.items)
    ? (contract.items as RawItem[])
    : [];
  const items: ContractItemRow[] = rawItems.map((it) => {
    const variety = pickOne<{ id: string; name: string }>(it.variety);
    return {
      id: it.id,
      variety_id: it.variety_id,
      variety_name: variety?.name ?? null,
      qty_plants: Number(it.qty_plants),
      qty_delivered: Number(it.qty_delivered),
      unit_price: Number(it.unit_price),
      currency: it.currency,
      delivery_year: it.delivery_year,
      delivery_week: it.delivery_week,
      format: it.format,
      material_type: it.material_type,
      status: it.status,
      notes: it.notes,
    };
  });

  const rawPayments = Array.isArray(contract.payments)
    ? (contract.payments as RawPayment[])
    : [];
  const payments: ContractPayment[] = rawPayments.map((p) => ({
    id: p.id,
    type: p.type,
    amount: Number(p.amount),
    iva: Number(p.iva),
    currency: p.currency,
    status: p.status,
    due_date: p.due_date,
    paid_at: p.paid_at,
    reference: p.reference,
  }));

  const rawAmendments = Array.isArray(contract.amendments)
    ? (contract.amendments as RawAmendment[])
    : [];
  const amendments: ContractAmendment[] = rawAmendments.map((a) => ({
    id: a.id,
    type: a.type,
    reason: a.reason,
    diff_json: a.diff_json,
    applied_at: a.applied_at,
    created_by: a.created_by,
    created_at: a.created_at,
  }));

  const rawVersions = Array.isArray(contract.versions)
    ? (contract.versions as RawVersion[])
    : [];
  const versions: ContractVersion[] = rawVersions.map((v) => ({
    id: v.id,
    version_n: v.version_n,
    pdf_url: v.pdf_url,
    frozen_at: v.frozen_at,
    created_at: v.created_at,
  }));

  const totalNeto = Number(contract.total_neto);
  const totalIva = Number(contract.total_iva);
  const totalNetoUsd = Number(contract.total_neto_usd);

  return (
    <AppShell>
      <PageHeader
        title={`Contrato ${contract.number}`}
        description={
          client
            ? `${client.name}${organization ? ` · ${organization.name}` : ""}`
            : organization?.name
        }
        badge="Sprint 3"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" render={<Link href="/contratos" />}>
              <ChevronLeft className="h-4 w-4" />
              Volver
            </Button>
            <ContratoModifyDialog
              contractId={contract.id}
              contractCurrency={contract.currency}
              items={items}
              varieties={varieties}
            />
          </div>
        }
      />

      {/* TODO: replace with <HighlightsPanel /> design-system component */}
      <div className="grid gap-3 rounded-xl border bg-card p-4 md:grid-cols-6">
        <div className="md:col-span-2">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Número
          </p>
          <p className="font-mono font-semibold">{contract.number}</p>
        </div>
        <div className="md:col-span-2">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Cliente
          </p>
          <p className="font-medium">
            {client ? (
              <Link
                href={`/clientes/${client.id}`}
                className="hover:underline"
              >
                {client.name}
              </Link>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="md:col-span-2">
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Organización
          </p>
          <p className="text-sm">{organization?.name ?? "—"}</p>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Estado
          </p>
          <ContractStatusBadge status={contract.status} />
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Firma
          </p>
          <p className="text-sm text-muted-foreground">
            {formatDate(contract.signed_at)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Total neto
          </p>
          <p className="text-sm font-semibold">
            {formatMoney(totalNeto, contract.currency)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            IVA
          </p>
          <p className="text-sm">
            {formatMoney(totalIva, contract.currency)}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Total USD
          </p>
          <p className="text-sm font-semibold">
            {formatMoney(totalNetoUsd, "USD")}
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Incoterm
          </p>
          <p className="text-sm text-muted-foreground">
            {contract.incoterm ?? "—"}
          </p>
        </div>
      </div>

      {/* TODO: replace with <PathStepper /> from @/components/design-system */}
      <ContratoStatusBar contractId={contract.id} status={contract.status} />

      <ContratoTabs
        contractId={contract.id}
        contractCurrency={contract.currency}
        items={items}
        payments={payments}
        amendments={amendments}
        versions={versions}
        varieties={varieties}
        attachments={attachments}
        lastDeliveryDate={lastDeliveryDate(items)}
      />
    </AppShell>
  );
}
