"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isDocusignConfigured } from "@/lib/docusign/config";
import {
  createEnvelope,
  getEnvelope,
  downloadEnvelopeDocument,
  voidEnvelope,
} from "@/lib/docusign/client";
import {
  generateContractPdf,
  type ContractPdfData,
  type ContractPdfItem,
  type ContractPdfPayment,
} from "@/lib/contract-pdf";
import { sellerProfileFromOrg } from "@/lib/contract-templates/frambuesa-legal";
import type { EnvelopeSigner } from "@/lib/docusign/client";

const BUCKET = "attachments";

export type SignatureRow = {
  id: string;
  contract_id: string;
  provider: string;
  envelope_id: string | null;
  status: string;
  signer_email: string;
  signer_name: string | null;
  signed_pdf_url: string | null; // storage path
  certificate_url: string | null; // storage path
  document_hash: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  completed_at: string | null;
  declined_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type SignatureView = SignatureRow & {
  signed_pdf_download_url: string | null;
  certificate_download_url: string | null;
};

export type SendResult =
  | { ok: true; envelopeId: string }
  | { ok: false; message: string };

type RpcResult<T> = { data: T | null; error: { message: string } | null };

async function callRpc<T>(
  name: string,
  args: Record<string, unknown>,
): Promise<RpcResult<T>> {
  const supabase = await createClient();
  return (
    supabase.rpc as unknown as (
      name: string,
      args: Record<string, unknown>,
    ) => Promise<RpcResult<T>>
  )(name, args);
}

/** ¿Está la integración lista (env vars presentes)? Lo usa la UI. */
export async function docusignReady(): Promise<boolean> {
  return isDocusignConfigured();
}

/** Devuelve la firma vigente del contrato (la más reciente) o null. */
export async function getContractSignature(
  contractId: string,
): Promise<SignatureView | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contract_signatures")
    .select(
      "id, contract_id, provider, envelope_id, status, signer_email, signer_name, signed_pdf_url, certificate_url, document_hash, sent_at, delivered_at, completed_at, declined_reason, created_at, updated_at",
    )
    .eq("contract_id", contractId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;

  const row = data as SignatureRow;
  const signedUrl = await signedDownloadUrl(row.signed_pdf_url);
  const certUrl = await signedDownloadUrl(row.certificate_url);
  return {
    ...row,
    signed_pdf_download_url: signedUrl,
    certificate_download_url: certUrl,
  };
}

async function signedDownloadUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

/** Resuelve el firmante comprador (contacto con email) + dirección del cliente. */
async function resolveBuyer(
  clientId: string,
): Promise<{
  email: string;
  representativeName: string;
  domicile: string | null;
} | null> {
  const supabase = await createClient();
  const [contactsRes, addrRes] = await Promise.all([
    supabase
      .from("client_contacts")
      .select("name, email, role, is_primary")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .limit(20),
    supabase
      .from("client_addresses")
      .select("line1, line2, region")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
  ]);
  if (contactsRes.error) throw new Error(contactsRes.error.message);
  const contacts = (contactsRes.data ?? []) as {
    name: string | null;
    email: string | null;
    role: string | null;
    is_primary: boolean | null;
  }[];
  const withEmail = contacts.find((c) => c.email && c.email.includes("@"));
  if (!withEmail) return null;

  const addr = addrRes.data as
    | { line1: string | null; line2: string | null; region: string | null }
    | null;
  const domicile =
    [addr?.line1, addr?.line2, addr?.region].filter(Boolean).join(", ") || null;

  return {
    email: withEmail.email as string,
    representativeName: withEmail.name ?? "Comprador",
    domicile,
  };
}

/**
 * Envía el contrato a firmar vía DocuSign:
 *  1. Carga el contrato + items + cliente + contacto.
 *  2. Genera el PDF provisional + su hash SHA256.
 *  3. Crea el Envelope (status sent).
 *  4. Registra la firma vía RPC docusign_record_sent.
 */
export async function sendContractForSignature(
  contractId: string,
): Promise<SendResult> {
  try {
    if (!isDocusignConfigured()) {
      return {
        ok: false,
        message:
          "DocuSign no está configurado. Cargá las env vars DOCUSIGN_* (ver docs/docusign-integration-plan.md §3).",
      };
    }

    const supabase = await createClient();
    const { data: contract, error } = await supabase
      .from("contracts")
      .select(
        `id, number, status, condition, currency, total_neto, total_iva, total_neto_usd, incoterm, signed_at,
         client:clients!contracts_client_id_fkey ( id, name, legal_name, tax_id, giro, region ),
         organization:organizations!contracts_organization_id_fkey ( id, name, legal_name, tax_id,
           legal_representative_name, legal_representative_id, legal_domicile,
           bank_name, bank_account, notice_name, notice_email, signer_email ),
         items:contract_items ( qty_plants, unit_price, currency, delivery_year, delivery_week,
           variety:varieties ( name, species:species ( name ) ) ),
         payments ( type, amount, currency, due_date, status )`,
      )
      .eq("id", contractId)
      .is("deleted_at", null)
      .single();
    if (error) return { ok: false, message: error.message };

    type RawContract = {
      number: string;
      status: string;
      currency: string;
      total_neto: number | string;
      total_iva: number | string;
      total_neto_usd: number | string;
      signed_at: string | null;
      client: {
        id: string;
        name: string | null;
        legal_name: string | null;
        tax_id: string | null;
        giro: string | null;
        region: string | null;
      } | null;
      organization: {
        id: string;
        name: string | null;
        legal_name: string | null;
        tax_id: string | null;
        legal_representative_name: string | null;
        legal_representative_id: string | null;
        legal_domicile: string | null;
        bank_name: string | null;
        bank_account: string | null;
        notice_name: string | null;
        notice_email: string | null;
        signer_email: string | null;
      } | null;
      items: {
        qty_plants: number | string;
        unit_price: number | string;
        currency: string;
        delivery_year: number | null;
        delivery_week: number | null;
        variety: { name: string | null; species: { name: string | null } | null } | null;
      }[];
      payments: {
        type: string;
        amount: number | string;
        currency: string;
        due_date: string | null;
        status: string;
      }[];
    };
    const c = contract as unknown as RawContract;

    if (c.status === "firmado" || c.status === "finalizado") {
      return { ok: false, message: `El contrato ya está ${c.status}.` };
    }
    if (!c.client?.id) {
      return { ok: false, message: "El contrato no tiene cliente asociado." };
    }

    const buyer = await resolveBuyer(c.client.id);
    if (!buyer) {
      return {
        ok: false,
        message:
          "El cliente no tiene un contacto con email. Agregá un contacto (idealmente Principal) con correo antes de enviar a firmar.",
      };
    }

    const seller = sellerProfileFromOrg(c.organization ?? {});

    const items: ContractPdfItem[] = c.items.map((it) => ({
      species_name: it.variety?.species?.name ?? null,
      variety_name: it.variety?.name ?? null,
      qty_plants: Number(it.qty_plants),
      unit_price: Number(it.unit_price),
      currency: it.currency,
      delivery_year: it.delivery_year,
      delivery_week: it.delivery_week,
    }));

    const payments: ContractPdfPayment[] = c.payments
      .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
      .map((p, i) => ({
        label: `${i + 1}ª cuota${p.type ? ` (${p.type})` : ""}`,
        dueDate: p.due_date,
        amount: Number(p.amount),
        currency: p.currency,
      }));

    const placeAndDate = `Santiago, ${new Date(c.signed_at ?? Date.now()).toLocaleDateString(
      "es-CL",
      { day: "2-digit", month: "long", year: "numeric" },
    )}`;

    const pdfData: ContractPdfData = {
      number: c.number,
      placeAndDate,
      seller,
      buyer: {
        legalName: c.client.legal_name ?? c.client.name ?? "Comprador",
        taxId: c.client.tax_id,
        giro: c.client.giro,
        domicile: buyer.domicile ?? c.client.region,
        representativeName: buyer.representativeName,
        representativeId: null, // cédula no modelada en el CRM (queda en blanco)
        noticeEmail: buyer.email,
      },
      plantingLocation: null, // no modelado en el CRM
      currency: c.currency,
      totalNeto: Number(c.total_neto),
      totalIva: Number(c.total_iva),
      totalNetoUsd: Number(c.total_neto_usd),
      items,
      payments,
    };

    const pdf = await generateContractPdf(pdfData);
    const documentHash = createHash("sha256")
      .update(Buffer.from(pdf))
      .digest("hex");

    // Firmantes: comprador (obligatorio) + vendedor Hijuelas (opcional, si hay
    // email de firmante interno configurado en env).
    const signers: EnvelopeSigner[] = [
      {
        email: buyer.email,
        name: buyer.representativeName,
        anchorString: "/sn1/",
        routingOrder: 1,
      },
    ];
    // Firmante vendedor: prioridad a organizations.signer_email; si no, env.
    const sellerEmail =
      c.organization?.signer_email ?? process.env.DOCUSIGN_SELLER_SIGNER_EMAIL;
    if (sellerEmail && sellerEmail.includes("@")) {
      signers.push({
        email: sellerEmail,
        name:
          process.env.DOCUSIGN_SELLER_SIGNER_NAME ?? seller.representativeName,
        anchorString: "/sn2/",
        routingOrder: 2,
      });
    }

    const envelope = await createEnvelope({
      pdf,
      documentName: `Contrato ${c.number}`,
      signers,
      emailSubject: `Contrato ${c.number} — ${seller.legalName} para firma`,
      emailBody:
        "Por favor revisá y firmá el contrato adjunto. Cualquier consulta, respondé este correo.",
    });

    const { error: rpcErr } = await callRpc<string>("docusign_record_sent", {
      p_contract_id: contractId,
      p_envelope_id: envelope.envelopeId,
      p_signer_email: buyer.email,
      p_signer_name: buyer.representativeName,
      p_document_hash: documentHash,
    });
    if (rpcErr) {
      // El sobre ya salió; lo anulamos para no dejar estado inconsistente.
      try {
        await voidEnvelope(
          envelope.envelopeId,
          "Rollback: fallo al registrar en CRM",
        );
      } catch {
        /* best effort */
      }
      return { ok: false, message: `Sobre creado pero no registrado: ${rpcErr.message}` };
    }

    revalidatePath(`/contratos/${contractId}`);
    return { ok: true, envelopeId: envelope.envelopeId };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error desconocido",
    };
  }
}

