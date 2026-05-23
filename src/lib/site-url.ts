/**
 * Resuelve el origin canónico para construir redirect URLs en flujos de auth.
 *
 * Orden de preferencia:
 *   1. `NEXT_PUBLIC_SITE_URL` — definido en `.env.local` o en Vercel
 *   2. `NEXT_PUBLIC_VERCEL_URL` — auto-inyectado por Vercel en preview/prod
 *   3. `window.location.origin` — sólo en el cliente
 *   4. Fallback `http://localhost:3003`
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit);

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercel) return `https://${stripTrailingSlash(vercel)}`;

  if (typeof window !== "undefined") return window.location.origin;

  return "http://localhost:3003";
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export const HIJUELAS_DOMAIN = "grupohijuelas.com" as const;

export function isHijuelasEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return /^[^\s@]+@grupohijuelas\.com$/.test(normalized);
}
