import { createHash } from "node:crypto";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

import { canSign, getAuthExtra, supabaseAnonClient } from "./auth";
import { isDocusignConfigured } from "@/lib/docusign/config";
import {
  createEnvelope,
  voidEnvelope,
  type EnvelopeSigner,
} from "@/lib/docusign/client";
import {
  generateContractPdf,
  type ContractPdfData,
  type ContractPdfItem,
  type ContractPdfPayment,
} from "@/lib/contract-pdf";
import { sellerProfileFor } from "@/lib/contract-templates/frambuesa-legal";

type ToolHandler = Parameters<McpServer["registerTool"]>[2];
type ToolExtra = { authInfo?: AuthInfo };

function jsonContent(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}
function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true as const };
}

async function rpc<T = unknown>(
  fnName: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const supabase = supabaseAnonClient();
  return (
    supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: T | null; error: { message: string } | null }>
  )(fnName, args);
}

type ContractBundle = {
  number: string;
  status: string;
  currency: string;
  total_neto: number | string;
  total_iva: number | string;
  total_neto_usd: number | string;
  signed_at: string | null;
  client_name: string | null;
  client_legal_name: string | null;
  client_tax_id: string | null;
  client_giro: string | null;
  client_region: string | null;
  org_name: string | null;
  org_legal_name: string | null;
  org_tax_id: string | null;
  items: {
    variety_name: string | null;
    species_name: string | null;
    qty_plants: number | string;
    unit_price: number | string;
    currency: string;
    delivery_year: number | null;
    delivery_week: number | null;
  }[];
  payments: {
    type: string;
    amount: number | string;
    currency: string;
    due_date: string | null;
  }[];
  buyer: {
    email: string | null;
    representative_name: string | null;
    domicile: string | null;
  } | null;
};

