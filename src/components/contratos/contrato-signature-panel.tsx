"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  FileSignature,
  Send,
  RefreshCw,
  XCircle,
  Download,
  ShieldCheck,
  Clock,
  Eye,
  Ban,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/database.types";
import type { SignatureView } from "@/lib/actions/signatures";
import {
  sendContractForSignature,
  refreshEnvelopeStatus,
  voidContractEnvelope,
} from "@/lib/actions/signatures";

type ContractStatus = Database["public"]["Enums"]["contract_status"];

type Props = {
  contractId: string;
  contractStatus: ContractStatus;
  ready: boolean;
  signature: SignatureView | null;
};

const STATUS_META: Record<
  string,
  { label: string; className: string; icon: React.ElementType }
> = {
  created: { label: "Creado", className: "bg-muted text-muted-foreground", icon: Clock },
  sent: { label: "Enviado", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300", icon: Send },
  delivered: { label: "Visto por el cliente", className: "bg-amber-500/15 text-amber-700 dark:text-amber-300", icon: Eye },
  completed: { label: "Firmado", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", icon: ShieldCheck },
  declined: { label: "Rechazado", className: "bg-destructive/10 text-destructive", icon: XCircle },
  voided: { label: "Anulado", className: "bg-muted text-muted-foreground", icon: Ban },
};

function fmt(ts: string | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

export function ContratoSignaturePanel({
  contractId,
  contractStatus,
  ready,
  signature,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const sig = signature;
  const meta = sig ? (STATUS_META[sig.status] ?? STATUS_META.created) : null;
  const StatusIcon = meta?.icon ?? Clock;

  // Se puede enviar a firmar solo desde un estado previo a firmado y sin sobre vivo.
  const sendable =
    (contractStatus === "borrador" || contractStatus === "por_revisar") &&
    (!sig || sig.status === "declined" || sig.status === "voided");
  const canVoid =
    sig && (sig.status === "sent" || sig.status === "delivered" || sig.status === "created");

  const run = (
    fn: () => Promise<{ ok: boolean; message?: string }>,
    okMsg: string,
  ) => {
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        router.refresh();
      } else {
        toast.error(res.message ?? "Error");
      }
    });
  };

  const handleSend = () =>
    run(
      async () => {
        const r = await sendContractForSignature(contractId);
        return r.ok ? { ok: true } : { ok: false, message: r.message };
      },
      "Contrato enviado a firmar",
    );

  const handleRefresh = () =>
    run(() => refreshEnvelopeStatus(contractId), "Estado actualizado");

  const handleVoid = () => {
    const reason = window.prompt("Motivo de la anulación:", "Anulado desde el CRM");
    if (reason === null) return;
    run(() => voidContractEnvelope(contractId, reason), "Sobre anulado");
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FileSignature className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Firma electrónica</h3>
          <span className="text-xs text-muted-foreground">DocuSign</span>
        </div>
        {sig && meta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
              meta.className,
            )}
          >
            <StatusIcon className="h-3.5 w-3.5" />
            {meta.label}
          </span>
        ) : null}
      </div>

      {!ready ? (
        <p className="text-xs text-muted-foreground">
          DocuSign no está configurado todavía. Cargá las variables{" "}
          <code className="rounded bg-muted px-1">DOCUSIGN_*</code> en{" "}
          <code className="rounded bg-muted px-1">.env.local</code> / Vercel para
          habilitar el envío a firma. Ver{" "}
          <code className="rounded bg-muted px-1">docs/docusign-integration-plan.md</code>.
        </p>
      ) : null}

      {sig ? (
        <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
          <span>
            Firmante:{" "}
            <span className="text-foreground">{sig.signer_email}</span>
          </span>
          <span>Enviado: {fmt(sig.sent_at)}</span>
          {sig.delivered_at ? <span>Visto: {fmt(sig.delivered_at)}</span> : null}
          {sig.completed_at ? (
            <span>Firmado: {fmt(sig.completed_at)}</span>
          ) : null}
          {sig.declined_reason ? (
            <span className="text-destructive sm:col-span-2">
              Motivo: {sig.declined_reason}
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Aún no se ha enviado este contrato a firmar.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {sendable ? (
          <Button size="sm" disabled={pending || !ready} onClick={handleSend}>
            <Send className="h-3.5 w-3.5" />
            Enviar a firmar
          </Button>
        ) : null}

        {sig && sig.status !== "voided" && sig.status !== "declined" ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !ready}
            onClick={handleRefresh}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refrescar estado
          </Button>
        ) : null}

        {canVoid ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pending || !ready}
            onClick={handleVoid}
          >
            <Ban className="h-3.5 w-3.5" />
            Anular envío
          </Button>
        ) : null}

        {sig?.signed_pdf_download_url ? (
          <Button
            variant="outline"
            size="sm"
            render={
              <a
                href={sig.signed_pdf_download_url}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <Download className="h-3.5 w-3.5" />
            PDF firmado
          </Button>
        ) : null}

        {sig?.certificate_download_url ? (
          <Button
            variant="ghost"
            size="sm"
            render={
              <a
                href={sig.certificate_download_url}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <Download className="h-3.5 w-3.5" />
            Certificado
          </Button>
        ) : null}
      </div>
    </div>
  );
}
