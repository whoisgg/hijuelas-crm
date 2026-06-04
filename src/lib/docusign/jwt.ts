import { createSign } from "node:crypto";

import { getDocusignConfig, type DocusignConfig } from "./config";

/**
 * Autenticación JWT Grant (server-to-server). La app firma un JWT con la clave
 * privada RSA y lo cambia por un access token (~1h) que se cachea en memoria.
 * Ver docs/docusign-integration-plan.md §2.
 *
 * El consentimiento de admin (scope `signature impersonation`) se otorga UNA vez
 * por integration key abriendo en el navegador:
 *   https://{oauthBase}/oauth/auth?response_type=code
 *     &scope=signature%20impersonation
 *     &client_id=<INTEGRATION_KEY>&redirect_uri=<redirect URI registrada>
 */

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Construye y firma el JWT assertion (RS256). */
function buildAssertion(cfg: DocusignConfig): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: cfg.integrationKey,
    sub: cfg.userId,
    aud: cfg.oauthBase,
    iat: now,
    exp: now + 3600, // máximo permitido por DocuSign
    scope: "signature impersonation",
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload),
  )}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(cfg.privateKey);

  return `${signingInput}.${base64url(signature)}`;
}

type TokenCache = { token: string; expiresAt: number };
let cache: TokenCache | null = null;

/** URL de consentimiento de admin — se muestra cuando DocuSign pide consent. */
export function consentUrl(cfg: DocusignConfig, redirectUri: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    scope: "signature impersonation",
    client_id: cfg.integrationKey,
    redirect_uri: redirectUri,
  });
  return `https://${cfg.oauthBase}/oauth/auth?${params.toString()}`;
}

/**
 * Devuelve un access token válido (cacheado). Lanza con mensaje claro si falta
 * config o si DocuSign requiere consentimiento.
 */
export async function getAccessToken(): Promise<string> {
  const cfg = getDocusignConfig();
  if (!cfg) {
    throw new Error(
      "DocuSign no está configurado (faltan env vars DOCUSIGN_*).",
    );
  }

  // Margen de 5 min antes de la expiración real.
  if (cache && cache.expiresAt - 300_000 > Date.now()) {
    return cache.token;
  }

  const assertion = buildAssertion(cfg);
  const res = await fetch(`https://${cfg.oauthBase}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    let parsed: { error?: string; error_description?: string } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* respuesta no-JSON */
    }
    if (parsed.error === "consent_required") {
      throw new Error(
        "DocuSign requiere consentimiento de admin (scope signature impersonation). " +
          "Abrí la consent URL una vez con la cuenta admin. Ver docs/docusign-integration-plan.md §2.",
      );
    }
    throw new Error(
      `DocuSign token error (${res.status}): ${parsed.error ?? text}`,
    );
  }

  const json = JSON.parse(text) as {
    access_token: string;
    expires_in: number;
  };
  cache = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return json.access_token;
}

/** Invalida el token cacheado (para tests o tras un 401). */
export function clearTokenCache(): void {
  cache = null;
}
