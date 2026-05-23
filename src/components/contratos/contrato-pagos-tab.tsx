"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaymentStatusBadge, PAYMENT_TYPE_LABEL } from "@/components/contratos/status-badge";
import { formatMoney, formatDate } from "@/components/contratos/format";
import { createPayment, deletePayment, markPaymentPaid } from "@/lib/actions/pagos";
import type { ContractPayment } from "@/components/contratos/types";
import type { Database } from "@/lib/database.types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];
type PaymentType = Database["public"]["Enums"]["payment_type"];

type Props = {
  contractId: string;
  payments: ContractPayment[];
  contractCurrency?: CurrencyCode;
  lastDeliveryDate: string | null;
};

const ORDER: Record<PaymentType, number> = {
  anticipo_1: 0,
  anticipo_2: 1,
  saldo: 2,
};

const CURRENCY_OPTIONS: CurrencyCode[] = ["CLP", "USD", "EUR"];

export function ContractPagosTab({
  contractId,
  payments,
  contractCurrency,
  lastDeliveryDate,
}: Props) {
  const sorted = React.useMemo(
    () => [...payments].sort((a, b) => ORDER[a.type] - ORDER[b.type]),
    [payments],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {sorted.length === 0
            ? "Sin pagos. Agregá el primero abajo."
            : `${sorted.length} pago${sorted.length === 1 ? "" : "s"}`}
        </p>
        <AddPaymentDialog
          contractId={contractId}
          contractCurrency={contractCurrency ?? "USD"}
          lastDeliveryDate={lastDeliveryDate}
        />
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-card py-10 text-center text-sm text-muted-foreground">
          Aún no hay pagos. Usá &ldquo;Agregar pago&rdquo; para crear anticipos
          o saldo.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          {sorted.map((p) => (
            <PaymentCard key={p.id} payment={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function AddPaymentDialog({
  contractId,
  contractCurrency,
  lastDeliveryDate,
}: {
  contractId: string;
  contractCurrency: CurrencyCode;
  lastDeliveryDate: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [type, setType] = React.useState<PaymentType>("saldo");
  const [amount, setAmount] = React.useState<string>("");
  const [currency, setCurrency] = React.useState<CurrencyCode>(contractCurrency);
  const [dueDate, setDueDate] = React.useState<string>(lastDeliveryDate ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  // Cuando se abre, resetea con defaults frescos basados en el contrato.
  React.useEffect(() => {
    if (open) {
      setCurrency(contractCurrency);
      setDueDate(lastDeliveryDate ?? "");
    }
  }, [open, contractCurrency, lastDeliveryDate]);

  const handleCreate = async () => {
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Monto inválido");
      return;
    }
    setSubmitting(true);
    try {
      await createPayment({
        contractId,
        type,
        amount: amt,
        currency,
        dueDate: dueDate || null,
      });
      toast.success("Pago creado");
      setOpen(false);
      setAmount("");
      setType("saldo");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="h-3.5 w-3.5" />
            Agregar pago
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo pago</DialogTitle>
          <DialogDescription>
            El vencimiento por default es la última fecha de entrega del
            contrato. Editalo si corresponde.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="payment-type">Tipo</Label>
            <Select
              value={type}
              onValueChange={(v) => setType(v as PaymentType)}
            >
              <SelectTrigger id="payment-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="anticipo_1">Anticipo 1</SelectItem>
                <SelectItem value="anticipo_2">Anticipo 2</SelectItem>
                <SelectItem value="saldo">Saldo (entrega)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="payment-amount">Monto</Label>
              <Input
                id="payment-amount"
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="payment-currency">Moneda</Label>
              <Select
                value={currency}
                onValueChange={(v) => setCurrency(v as CurrencyCode)}
              >
                <SelectTrigger id="payment-currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="payment-due">
              Vence
              {lastDeliveryDate ? (
                <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                  (última entrega: {formatDate(lastDeliveryDate)})
                </span>
              ) : null}
            </Label>
            <Input
              id="payment-due"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancelar
          </Button>
          <Button onClick={handleCreate} disabled={submitting}>
            {submitting ? "Creando..." : "Crear pago"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentCard({ payment }: { payment: ContractPayment }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [paidAt, setPaidAt] = React.useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [reference, setReference] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);

  const handleMarkPaid = async () => {
    setSubmitting(true);
    try {
      await markPaymentPaid(payment.id, {
        paidAt: new Date(paidAt).toISOString(),
        reference: reference || null,
      });
      toast.success("Pago marcado como pagado");
      setOpen(false);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`¿Borrar este pago (${PAYMENT_TYPE_LABEL[payment.type]})?`)) {
      return;
    }
    setDeleting(true);
    try {
      await deletePayment(payment.id);
      toast.success("Pago borrado");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">{PAYMENT_TYPE_LABEL[payment.type]}</p>
          <p className="text-xs text-muted-foreground">
            Vence {formatDate(payment.due_date)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <PaymentStatusBadge status={payment.status} />
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={deleting}
            onClick={handleDelete}
            aria-label="Borrar pago"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div>
        <p className="text-lg font-semibold tabular-nums">
          {formatMoney(payment.amount, payment.currency)}
        </p>
        {payment.iva > 0 ? (
          <p className="text-xs text-muted-foreground tabular-nums">
            + IVA {formatMoney(payment.iva, payment.currency)}
          </p>
        ) : null}
      </div>
      {payment.paid_at ? (
        <p className="text-xs text-muted-foreground">
          Pagado {formatDate(payment.paid_at)}
          {payment.reference ? ` · Ref: ${payment.reference}` : ""}
        </p>
      ) : null}
      {payment.status !== "pagado" ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button size="sm" variant="outline" className="mt-1 self-start">
                <Check className="h-3.5 w-3.5" />
                Marcar como pagado
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                Marcar {PAYMENT_TYPE_LABEL[payment.type]} como pagado
              </DialogTitle>
              <DialogDescription>
                Registra fecha de pago y referencia bancaria si aplica.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="paidAt">Fecha de pago</Label>
                <Input
                  id="paidAt"
                  type="date"
                  value={paidAt}
                  onChange={(e) => setPaidAt(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reference">Referencia (opcional)</Label>
                <Input
                  id="reference"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Transf. #12345 / Cheque..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button onClick={handleMarkPaid} disabled={submitting}>
                {submitting ? "Guardando..." : "Confirmar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
