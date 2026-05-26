"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";

export type ClientShareLinkRow = {
  id: string;
  client_id: string;
  client_name: string | null;
  country_id: string | null;
  country_name: string | null;
  token: string;
  expires_at: string | null;
  open_count: number;
  last_opened_at: string | null;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  revoked_at: string | null;
};

type RpcResult<T> = { data: T | null; error: { message: string } | null };

async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const supabase = await createClient();
  return (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult<T>>)(name, args);
}

export async function listClientShareLinks(
  clientId?: string,
): Promise<ClientShareLinkRow[]> {
  const { data, error } = await callRpc<ClientShareLinkRow[]>(
    "list_client_share_links",
    { p_client_id: clientId ?? null },
  );
  if (error) throw new Error(error.message);
  return data ?? [];
}

const createSchema = z.object({
  client_id: z.string().uuid(),
  ttl_days: z.number().int().min(0).max(365).optional(),
});

export type CreateShareLinkInput = z.input<typeof createSchema>;

export type CreateShareLinkResult =
  | { ok: true; id: string; token: string; expires_at: string | null }
  | { ok: false; message: string };

export async function createClientShareLink(
  input: CreateShareLinkInput,
): Promise<CreateShareLinkResult> {
  try {
    const parsed = createSchema.parse(input);
    const { data, error } = await callRpc<
      { id: string; token: string; expires_at: string | null }[]
    >("create_client_share_link", {
      p_client_id: parsed.client_id,
      p_ttl_days: parsed.ttl_days ?? 30,
    });
    if (error) return { ok: false, message: error.message };
    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.token) return { ok: false, message: "RPC no devolvió token" };
    revalidatePath("/compartir");
    return { ok: true, id: row.id, token: row.token, expires_at: row.expires_at };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function revokeClientShareLink(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await callRpc("revoke_client_share_link", { p_id: id });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/compartir");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export type ClientPickerRow = {
  id: string;
  name: string;
  country_name: string | null;
};

export async function listClientsForPicker(): Promise<ClientPickerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, country:country_id(name_es)")
    .is("deleted_at", null)
    .order("name")
    .limit(500);
  if (error) throw new Error(error.message);
  type Row = { id: string; name: string; country: { name_es: string | null } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    name: r.name,
    country_name: r.country?.name_es ?? null,
  }));
}
