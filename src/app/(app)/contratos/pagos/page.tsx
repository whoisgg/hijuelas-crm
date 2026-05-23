import Link from "next/link";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listPendingPayments } from "@/lib/actions/pagos";
import {
  PaymentStatusBadge,
  PAYMENT_TYPE_LABEL,
} from "@/components/contratos/status-badge";
import { formatDate, formatMoney } from "@/components/contratos/format";
import type { Database } from "@/lib/database.types";
import { ChevronLeft } from "lucide-react";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];
type PaymentStatus = Database["public"]["Enums"]["payment_status"];
type PaymentType = Database["public"]["Enums"]["payment_type"];

export const metadata = { title: "Pagos pendientes" };

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
  contract_id: string;
  contract: unknown;
};

function pickOne<T>(v: unknown): T | null {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return v as T;
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams?: Promise<{ overdue?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const overdue = sp.overdue === "true";

  const raw = (await listPendingPayments({ overdue })) as unknown as RawPayment[];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <AppShell>
      <PageHeader
        title="Pagos pendientes"
        description={
          overdue
            ? "Pagos cuya fecha de vencimiento ya pasó."
            : "Todos los pagos en estado pendiente, ordenados por vencimiento."
        }
        badge="Sprint 4"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" render={<Link href="/contratos" />}>
              <ChevronLeft className="h-4 w-4" />
              Volver
            </Button>
            <Button
              variant={overdue ? "default" : "outline"}
              size="sm"
              render={<Link href="/contratos/pagos?overdue=true" />}
            >
              Solo vencidos
            </Button>
            <Button
              variant={!overdue ? "default" : "outline"}
              size="sm"
              render={<Link href="/contratos/pagos" />}
            >
              Todos
            </Button>
          </div>
        }
      />

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Contrato</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Monto</TableHead>
              <TableHead>Vencimiento</TableHead>
              <TableHead>Días</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {raw.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  className="py-8 text-center text-muted-foreground"
                >
                  Sin pagos pendientes.
                </TableCell>
              </TableRow>
            ) : (
              raw.map((p) => {
                const contract = pickOne<{
                  id: string;
                  number: string;
                  client: unknown;
                }>(p.contract);
                const client = contract
                  ? pickOne<{ id: string; name: string }>(contract.client)
                  : null;
                let daysDelta: number | null = null;
                if (p.due_date) {
                  daysDelta = Math.round(
                    (new Date(p.due_date).getTime() -
                      new Date(today).getTime()) /
                      86400000,
                  );
                }
                const isLate = daysDelta !== null && daysDelta < 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-mono text-xs">
                      {contract ? (
                        <Link
                          href={`/contratos/${contract.id}?tab=pagos`}
                          className="hover:underline"
                        >
                          {contract.number}
                        </Link>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>{client?.name ?? "—"}</TableCell>
                    <TableCell>{PAYMENT_TYPE_LABEL[p.type]}</TableCell>
                    <TableCell>
                      <PaymentStatusBadge status={p.status} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(Number(p.amount), p.currency)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(p.due_date)}
                    </TableCell>
                    <TableCell
                      className={
                        isLate
                          ? "text-destructive"
                          : "text-muted-foreground"
                      }
                    >
                      {daysDelta !== null
                        ? daysDelta === 0
                          ? "hoy"
                          : daysDelta > 0
                            ? `+${daysDelta}d`
                            : `${daysDelta}d`
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </AppShell>
  );
}
