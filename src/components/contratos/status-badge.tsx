import type { Database } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

type ContractStatus = Database["public"]["Enums"]["contract_status"];

const STATUS_META: Record<
  ContractStatus,
  { label: string; className: string }
> = {
  borrador: {
    label: "Borrador",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  por_revisar: {
    label: "Por revisar",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  firmado: {
    label: "Firmado",
    className: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  en_proceso: {
    label: "En proceso",
    className: "bg-primary/10 text-primary",
  },
  finalizado: {
    label: "Finalizado",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  cancelado: {
    label: "Cancelado",
    className: "bg-destructive/10 text-destructive",
  },
};

export function ContractStatusBadge({ status }: { status: ContractStatus }) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("h-5", meta.className)}>
      {meta.label}
    </Badge>
  );
}

type PaymentStatus = Database["public"]["Enums"]["payment_status"];

const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { label: string; className: string }
> = {
  pendiente: {
    label: "Pendiente",
    className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  pagado: {
    label: "Pagado",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  vencido: {
    label: "Vencido",
    className: "bg-destructive/10 text-destructive",
  },
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  const meta = PAYMENT_STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("h-5", meta.className)}>
      {meta.label}
    </Badge>
  );
}

type DeliveryStatus = Database["public"]["Enums"]["delivery_status"];

const DELIVERY_STATUS_META: Record<
  DeliveryStatus,
  { label: string; className: string }
> = {
  pendiente: {
    label: "Pendiente",
    className: "bg-muted text-muted-foreground border-transparent",
  },
  en_proceso: {
    label: "En proceso",
    className: "bg-primary/10 text-primary",
  },
  finalizado: {
    label: "Finalizado",
    className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  eliminado: {
    label: "Eliminado",
    className: "bg-destructive/10 text-destructive",
  },
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const meta = DELIVERY_STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("h-5", meta.className)}>
      {meta.label}
    </Badge>
  );
}

export const PAYMENT_TYPE_LABEL: Record<
  Database["public"]["Enums"]["payment_type"],
  string
> = {
  anticipo_1: "Anticipo 1",
  anticipo_2: "Anticipo 2",
  saldo: "Saldo",
};

export const AMENDMENT_TYPE_LABEL: Record<
  Database["public"]["Enums"]["amendment_type"],
  string
> = {
  add: "Agregar item",
  modify: "Modificar item",
  withdraw: "Desistir item",
};
