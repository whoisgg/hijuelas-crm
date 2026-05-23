"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";

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
import { PaymentStatusBadge, PAYMENT_TYPE_LABEL } from "@/components/contratos/status-badge";
import { formatMoney, formatDate } from "@/components/contratos/format";
import { markPaymentPaid } from "@/lib/actions/pagos";
import type { ContractPayment } from "@/components/contratos/types";

type Props = {
  payments: ContractPayment[];
};

const ORDER: Record<string, number> = {
  anticipo_1: 0,
  anticipo_2: 1,
  saldo: 2,
};

export function ContractPagosTab({ payments }: Props) {
  const sorted = React.useMemo(
    () => [...payments].sort((a, b) => ORDER[a.type] - ORDER[b.type]),
    [payments],
  );

  if (sorted.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
        No hay pagos configurados.
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-3">
      {sorted.map((p) => (
        <PaymentCard key={p.id} payment={p} />
      ))}
    </div>
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

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium">{PAYMENT_TYPE_LABEL[payment.type]}</p>
          <p className="text-xs text-muted-foreground">
            Vence {formatDate(payment.due_date)}
          </p>
        </div>
        <PaymentStatusBadge status={payment.status} />
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