export function registerSignatureTools(server: McpServer): void {
  // ---- Enviar a firmar ----------------------------------------------------
  server.registerTool(
    "send_for_signature",
    {
      title: "Enviar contrato a firmar (DocuSign)",
      description:
        "Genera el PDF legal del contrato y lo envía a firmar por DocuSign al contacto principal del cliente. Requiere rol sales o admin. El contrato debe estar en borrador y el cliente tener un contacto con email.",
      inputSchema: {
        contract_id: z.string().uuid(),
      },
    },
    (async (args: { contract_id: string }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return errorContent("No autenticado.");
      if (!canSign(auth.role))
        return errorContent(`Rol "${auth.role}" no autorizado a enviar a firmar.`);
      if (!isDocusignConfigured())
        return errorContent("DocuSign no está configurado (faltan env vars DOCUSIGN_*).");

      const { data, error } = await rpc<ContractBundle>("mcp_contract_for_signature", {
        p_user_id: auth.userId,
        p_contract_id: args.contract_id,
      });
      if (error) return errorContent(error.message);
      if (!data) return errorContent("Contrato no encontrado.");
      const c = data;

      if (c.status === "firmado" || c.status === "finalizado")
        return errorContent(`El contrato ya está ${c.status}.`);
      const buyerEmail = c.buyer?.email;
      if (!buyerEmail || !buyerEmail.includes("@"))
        return errorContent(
          "El cliente no tiene un contacto con email. Agregá uno antes de enviar a firmar.",
        );
      const buyerRep = c.buyer?.representative_name ?? "Comprador";

      const seller = sellerProfileFor(c.org_tax_id, c.org_legal_name ?? c.org_name);

      const items: ContractPdfItem[] = c.items.map((it) => ({
        species_name: it.species_name,
        variety_name: it.variety_name,
        qty_plants: Number(it.qty_plants),
        unit_price: Number(it.unit_price),
        currency: it.currency,
        delivery_year: it.delivery_year,
        delivery_week: it.delivery_week,
      }));
      const payments: ContractPdfPayment[] = c.payments.map((p, i) => ({
        label: `${i + 1}ª cuota${p.type ? ` (${p.type})` : ""}`,
        dueDate: p.due_date,
        amount: Number(p.amount),
        currency: p.currency,
      }));

      const placeAndDate = `Santiago, ${new Date(
        c.signed_at ?? Date.now(),
      ).toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" })}`;

      const pdfData: ContractPdfData = {
        number: c.number,
        placeAndDate,
        seller,
        buyer: {
          legalName: c.client_legal_name ?? c.client_name ?? "Comprador",
          taxId: c.client_tax_id,
          giro: c.client_giro,
          domicile: c.buyer?.domicile ?? c.client_region,
          representativeName: buyerRep,
          representativeId: null,
          noticeEmail: buyerEmail,
        },
        plantingLocation: null,
        currency: c.currency,
        totalNeto: Number(c.total_neto),
        totalIva: Number(c.total_iva),
        totalNetoUsd: Number(c.total_neto_usd),
        items,
        payments,
      };

      const pdf = await generateContractPdf(pdfData);
      const documentHash = createHash("sha256").update(Buffer.from(pdf)).digest("hex");

      const signers: EnvelopeSigner[] = [
        { email: buyerEmail, name: buyerRep, anchorString: "/sn1/", routingOrder: 1 },
      ];
      const sellerEmail = process.env.DOCUSIGN_SELLER_SIGNER_EMAIL;
      if (sellerEmail && sellerEmail.includes("@")) {
        signers.push({
          email: sellerEmail,
          name: process.env.DOCUSIGN_SELLER_SIGNER_NAME ?? seller.representativeName,
          anchorString: "/sn2/",
          routingOrder: 2,
        });
      }

      let envelope: { envelopeId: string; status: string };
      try {
        envelope = await createEnvelope({
          pdf,
          documentName: `Contrato ${c.number}`,
          signers,
          emailSubject: `Contrato ${c.number} — ${seller.legalName} para firma`,
          emailBody:
            "Por favor revisá y firmá el contrato adjunto. Cualquier consulta, respondé este correo.",
        });
      } catch (e) {
        return errorContent(e instanceof Error ? e.message : "Error creando el sobre.");
      }

      const rec = await rpc("mcp_docusign_record_sent", {
        p_user_id: auth.userId,
        p_contract_id: args.contract_id,
        p_envelope_id: envelope.envelopeId,
        p_signer_email: buyerEmail,
        p_signer_name: buyerRep,
        p_document_hash: documentHash,
      });
      if (rec.error) {
        try {
          await voidEnvelope(envelope.envelopeId, "Rollback: fallo al registrar en CRM");
        } catch {
          /* best effort */
        }
        return errorContent(`Sobre creado pero no registrado: ${rec.error.message}`);
      }

      return jsonContent({
        ok: true,
        envelope_id: envelope.envelopeId,
        status: envelope.status,
        signer_email: buyerEmail,
        signers: signers.length,
      });
    }) as ToolHandler,
  );

  // ---- Consultar estado ---------------------------------------------------
  server.registerTool(
    "signature_status",
    {
      title: "Estado de firma del contrato",
      description:
        "Devuelve el estado de la firma DocuSign del contrato (enviado/visto/firmado/rechazado/anulado), o null si no se ha enviado.",
      inputSchema: { contract_id: z.string().uuid() },
    },
    (async (args: { contract_id: string }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return errorContent("No autenticado.");
      const { data, error } = await rpc("mcp_docusign_signature_status", {
        p_user_id: auth.userId,
        p_contract_id: args.contract_id,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  // ---- Anular envío -------------------------------------------------------
  server.registerTool(
    "void_signature",
    {
      title: "Anular envío de firma",
      description:
        "Anula (void) el sobre DocuSign en vuelo del contrato. No avanza el contrato. Requiere rol sales o admin. No se puede anular un sobre ya completado.",
      inputSchema: {
        contract_id: z.string().uuid(),
        reason: z.string().optional(),
      },
    },
    (async (args: { contract_id: string; reason?: string }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return errorContent("No autenticado.");
      if (!canSign(auth.role))
        return errorContent(`Rol "${auth.role}" no autorizado a anular.`);
      if (!isDocusignConfigured())
        return errorContent("DocuSign no está configurado.");

      const { data, error } = await rpc<{
        envelope_id: string | null;
        status: string;
      } | null>("mcp_docusign_signature_status", {
        p_user_id: auth.userId,
        p_contract_id: args.contract_id,
      });
      if (error) return errorContent(error.message);
      if (!data?.envelope_id) return errorContent("No hay sobre para anular.");
      if (data.status === "completed")
        return errorContent("El sobre ya está completado; no se puede anular.");

      const reason = args.reason || "Anulado vía MCP";
      try {
        await voidEnvelope(data.envelope_id, reason);
      } catch (e) {
        return errorContent(e instanceof Error ? e.message : "Error anulando el sobre.");
      }
      const applied = await rpc("docusign_apply_event", {
        p_envelope_id: data.envelope_id,
        p_status: "voided",
        p_declined_reason: reason,
      });
      if (applied.error) return errorContent(applied.error.message);
      return jsonContent({ ok: true, status: "voided" });
    }) as ToolHandler,
  );
}
