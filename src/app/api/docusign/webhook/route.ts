import { createHmac, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { downloadEnvelopeDocument } from "@/lib/docusign/client";
import { isDocusignConfigured } from "@/lib/docusign/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "attachments";

/**
 * Webhook de DocuSign Connect. Recibe eventos de sobre, verifica el HMAC y
 * actualiza contract_signatures (+ flip a 'firmado' en completed) vía el RPC
 * docusign_apply_event. Ver docs/docusign-integration-plan.md §6.
 *
 * Configurar en DocuSign Admin → Connect apuntando a:
 *   https://hijuelas-crm.vercel.app/api/docusign/webhook
 * con HMAC activado (mismo secreto en DOCUSIGN_CONNECT_HMAC_KEY) y los eventos
 * de envelope (sent, delivered, completed, declined, voided).
 */

const EVENT_TO_STATUS: Record<string, string> = {
  "envelope-sent": "sent",
  "envelope-delivered": "delivered",
  "envelope-completed": "completed",
  "envelope-declined": "declined",
  "envelope-voided": "voided",
};

/** Verifica el HMAC de Connect contra el secreto. DocuSign puede mandar varias
 *  firmas (rotación de claves) en headers X-DocuSign-Signature-1..N. */
function verifyHmac(rawBody: string, headers: Headers, secret: string): boolean {
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("base64");
  const expectedBuf = Buffer.from(expected);

  for (let i = 1; i <= 5; i++) {
    const provided = headers.get(`x-docusign-signature-${i}`);
    if (!provided) continue;
    const providedBuf = Buffer.from(provided);
    if (
      providedBuf.length === expectedBuf.length &&
      timingSafeEqual(providedBuf, expectedBuf)
    ) {
      return true;
    }
  }
  return false;
}

type ConnectPayload = {
  event?: string;
  data?: {
    envelopeId?: string;
    envelopeSummary?: {
      status?: string;
      completedDateTime?: string;
      voidedReason?: string;
      declinedReason?: string;
    };
  };
};

function anonClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(req: Request): Promise<Response> {
  const rawBody = await req.text();

  // 1. Verificar HMAC (si hay secreto configurado). Sin secreto se rechaza para
  //    no aceptar eventos sin autenticar.
  // trim: `vercel env add` puede dejar un newline final que rompería el HMAC.
  const secret = process.env.DOCUSIGN_CONNECT_HMAC_KEY?.trim();
  if (!secret) {
    return new Response("Connect HMAC no configurado", { status: 503 });
  }
  if (!verifyHmac(rawBody, req.headers, secret)) {
    return new Response("Firma HMAC inválida", { status: 401 });
  }

  // 2. Parsear el evento.
  let payload: ConnectPayload;
  try {
    payload = JSON.parse(rawBody) as ConnectPayload;
  } catch {
    return new Response("Payload no-JSON", { status: 400 });
  }

  const envelopeId = payload.data?.envelopeId;
  const summary = payload.data?.envelopeSummary;
  const status =
    (payload.event && EVENT_TO_STATUS[payload.event]) ||
    summary?.status?.toLowerCase() ||
    null;

  if (!envelopeId || !status) {
    // Evento que no nos interesa (ej. recipient-*): 200 para que Connect no reintente.
    return new Response("ok (evento ignorado)", { status: 200 });
  }

  // 3. Si completó y hay service role + DocuSign configurado, archivar el PDF.
  const admin = createAdminClient();
  let signedPath: string | null = null;
  let certPath: string | null = null;
  if (status === "completed" && admin && isDocusignConfigured()) {
    const contractId = await contractIdForEnvelope(admin, envelopeId);
    if (contractId) {
      const archived = await archive(admin, contractId, envelopeId);
      signedPath = archived.signedPath;
      certPath = archived.certPath;
    }
  }

  // 4. Aplicar el evento vía RPC (admin si hay; si no, anon — el RPC está
  //    granted a anon y ya pasamos el HMAC).
  const db = admin ?? anonClient();
  if (!db) {
    return new Response("Supabase no configurado", { status: 503 });
  }
  const { error } = await db.rpc("docusign_apply_event", {
    p_envelope_id: envelopeId,
    p_status: status,
    p_signed_pdf_url: signedPath,
    p_certificate_url: certPath,
    p_declined_reason:
      summary?.declinedReason ?? summary?.voidedReason ?? null,
    p_completed_at: summary?.completedDateTime ?? null,
    p_raw_event: payload as unknown as Record<string, unknown>,
  });
  if (error) {
    // 500 → Connect reintenta con backoff.
    return new Response(`RPC error: ${error.message}`, { status: 500 });
  }

  return new Response("ok", { status: 200 });
}

async function contractIdForEnvelope(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  envelopeId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("contract_signatures")
    .select("contract_id")
    .eq("envelope_id", envelopeId)
    .maybeSingle();
  return (data as { contract_id: string } | null)?.contract_id ?? null;
}

async function archive(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  contractId: string,
  envelopeId: string,
): Promise<{ signedPath: string | null; certPath: string | null }> {
  let signedPath: string | null = null;
  let certPath: string | null = null;
  try {
    const combined = await downloadEnvelopeDocument(envelopeId, "combined");
    const path = `contract/${contractId}/docusign-${envelopeId}-firmado.pdf`;
    const up = await admin.storage
      .from(BUCKET)
      .upload(path, combined, { contentType: "application/pdf", upsert: true });
    if (!up.error) signedPath = path;
  } catch {
    /* puede no estar listo */
  }
  try {
    const cert = await downloadEnvelopeDocument(envelopeId, "certificate");
    const path = `contract/${contractId}/docusign-${envelopeId}-certificado.pdf`;
    const up = await admin.storage
      .from(BUCKET)
      .upload(path, cert, { contentType: "application/pdf", upsert: true });
    if (!up.error) certPath = path;
  } catch {
    /* opcional */
  }
  return { signedPath, certPath };
}
