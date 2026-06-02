"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Undo2, XCircle } from "lucide-react";

import type { Database } from "@/lib/database.types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { transitionContractStatus } from "@/lib/actions/contratos";

type ContractStatus = Database["public"]["Enums"]["contract_status"];

const ORDER: ContractStatus[] = [
  "borrador",
  "firmado",
  "en_proceso",
  "finalizado",
];

const LABELS: Record<ContractStatus, string> = {
  borrador: "Borrador",
  // por_revisar descontinuado — se mantiene la label por compatibilidad con
  // datos antiguos pero no aparece en el flujo de estados.
  por_revisar: "Borrador",
  firmado: "Firmado",
  en_proceso: "En proceso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

const NEXT: Partial<Record<ContractStatus, ContractStatus>> = {
  borrador: "firmado",
  por_revisar: "firmado", // contratos legacy en por_revisar pasan directo a firmado
  firmado: "en_proceso",
  en_proceso: "finalizado",
};

// Paso hacia atrás del flujo — permite corregir un avance prematuro.
const PREV: Partial<Record<ContractStatus, ContractStatus>> = {
  firmado: "borrador",
  en_proceso: "firmado",
  finalizado: "en_proceso",
};

type Props = {
  contractId: string;
  status: ContractStatus;
};

export function ContratoStatusBar({ contractId, status }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const isCanceled = status === "cancelado";
  const isFinal = status === "finalizado" || status === "cancelado";

  const handleAdvance = (target: ContractStatus) => {
    startTransition(async () => {
      try {
        await transitionContractStatus(contractId, target);
        toast.success(`Contrato actualizado a ${LABELS[target]}`);
        router.refresh();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Error";
        toast.error(message);
      }
    });
  };

  const nextStatus = NEXT[status];
  const prevStatus = PREV[status];

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <ol className="flex items-stretch overflow-x-auto">
        {ORDER.map((s, i) => {
          const currentIndex = ORDER.indexOf(status);
          const state: "done" | "current" | "pending" | "skipped" = isCanceled
            ? "skipped"
            : i < currentIndex
              ? "done"
              : i === currentIndex
                ? "current"
                : "pending";
          return (
            <li
              key={s}
              className={cn(
                "relative flex h-8 items-center px-3 text-xs font-medium select-none",
                i === 0 ? "rounded-l-md" : "-ml-2",
                i === ORDER.length - 1 ? "rounded-r-md pr-4" : "",
                state === "current" && "bg-primary text-primary-foreground",
                state === "done" && "bg-primary/15 text-primary",
                state === "pending" && "bg-muted text-muted-foreground",
                state === "skipped" && "bg-muted/40 text-muted-foreground/70",
              )}
              style={
                i === ORDER.length - 1
                  ? undefined
                  : {
                      clipPath:
                        i === 0
                          ? "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%)"
                          : "polygon(0 0, calc(100% - 8px) 0, 100% 50%, calc(100% - 8px) 100%, 0 100%, 8px 50%)",
                    }
              }
            >
              {state === "done" ? (
                <Check className="mr-1 h-3.5 w-3.5" />
              ) : null}
              <span className="whitespace-nowrap">{LABELS[s]}</span>
            </li>
          );
        })}
        {isCanceled ? (
          <li className="ml-2 flex h-8 items-center rounded-md bg-destructive/10 px-3 text-xs font-medium text-destructive">
            <XCircle className="mr-1 h-3.5 w-3.5" />
            Cancelado
          </li>
        ) : null}
      </ol>

      <div className="flex flex-wrap items-center gap-2">
        {/* Avanzar — solo si el contrato no está en un estado terminal. */}
        {!isFinal && nextStatus ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => handleAdvance(nextStatus)}
          >
            <Check className="h-3.5 w-3.5" />
            Marcar como {LABELS[nextStatus]}
          </Button>
        ) : null}

        {/* Retroceder — disponible en cualquier estado con paso anterior,
            incluido finalizado (vuelve a en_proceso). */}
        {prevStatus ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => handleAdvance(prevStatus)}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Volver a {LABELS[prevStatus]}
          </Button>
        ) : null}

        {/* Cancelar — solo desde estados activos. */}
        {!isFinal ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (
                window.confirm(
                  "¿Cancelar el contrato? Esta acción mueve el contrato a 'cancelado'.",
                )
              ) {
                handleAdvance("cancelado");
              }
            }}
          >
            <XCircle className="h-3.5 w-3.5" />
            Cancelar contrato
          </Button>
        ) : null}

        {/* Reactivar — deshace una cancelación, vuelve a borrador. */}
        {isCanceled ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => handleAdvance("borrador")}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Reactivar contrato
          </Button>
        ) : null}
      </div>
    </div>
  );
}
