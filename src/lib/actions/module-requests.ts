"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Propuesta de módulo desde el selector (el "+"). Guarda la idea como
 * especificación; luego se construye en una sesión de Claude Code.
 */
export async function proposeModule(
  name: string,
  description: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "No autenticado." };

  const trimmedName = name.trim();
  const trimmedDesc = description.trim();
  if (trimmedName.length < 3) return { ok: false, error: "Nombre muy corto." };
  if (trimmedDesc.length < 10) {
    return { ok: false, error: "Describe con un poco más de detalle qué hace." };
  }

  const { error } = await supabase.from("platform_module_requests").insert({
    name: trimmedName,
    description: trimmedDesc,
    requested_by: user.id,
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
