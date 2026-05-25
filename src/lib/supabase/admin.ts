import "server-only";

import { createClient as createAdminBase } from "@supabase/supabase-js";

/**
 * Cliente Supabase con SERVICE_ROLE — bypassea RLS y permite operaciones
 * de admin (auth.users CRUD, etc). Usar SOLO en server actions / route
 * handlers protegidos por role check.
 *
 * Falla en runtime si SUPABASE_SERVICE_ROLE_KEY no está seteada.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL");
  if (!serviceKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (necesario para panel de admin). Obtenerla en Supabase Dashboard → Settings → API Keys → secret_role.",
    );
  }
  return createAdminBase(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