/**
 * Polling de respaldo: consulta el estado del sobre en DocuSign y aplica el
 * evento (mapeo de estado + flip a firmado). Si quedó completado, archiva el
 * PDF firmado + certificado en Storage.
 */
export async function refreshEnvelopeStatus(
  contractId: string,
): Promise<{ ok: boolean; status?: string; message?: string }> {
  try {
    if (!isDocusignConfigured()) {
      return { ok: false, message: "DocuSign no configurado." };
    }
    const current = await getContractSignature(contractId);
    if (!current?.envelope_id) {
      return { ok: false, message: "No hay sobre para este contrato." };
    }

    const env = await getEnvelope(current.envelope_id);
    const status = env.status.toLowerCase();

    let signedPath: string | null = null;
    let certPath: string | null = null;
    if (status === "completed" && !current.signed_pdf_url) {
      const archived = await archiveEnvelopeDocs(contractId, current.envelope_id);
      signedPath = archived.signedPath;
      certPath = archived.certPath;
    }

    const { error } = await callRpc<string>("docusign_apply_event", {
      p_envelope_id: current.envelope_id,
      p_status: status,
      p_signed_pdf_url: signedPath,
      p_certificate_url: certPath,
      p_declined_reason: env.voidedReason ?? null,
      p_completed_at: env.completedDateTime ?? null,
      p_raw_event: env as unknown as Record<string, unknown>,
    });
    if (error) return { ok: false, message: error.message };

    revalidatePath(`/contratos/${contractId}`);
    return { ok: true, status };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error desconocido",
    };
  }
}

