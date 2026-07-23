import { createClient } from "@/lib/supabase/server";
import {
  ACCESS_LEVEL_RANK,
  type AccessLevel,
  type ModuleAccessInfo,
} from "@/lib/constants";

/**
 * Resolución de acceso multi-módulo (Hijuelas One).
 *
 * El acceso de un usuario se define en `module_access` (nivel estándar
 * admin/editor/viewer + rol propio del módulo) más el flag
 * `app_users.is_platform_admin`, que ve y administra todo. El enum legacy
 * `app_users.role` sigue existiendo para RLS/MCP/filtros KAM (fase 4 lo
 * retira); acá no se usa para decidir acceso.
 */

type Supa = Awaited<ReturnType<typeof createClient>>;

export type AccessProfile = ModuleAccessInfo & {
  userId: string;
  email: string | null;
  /** role legacy — solo informativo durante la transición */
  role: string | null;
};

/** Perfil de acceso del usuario autenticado, o null si no hay sesión activa. */
export async function getAccessProfile(client?: Supa): Promise<AccessProfile | null> {
  const supabase = client ?? (await createClient());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: appUser }, { data: rows }] = await Promise.all([
    supabase
      .from("app_users")
      .select("role, is_platform_admin, is_active, deleted_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("module_access")
      .select("module_key, level, module_role")
      .eq("user_id", user.id),
  ]);
  if (!appUser || !appUser.is_active || appUser.deleted_at) return null;

  const modules: ModuleAccessInfo["modules"] = {};
  for (const r of rows ?? []) {
    modules[r.module_key] = {
      level: r.level as AccessLevel,
      moduleRole: r.module_role,
    };
  }

  return {
    userId: user.id,
    email: user.email ?? null,
    role: appUser.role ?? null,
    isPlatformAdmin: !!appUser.is_platform_admin,
    modules,
  };
}

/** ¿El perfil alcanza `min` en el módulo? Platform admin siempre sí. */
export function hasModuleAccess(
  profile: ModuleAccessInfo | null,
  moduleKey: string,
  min: AccessLevel = "viewer",
): boolean {
  if (!profile) return false;
  if (profile.isPlatformAdmin) return true;
  const entry = profile.modules[moduleKey];
  return !!entry && ACCESS_LEVEL_RANK[entry.level] >= ACCESS_LEVEL_RANK[min];
}

/**
 * Gate para server actions y route handlers: exige sesión + nivel mínimo en
 * el módulo. Devuelve el client y el perfil para seguir trabajando.
 */
export async function requireModuleAccess(
  moduleKey: string,
  min: AccessLevel = "viewer",
): Promise<{ supabase: Supa; userId: string; profile: AccessProfile }> {
  const supabase = await createClient();
  const profile = await getAccessProfile(supabase);
  if (!profile) throw new Error("No autenticado.");
  if (!hasModuleAccess(profile, moduleKey, min)) {
    throw new Error("Sin permisos para este módulo.");
  }
  return { supabase, userId: profile.userId, profile };
}
