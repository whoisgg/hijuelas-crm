"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type UserRole = Database["public"]["Enums"]["user_role"];

export type AdminUserRow = {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
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
      .select("role, is_active, deleted_at")
      .eq("id", user.id)
      .maybeSingle();
    return data?.role === "admin" && data?.is_active === true && !data?.deleted_at;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* RPCs — toda la lógica de admin vive en funciones Postgres SECURITY        */
/* DEFINER. No se necesita SUPABASE_SERVICE_ROLE_KEY.                        */
/* -------------------------------------------------------------------------- */

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_list_users");
  if (error) throw new Error(error.message);
  return (data ?? []) as AdminUserRow[];
}

/* ---- Crear ---- */

const ROLE_VALUES = ["admin", "sales", "finance", "viewer"] as const;

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