/** Descarga el PDF firmado + certificado de DocuSign y los sube a Storage. */
async function archiveEnvelopeDocs(
  contractId: string,
  envelopeId: string,
): Promise<{ signedPath: string | null; certPath: string | null }> {
  const supabase = await createClient();
  let signedPath: string | null = null;
  let certPath: string | null = null;

  try {
    const combined = await downloadEnvelopeDocument(envelopeId, "combined");
    const path = `contract/${contractId}/docusign-${envelopeId}-firmado.pdf`;
    const up = await supabase.storage
      .from(BUCKET)
      .upload(path, combined, { contentType: "application/pdf", upsert: true });
    if (!up.error) signedPath = path;
  } catch {
    /* el documento puede no estar listo aún */
  }

  try {
    const cert = await downloadEnvelopeDocument(envelopeId, "certificate");
    const path = `contract/${contractId}/docusign-${envelopeId}-certificado.pdf`;
    const up = await supabase.storage
      .from(BUCKET)
      .upload(path, cert, { contentType: "application/pdf", upsert: true });
    if (!up.error) certPath = path;
  } catch {
    /* opcional */
  }

  return { signedPath, certPath };
}

/** Anula el sobre en vuelo (no avanza el contrato). */
export async function voidContractEnvelope(
  contractId: string,
  reason: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    if (!isDocusignConfigured()) {
      return { ok: false, message: "DocuSign no configurado." };
    }
    const current = await getContractSignature(contractId);
    if (!current?.envelope_id) {
      return { ok: false, message: "No hay sobre para anular." };
    }
    if (current.status === "completed") {
      return { ok: false, message: "El sobre ya está completado; no se puede anular." };
    }

    await voidEnvelope(current.envelope_id, reason || "Anulado desde el CRM");
    const { error } = await callRpc<string>("docusign_apply_event", {
      p_envelope_id: current.envelope_id,
      p_status: "voided",
      p_declined_reason: reason || "Anulado desde el CRM",
    });
    if (error) return { ok: false, message: error.message };

    revalidatePath(`/contratos/${contractId}`);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : "Error desconocido",
    };
  }
}
