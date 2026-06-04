/**
 * Configuración de la integración DocuSign (JWT Grant, server-to-server).
 *
 * Todas las variables son backend-only (NO `NEXT_PUBLIC_`). Ver
 * docs/docusign-integration-plan.md §3 para el detalle de cada una y el flujo
 * demo → Go-Live → producción.
 *
 * Arrancar con valores DEMO:
 *   DOCUSIGN_OAUTH_BASE = account-d.docusign.com
 *   DOCUSIGN_API_BASE   = https://demo.docusign.net/restapi
 * Al pasar a producción (Grupo Hijuelas, na4):
 *   DOCUSIGN_OAUTH_BASE = account.docusign.com
 *   DOCUSIGN_API_BASE   = https://na4.docusign.net/restapi
 */

export type DocusignConfig = {
  integrationKey: string;
  userId: string;
  accountId: string;
  apiBase: string; // ej. https://demo.docusign.net/restapi
  oauthBase: string; // ej. account-d.docusign.com (sin https://)
  privateKey: string; // PEM RSA (multilinea o con \n escapados)
  connectHmacKey: string | null; // secreto para verificar el webhook Connect
};

/** Normaliza una private key pegada como env var con `\n` escapados. */
function normalizePrivateKey(raw: string): string {
  // En Vercel / .env la clave suele venir con saltos de línea escapados.
  const unescaped = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  return unescaped.trim();
}

/**
 * Devuelve la config si TODAS las variables obligatorias están presentes, o
 * `null` si falta alguna (la UI usa esto para mostrar el botón deshabilitado y
 * los server actions para fallar con un mensaje claro en vez de un 500 oscuro).
 */
export function getDocusignConfig(): DocusignConfig | null {
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY;
  const userId = process.env.DOCUSIGN_USER_ID;
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  const apiBase = process.env.DOCUSIGN_API_BASE;
  const oauthBase = process.env.DOCUSIGN_OAUTH_BASE;
  const privateKey = process.env.DOCUSIGN_PRIVATE_KEY;

  if (
    !integrationKey ||
    !userId ||
    !accountId ||
    !apiBase ||
    !oauthBase ||
    !privateKey
  ) {
    return null;
  }

  return {
    integrationKey,
    userId,
    accountId,
    apiBase: apiBase.replace(/\/+$/, ""), // sin trailing slash
    oauthBase: oauthBase.replace(/^https?:\/\//, "").replace(/\/+$/, ""),
    privateKey: normalizePrivateKey(privateKey),
    connectHmacKey: process.env.DOCUSIGN_CONNECT_HMAC_KEY || null,
  };
}

export function isDocusignConfigured(): boolean {
  return getDocusignConfig() !== null;
}

/** Igual que getDocusignConfig pero lanza si falta config (para server actions). */
export function requireDocusignConfig(): DocusignConfig {
  const cfg = getDocusignConfig();
  if (!cfg) {
    throw new Error(
      "DocuSign no está configurado. Falta(n) variable(s) de entorno DOCUSIGN_* en .env.local / Vercel. Ver docs/docusign-integration-plan.md §3.",
    );
  }
  return cfg;
}
