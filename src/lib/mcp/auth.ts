import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { Database } from "@/lib/database.types";

export type McpAuthExtra = {
  userId: string;
  email: string;
  role: string;
};

/**
 * Cliente service-role para las RPC `mcp_*`: corre solo en el servidor (esta
 * ruta nunca se ejecuta en el browser) y evita depender de que `anon`/
 * `authenticated` tengan EXECUTE sobre esas funciones. Con `p_user_id` como
 * argumento normal, dejar esas funciones ejecutables por cualquier rol de
 * Postgres permite suplantar a otro usuario con la anon key pública —
 * el service role las deja server-only.
 */
export function supabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY (o NEXT_PUBLIC_SUPABASE_URL) para las herramientas MCP.",
    );
  }
  return createSupabaseClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function verifyMcpBearerToken(
  req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  // Fallback: clientes como Claude Desktop que no permiten setear el header
  // Authorization vía la UI del connector pueden pasar el token en el query
  // string. Token visible en logs/historial; usar solo desde dispositivos
  // de confianza. Claude Code y curl deben seguir usando Bearer header.
  let token = bearerToken;
  if (!token) {
    try {
      token = new URL(req.url).searchParams.get("token") ?? undefined;
    } catch {
      // ignore
    }
  }
  if (!token) return undefined;

  type ValidateRow = {
    user_id: string;
    email: string | null;
    role: string;
    scopes: string[] | null;
  };

  const supabase = supabaseServiceClient();
  const result = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: ValidateRow[] | ValidateRow | null; error: { message: string } | null }>)(
    "mcp_validate_token",
    { p_token: token },
  );

  if (result.error || !result.data) return undefined;

  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  if (!row?.user_id) return undefined;

  const extra: McpAuthExtra = {
    userId: row.user_id,
    email: row.email ?? "",
    role: row.role ?? "viewer",
  };

  return {
    token,
    clientId: row.user_id,
    scopes: row.scopes ?? [],
    extra: extra as unknown as Record<string, unknown>,
  };
}

export function getAuthExtra(authInfo: AuthInfo | undefined): McpAuthExtra | null {
  if (!authInfo?.extra) return null;
  const extra = authInfo.extra as unknown as McpAuthExtra;
  if (!extra.userId) return null;
  return extra;
}

export function canWrite(role: string): boolean {
  return role === "admin" || role === "mcp_editor";
}

/** Firmar (enviar/anular) vía MCP: sales + admin (y mcp_editor / sales_support). */
export function canSign(role: string): boolean {
  return (
    role === "admin" ||
    role === "mcp_editor" ||
    role === "sales" ||
    role === "sales_support"
  );
}
