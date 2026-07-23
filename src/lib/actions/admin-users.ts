"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type UserRole = Database["public"]["Enums"]["user_role"];
type AccessLevel = Database["public"]["Enums"]["module_access_level"];

export type ModuleAccessEntry = {
  level: AccessLevel;
  moduleRole: string | null;
};

export type AdminUserRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  is_platform_admin: boolean;
  /** módulo → nivel + rol propio (tabla module_access) */
  accesses: Record<string, ModuleAccessEntry>;
  is_active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
};

/* -------------------------------------------------------------------------- */
/* Check rápido (no-throw) usado por layout y nav para mostrar/ocultar.       */
/* -------------------------------------------------------------------------- */

export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("app_users")
      .select("role, is_platform_admin, is_active, deleted_at")
      .eq("id", user.id)
      .maybeSingle();
    return (
      (data?.role === "admin" || data?.is_platform_admin === true) &&
      data?.is_active === true &&
      !data?.deleted_at
    );
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* RPCs — toda la lógica de admin vive en funciones Postgres SECURITY        */
/* DEFINER. No se necesita SUPABASE_SERVICE_ROLE_KEY.                        */
/* -------------------------------------------------------------------------- */

type RpcResult<T> = { data: T | null; error: { message: string } | null };

/** Las RPC nuevas aún no están en database.types — mismo patrón que client-shares. */
async function callRpc<T>(name: string, args: Record<string, unknown>): Promise<RpcResult<T>> {
  const supabase = await createClient();
  return (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult<T>>)(name, args);
}

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = await createClient();
  const [{ data, error }, { data: flags }, { data: accessRows }] = await Promise.all([
    supabase.rpc("admin_list_users"),
    supabase.from("app_users").select("id, is_platform_admin"),
    supabase.from("module_access").select("user_id, module_key, level, module_role"),
  ]);
  if (error) throw new Error(error.message);

  const platformById = new Map((flags ?? []).map((f) => [f.id, f.is_platform_admin]));
  const accessById = new Map<string, Record<string, ModuleAccessEntry>>();
  for (const r of accessRows ?? []) {
    const entry = accessById.get(r.user_id) ?? {};
    entry[r.module_key] = { level: r.level, moduleRole: r.module_role };
    accessById.set(r.user_id, entry);
  }

  return ((data ?? []) as Omit<AdminUserRow, "is_platform_admin" | "accesses">[]).map(
    (u) => ({
      ...u,
      is_platform_admin: platformById.get(u.id) ?? false,
      accesses: accessById.get(u.id) ?? {},
    }),
  );
}

/* ---- Accesos por módulo ---- */

const accessSchema = z.object({
  user_id: z.string().uuid(),
  module_key: z.string().min(2).max(40),
  level: z.enum(["admin", "editor", "viewer"]).nullable(),
  module_role: z.string().max(40).nullable().optional(),
});

export type SetModuleAccessInput = z.input<typeof accessSchema>;

export async function setModuleAccess(
  input: SetModuleAccessInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const parsed = accessSchema.parse(input);
    const { error } = await callRpc<void>("admin_set_module_access", {
      p_user_id: parsed.user_id,
      p_module_key: parsed.module_key,
      p_level: parsed.level,
      p_module_role: parsed.module_role ?? null,
    });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function setPlatformAdmin(
  userId: string,
  value: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const { error } = await callRpc<void>("admin_set_platform_admin", {
      p_user_id: userId,
      p_value: value,
    });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

/* ---- Crear ---- */

const ROLE_VALUES = [
  "admin",
  "sales",
  "sales_support",
  "finance",
  "viewer",
  "mcp_editor",
  "produccion",
] as const;

const createSchema = z.object({
  full_name: z.string().min(2, "Mínimo 2 caracteres").max(120),
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Mínimo 8 caracteres").max(72),
  role: z.enum(ROLE_VALUES),
});

export type CreateUserInput = z.input<typeof createSchema>;

export async function createAdminUser(
  input: CreateUserInput,
): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  try {
    const parsed = createSchema.parse(input);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("admin_create_user", {
      p_full_name: parsed.full_name,
      p_email: parsed.email,
      p_password: parsed.password,
      p_role: parsed.role,
    });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/admin/usuarios");
    return { ok: true, id: data as string };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

/* ---- Editar ---- */

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.enum(ROLE_VALUES),
  is_active: z.boolean(),
  password: z
    .string()
    .min(8)
    .max(72)
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type UpdateUserInput = z.input<typeof updateSchema>;

export async function updateAdminUser(
  input: UpdateUserInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const parsed = updateSchema.parse(input);
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_update_user", {
      p_id: parsed.id,
      p_full_name: parsed.full_name,
      p_email: parsed.email,
      p_role: parsed.role,
      p_is_active: parsed.is_active,
      p_password: parsed.password ?? null,
    });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

/* ---- Eliminar (soft) ---- */

export async function deleteAdminUser(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("admin_delete_user", { p_id: id });
    if (error) return { ok: false, message: error.message };
    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}
