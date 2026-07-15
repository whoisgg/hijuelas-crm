"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { masterByKey } from "@/lib/custom/masters";
import type { CustomFieldType } from "@/lib/custom/data";

/**
 * Acciones del motor config-driven. Construir un módulo = definir campos
 * (que un motor genérico renderiza). Los drafts son sandbox; solo builders
 * los editan; solo admin promueve a live.
 */

async function getAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, is_module_builder")
    .eq("id", user.id)
    .maybeSingle();
  const isBuilder = appUser?.role === "admin" || !!appUser?.is_module_builder;
  const isAdmin = appUser?.role === "admin";
  return { supabase, userId: user.id, isBuilder, isAdmin };
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export async function createDraftModule(
  name: string,
  description: string | null,
): Promise<{ ok: boolean; key?: string; error?: string }> {
  const { supabase, userId, isBuilder } = await getAccess();
  if (!isBuilder) return { ok: false, error: "Sin permiso de builder." };
  const trimmed = name.trim();
  if (trimmed.length < 3) return { ok: false, error: "Nombre muy corto." };

  const baseKey = slugify(trimmed) || "modulo";
  let key = baseKey;
  for (let i = 2; i < 30; i++) {
    const { data: existing } = await supabase
      .from("custom_modules")
      .select("id")
      .eq("key", key)
      .maybeSingle();
    if (!existing) break;
    key = `${baseKey}-${i}`;
  }

  const { error } = await supabase.from("custom_modules").insert({
    key,
    name: trimmed,
    description,
    owner_id: userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/apps");
  return { ok: true, key };
}

export async function addField(input: {
  moduleId: number;
  label: string;
  type: CustomFieldType;
  options?: string[];
  masterSource?: string | null;
  required?: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, isBuilder } = await getAccess();
  if (!isBuilder) return { ok: false, error: "Sin permiso de builder." };
  const label = input.label.trim();
  if (label.length < 1) return { ok: false, error: "Falta el nombre del campo." };
  if (input.type === "master" && !masterByKey(input.masterSource)) {
    return { ok: false, error: "Elige un maestro válido." };
  }

  const baseKey = slugify(label).replace(/-/g, "_") || "campo";
  const { data: existing } = await supabase
    .from("custom_fields")
    .select("key, sort")
    .eq("module_id", input.moduleId);
  const keys = new Set((existing ?? []).map((f) => f.key));
  let key = baseKey;
  for (let i = 2; keys.has(key); i++) key = `${baseKey}_${i}`;
  const nextSort = (existing ?? []).reduce((m, f) => Math.max(m, f.sort), 0) + 1;

  const { error } = await supabase.from("custom_fields").insert({
    module_id: input.moduleId,
    key,
    label,
    type: input.type,
    options: input.options ?? [],
    master_source: input.type === "master" ? (input.masterSource ?? null) : null,
    required: !!input.required,
    sort: nextSort,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/m", "layout");
  return { ok: true };
}

export async function deleteField(fieldId: number): Promise<{ ok: boolean; error?: string }> {
  const { supabase, isBuilder } = await getAccess();
  if (!isBuilder) return { ok: false, error: "Sin permiso de builder." };
  const { error } = await supabase.from("custom_fields").delete().eq("id", fieldId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/m", "layout");
  return { ok: true };
}

export async function setModuleStatus(
  moduleId: number,
  status: "draft" | "live",
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, isAdmin } = await getAccess();
  if (!isAdmin) return { ok: false, error: "Solo un admin promueve módulos a producción." };
  const { error } = await supabase
    .from("custom_modules")
    .update({ status })
    .eq("id", moduleId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/apps");
  revalidatePath("/m", "layout");
  return { ok: true };
}

export async function createRecord(
  moduleId: number,
  data: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await getAccess();
  const { error } = await supabase
    .from("custom_records")
    .insert({ module_id: moduleId, data, created_by: userId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/m", "layout");
  return { ok: true };
}

export async function deleteRecord(recordId: number): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await getAccess();
  const { error } = await supabase.from("custom_records").delete().eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/m", "layout");
  return { ok: true };
}
