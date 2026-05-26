"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type McpTokenRow = {
  id: string;
  name: string;
  scopes: string[];
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
};

type RpcRow<T> = { data: T | null; error: { message: string } | null };

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<RpcRow<T>> {
  const supabase = await createClient();
  return (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<RpcRow<T>>)(name, args);
}

export async function listMcpTokens(): Promise<McpTokenRow[]> {
  const { data, error } = await callRpc<McpTokenRow[]>("mcp_list_my_tokens", {});
  if (error) throw new Error(error.message);
  return data ?? [];
}

const createSchema = z.object({
  name: z.string().min(1, "Dale un nombre al token").max(80),
});

export type CreateTokenInput = z.input<typeof createSchema>;

export type CreateTokenResult =
  | { ok: true; id: string; plaintext: string; name: string; created_at: string }
  | { ok: false; message: string };

export async function createMcpToken(input: CreateTokenInput): Promise<CreateTokenResult> {
  try {
    const parsed = createSchema.parse(input);
    const { data, error } = await callRpc<
      { id: string; plaintext: string; name: string; created_at: string }[]
    >("mcp_create_token", { p_name: parsed.name });
    if (error) return { ok: false, message: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.plaintext) return { ok: false, message: "RPC no devolvió token" };
    revalidatePath("/compartir");
    return { ok: true, id: row.id, plaintext: row.plaintext, name: row.name, created_at: row.created_at };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function revokeMcpToken(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await callRpc("mcp_revoke_token", { p_token_id: id });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/compartir");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}
