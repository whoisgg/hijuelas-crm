import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Maestros compartidos que un módulo config-driven puede referenciar (campo
 * tipo "master"). Solo lectura desde los módulos — la edición vive en cada
 * módulo dueño del maestro.
 */
export type MasterSource = {
  key: string;
  label: string;
  table: string;
  labelColumn: string;
};

export const MASTERS: MasterSource[] = [
  { key: "especies", label: "Especies", table: "planner_species", labelColumn: "name" },
  { key: "areas", label: "Áreas / Cuarteles", table: "planner_areas", labelColumn: "name" },
  { key: "personas", label: "Personas (usuarios)", table: "app_users", labelColumn: "full_name" },
];

export function masterByKey(key: string | null | undefined): MasterSource | null {
  return MASTERS.find((m) => m.key === key) ?? null;
}

export type MasterOption = { id: string; label: string };

export async function fetchMasterOptions(
  supabase: SupabaseClient<Database>,
  key: string,
): Promise<MasterOption[]> {
  const master = masterByKey(key);
  if (!master) return [];
  const { data } = await supabase
    // el registro de maestros valida la tabla; el tipo se relaja a propósito
    .from(master.table as never)
    .select(`id, ${master.labelColumn}`)
    .limit(1000);
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      id: String(r.id),
      label: String(r[master.labelColumn] ?? r.id),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}
