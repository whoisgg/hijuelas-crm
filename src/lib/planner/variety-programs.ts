import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Cruce planner ↔ maestros del CRM: el programa genético vive en las tablas
 * compartidas `varieties` → `genetic_programs`. Desde la migración 00045,
 * `planner_varieties.master_variety_id` referencia la variedad maestra; para
 * lo aún no vinculado se cae al match por nombre normalizado (minúsculas,
 * sin acentos, sin el prefijo "Cutting ").
 */

const ACCENTS: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ñ: "n", ü: "u",
};

export function normalizeVarietyName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[áéíóúñü]/g, (c) => ACCENTS[c] ?? c)
    .replace(/^cutting /, "");
}

/** id de planner_varieties → nombre del programa genético (FK primero, luego nombre) */
export async function getProgramByPlannerVarietyId(
  supabase: SupabaseClient<Database>,
): Promise<Map<number, string>> {
  const [plannerRes, masterRes] = await Promise.all([
    supabase.from("planner_varieties").select("id, name, master_variety_id").limit(2000),
    supabase
      .from("varieties")
      .select("id, name, genetic_programs(name)")
      .is("deleted_at", null)
      .limit(2000),
  ]);

  const programByMasterId = new Map<string, string>();
  const programByName = new Map<string, string>();
  for (const v of masterRes.data ?? []) {
    const program = (v.genetic_programs as unknown as { name: string } | null)?.name;
    if (!program) continue;
    programByMasterId.set(v.id, program);
    programByName.set(normalizeVarietyName(v.name), program);
  }

  const map = new Map<number, string>();
  for (const pv of plannerRes.data ?? []) {
    const program =
      (pv.master_variety_id ? programByMasterId.get(pv.master_variety_id) : undefined) ??
      programByName.get(normalizeVarietyName(pv.name));
    if (program) map.set(pv.id, program);
  }
  return map;
}
