"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Pencil, Trash2 } from "lucide-react";

import { deleteContract } from "@/lib/actions/contratos";

type Props = {
  contractId: string;
  contractNumber: string;
};

/**
 * 3 icon buttons monocromáticos para filas de tabla de contratos.
 * Download → tab Adjuntos · Edit → detalle · Delete → soft-delete con confirm.
 */
export function ContractRowActions({ contractId, contractNumber }: Props) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (
      !window.confirm(
        `¿Borrar el contrato ${contractNumber}? Se oculta de listas y reportes.`,
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      await deleteContract(contractId);
      toast.success(`${contractNumber} borrado`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-0.5">
      <Link
        href={`/contratos/${contractId}#adjuntos`}
        title="Descargar adjuntos"
        aria-label="Descargar adjuntos"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <Download className="h-3.5 w-3.5" />
      </Link>
      <Link
        href={`/contratos/${contractId}`}
        title="Editar contrato"
        aria-label="Editar contrato"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Link>
      <button
        type="button"
        title="Borrar contrato"
        aria-label="Borrar contrato"
        disabled={busy}
        onClick={handleDelete}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
