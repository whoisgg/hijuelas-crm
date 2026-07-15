import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { fetchMasterOptions, type MasterOption } from "@/lib/custom/masters";

/**
 * Lectura de módulos config-driven: definición (campos) + registros. El
 * motor genérico (páginas /m/[key]) consume estos datos.
 */

export type CustomFieldType = "text" | "number" | "date" | "boolean" | "select" | "master";

export type CustomField = {
  id: number;
  key: string;
  label: string;
  type: CustomFieldType;
  options: string[];
  masterSource: string | null;
  required: boolean;
  sort: number;
};

export type CustomModule = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  icon: string;
  status: "draft" | "live";
  ownerId: string | null;
};

export type CustomRecord = {
  id: number;
  data: Record<string, unknown>;
  createdAt: string;
};

export async function getModuleByKey(
  supabase: SupabaseClient<Database>,
  key: string,
): Promise<{ module: CustomModule; fields: CustomField[] } | null> {
  const { data: mod } = await supabase
    .from("custom_modules")
    .select("id, key, name, description, icon, status, owner_id")
    .eq("key", key)
    .maybeSingle();
  if (!mod) return null;

  const { data: fields } = await supabase
    .from("custom_fields")
    .select("id, key, label, type, options, master_source, required, sort")
    .eq("module_id", mod.id)
    .order("sort");

  return {
    module: {
      id: mod.id,
      key: mod.key,
      name: mod.name,
      description: mod.description,
      icon: mod.icon,
      status: mod.status as "draft" | "live",
      ownerId: mod.owner_id,
    },
    fields: (fields ?? []).map((f) => ({
      id: f.id,
      key: f.key,
      label: f.label,
      type: f.type as CustomFieldType,
      options: (f.options ?? []) as string[],
      masterSource: f.master_source,
      required: f.required,
      sort: f.sort,
    })),
  };
}

export async function getModuleRecords(
  supabase: SupabaseClient<Database>,
  moduleId: number,
): Promise<CustomRecord[]> {
  const { data } = await supabase
    .from("custom_records")
    .select("id, data, created_at")
    .eq("module_id", moduleId)
    .order("created_at", { ascending: false })
    .limit(2000);
  return (data ?? []).map((r) => ({
    id: r.id,
    data: (r.data ?? {}) as Record<string, unknown>,
    createdAt: r.created_at,
  }));
}

/** Opciones de todos los maestros referenciados por los campos del módulo. */
export async function getMasterOptionsForFields(
  supabase: SupabaseClient<Database>,
  fields: CustomField[],
): Promise<Record<string, MasterOption[]>> {
  const sources = [
    ...new Set(fields.filter((f) => f.type === "master" && f.masterSource).map((f) => f.masterSource!)),
  ];
  const out: Record<string, MasterOption[]> = {};
  await Promise.all(
    sources.map(async (s) => {
      out[s] = await fetchMasterOptions(supabase, s);
    }),
  );
  return out;
}

/** Módulos custom visibles para el listado del selector. */
export async function listCustomModules(
  supabase: SupabaseClient<Database>,
): Promise<CustomModule[]> {
  const { data } = await supabase
    .from("custom_modules")
    .select("id, key, name, description, icon, status, owner_id")
    .order("created_at", { ascending: false });
  return (data ?? []).map((m) => ({
    id: m.id,
    key: m.key,
    name: m.name,
    description: m.description,
    icon: m.icon,
    status: m.status as "draft" | "live",
    ownerId: m.owner_id,
  }));
}
