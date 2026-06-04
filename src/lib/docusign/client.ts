import { requireDocusignConfig } from "./config";
import { getAccessToken } from "./jwt";

/**
 * Cliente REST mínimo de DocuSign eSignature API (v2.1) sobre `fetch`.
 * Ver docs/docusign-integration-plan.md §1-§2. Se usa REST directo en lugar del
 * SDK `docusign-esign` para no agregar una dependencia pesada de CommonJS.
 */

function accountPath(): string {
  const cfg = requireDocusignConfig();
  return `${cfg.apiBase}/v2.1/accounts/${cfg.accountId}`;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAccessToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export type EnvelopeSigner = {
  email: string;
  name: string;
  /** Texto ancla en el PDF donde va el tab signHere (ej. "/sn1/"). */
  anchorString: string;
  /** Orden de firma (1 = primero). Mismo número = firman en paralelo. */
  routingOrder?: number;
};

export type CreateEnvelopeInput = {
  /** PDF a firmar, en bytes. */
  pdf: Buffer | Uint8Array;
  /** Nombre del documento (sin extensión sirve; DocuSign agrega .pdf). */
  documentName: string;
  /** Uno o más firmantes (comprador, vendedor...). */
  signers: EnvelopeSigner[];
  /** Asunto del email que recibe el firmante. */
  emailSubject: string;
  /** Cuerpo opcional del email. */
  emailBody?: string;
};

export type CreateEnvelopeResult = {
  envelopeId: string;
  status: string;
};

/**
 * Crea un sobre y lo envía (status `sent`). Cada firmante se ancla con un tab
 * `signHere` sobre su `anchorString`. El COMPRADOR suele ir primero (routingOrder
 * 1) y el VENDEDOR después (2).
 */
export async function createEnvelope(
  input: CreateEnvelopeInput,
): Promise<CreateEnvelopeResult> {
  const base64Pdf = Buffer.from(input.pdf).toString("base64");

  const body = {
    emailSubject: input.emailSubject,
    emailBlurb: input.emailBody,
    status: "sent",
    documents: [
      {
        documentBase64: base64Pdf,
        name: input.documentName,
        fileExtension: "pdf",
        documentId: "1",
      },
    ],
    recipients: {
      signers: input.signers.map((s, i) => ({
        email: s.email,
        name: s.name,
        recipientId: String(i + 1),
        routingOrder: String(s.routingOrder ?? i + 1),
        tabs: {
          signHereTabs: [
            {
              anchorString: s.anchorString,
              anchorUnits: "pixels",
              anchorXOffset: "0",
              anchorYOffset: "0",
            },
          ],
        },
      })),
    },
  };

  const res = await fetch(`${accountPath()}/envelopes`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DocuSign createEnvelope (${res.status}): ${text}`);
  }
  const json = JSON.parse(text) as { envelopeId: string; status: string };
  return { envelopeId: json.envelopeId, status: json.status };
}

export type EnvelopeStatus = {
  envelopeId: string;
  status: string; // sent | delivered | completed | declined | voided | ...
  completedDateTime?: string;
  declinedDateTime?: string;
  voidedReason?: string;
};

export async function getEnvelope(
  envelopeId: string,
): Promise<EnvelopeStatus> {
  const res = await fetch(`${accountPath()}/envelopes/${envelopeId}`, {
    method: "GET",
    headers: await authHeaders(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`DocuSign getEnvelope (${res.status}): ${text}`);
  }
  return JSON.parse(text) as EnvelopeStatus;
}

/**
 * Descarga un documento del sobre. `which`:
 *   - "combined": el PDF firmado con todos los docs combinados.
 *   - "certificate": el Certificate of Completion.
 * Devuelve los bytes del PDF.
 */
export async function downloadEnvelopeDocument(
  envelopeId: string,
  which: "combined" | "certificate" = "combined",
): Promise<Buffer> {
  const docId = which === "certificate" ? "certificate" : "combined";
  const token = await getAccessToken();
  const res = await fetch(
    `${accountPath()}/envelopes/${envelopeId}/documents/${docId}`,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/pdf" },
    },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DocuSign downloadDocument (${res.status}): ${text}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/** Anula (void) un sobre en vuelo. */
export async function voidEnvelope(
  envelopeId: string,
  reason: string,
): Promise<void> {
  const res = await fetch(`${accountPath()}/envelopes/${envelopeId}`, {
    method: "PUT",
    headers: await authHeaders(),
    body: JSON.stringify({ status: "voided", voidedReason: reason }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DocuSign voidEnvelope (${res.status}): ${text}`);
  }
}
