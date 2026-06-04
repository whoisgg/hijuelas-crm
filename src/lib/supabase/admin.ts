import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cliente Supabase con service role (bypassa RLS). Solo para contextos
 * server-only SIN sesión de usuario, ej. el webhook de DocuSign Connect que
 * necesita escribir Storage / DB sin un auth.uid().
 *
 * Devuelve `null` si `SUPABASE_SERVICE_ROLE_KEY` no está seteada — los callers
 * deben tener un fallback (ej. el webhook flipa el estado vía RPC anon y deja el
 * archivado del PDF para un refresh autenticado posterior).
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
