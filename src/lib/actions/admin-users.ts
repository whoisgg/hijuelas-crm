"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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
/* Guard                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Bloquea cualquier acción de admin si el caller no es admin.
 * Throw error → server action devuelve { ok: false, message }.
 */
async function requireAdmin(): Promise<{ id: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");

  const { data: appUser, error } = await supabase
    .from("app_users")
    .select("id, role, is_active, deleted_at")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!appUser || appUser.deleted_at || !appUser.is_active) {
    throw new Error("Usuario no encontrado o inactivo.");
  }
  if (appUser.role !== "admin") {
    throw new Error("Solo administradores pueden acceder al panel.");
  }
  return { id: user.id };
}

/** Para checks server-side en page.tsx (no-throw). */
export async function isCurrentUserAdmin(): Promise<boolean> {
  try {
    await requireAdmin();
    return true;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/* Listar                                                                      */
/* -------------------------------------------------------------------------- */

export async function listAdminUsers(): Promise<AdminUserRow[]> {
  await requireAdmin();
  const admin = createAdminClient();

  const { data: appUsers, error } = await admin
    .from("app_users")
    .select("id, full_name, email, role, is_active, created_at")
    .is("deleted_at", null)
    .order("full_name", { ascending: true });
  if (error) throw new Error(error.message);

  // Traer last_sign_in_at desde auth.users en batch
  const ids = (appUsers ?? []).map((u) => u.id);
  const lastSigninMap = new Map<string, string | null>();
  if (ids.length > 0) {
    // listUsers no soporta filtro por id; paginamos hasta cubrir todos
    let page = 1;
    const perPage = 200;
    const wanted = new Set(ids);
    while (wanted.size > 0) {
      const { data, error: err } = await admin.auth.admin.listUsers({ page, perPage });
      if (err) break;
      for (const u of data.users) {
        if (wanted.has(u.id)) {
          lastSigninMap.set(u.id, u.last_sign_in_at ?? null);
          wanted.delete(u.id);
        }
      }
      if (data.users.length < perPage) break;
      page += 1;
      if (page > 50) break; // safety
    }
  }

  return (appUsers ?? []).map((u) => ({
    id: u.id,
    full_name: u.full_name,
    email: u.email,
    role: u.role,
    is_active: u.is_active ?? true,
    created_at: u.created_at,
    last_sign_in_at: lastSigninMap.get(u.id) ?? null,
  }));
}

/* -------------------------------------------------------------------------- */
/* Crear                                                                       */
/* -------------------------------------------------------------------------- */

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
    await requireAdmin();
    const parsed = createSchema.parse(input);
    const admin = createAdminClient();

    // 1) Crear en auth.users con email confirmado
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: parsed.email,
      password: parsed.password,
      email_confirm: true,
      user_metadata: { full_name: parsed.full_name },
    });
    if (createErr || !created.user) {
      return { ok: false, message: createErr?.message ?? "No se pudo crear el usuario." };
    }

    // 2) Crear fila en public.app_users (PK = auth.users.id)
    const { error: insertErr } = await admin.from("app_users").insert({
      id: created.user.id,
      full_name: parsed.full_name,
      email: parsed.email,
      role: parsed.role,
      is_active: true,
    });
    if (insertErr) {
      // Rollback: borrar el auth user
      await admin.auth.admin.deleteUser(created.user.id);
      return { ok: false, message: `Error en app_users: ${insertErr.message}` };
    }

    revalidatePath("/admin/usuarios");
    return { ok: true, id: created.user.id };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

/* -------------------------------------------------------------------------- */
/* Editar                                                                      */
/* -------------------------------------------------------------------------- */

const updateSchema = z.object({
  id: z.string().uuid(),
  full_name: z.string().min(2).max(120),
  email: z.string().email(),
  role: z.enum(ROLE_VALUES),
  is_active: z.boolean(),
  /** Opcional: si se pasa, resetea password */
  password: z.string().min(8).max(72).optional().or(z.literal("").transform(() => undefined)),
});

export type UpdateUserInput = z.input<typeof updateSchema>;

export async function updateAdminUser(
  input: UpdateUserInput,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    await requireAdmin();
    const parsed = updateSchema.parse(input);
    const admin = createAdminClient();

    // 1) Update auth.users (email + password si se pasó)
    const authPayload: { email?: string; password?: string } = {
      email: parsed.email,
    };
    if (parsed.password) authPayload.password = parsed.password;
    const { error: authErr } = await admin.auth.admin.updateUserById(
      parsed.id,
      authPayload,
    );
    if (authErr) return { ok: false, message: `Auth: ${authErr.message}` };

    // 2) Update public.app_users
    const { error: appErr } = await admin
      .from("app_users")
      .update({
        full_name: parsed.full_name,
        email: parsed.email,
        role: parsed.role,
        is_active: parsed.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id);
    if (appErr) return { ok: false, message: `app_users: ${appErr.message}` };

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

/* -------------------------------------------------------------------------- */
/* Eliminar (soft + ban en auth)                                              */
/* -------------------------------------------------------------------------- */

export async function deleteAdminUser(
  id: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const caller = await requireAdmin();
    if (caller.id === id) {
      return { ok: false, message: "No podés eliminar tu propio usuario." };
    }
    const admin = createAdminClient();

    // Soft delete en app_users
    const { error: appErr } = await admin
      .from("app_users")
      .update({
        deleted_at: new Date().toISOString(),
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (appErr) return { ok: false, message: `app_users: ${appErr.message}` };

    // Ban en auth — no podrá iniciar sesión
    const { error: banErr } = await admin.auth.admin.updateUserById(id, {
      ban_duration: "876000h", // 100 años
    });
    if (banErr) return { ok: false, message: `Auth ban: ${banErr.message}` };

    revalidatePath("/admin/usuarios");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}
