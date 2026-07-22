import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Cruce planner ↔ maestros del CRM: el programa genético vive en las tablas
 * compartidas `varieties` → `genetic_programs` (no en `planner_varieties`),
 * así que se resuelve por nombre de variedad normalizado (minúsculas, sin
 * acentos, sin el prefijo "Cutting "). Lo que no matchea queda sin programa.
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

/** nombre de variedad normalizado → nombre del programa genético */
export async function getVarietyProgramMap(
  supabase: SupabaseClient<Database>,
): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("varieties")
    .select("name, genetic_programs(name)")
    .is("deleted_at", null)
    .limit(2000);

  const map = new Map<string, string>();
  for (const v of data ?? []) {
    const program = (v.genetic_programs as unknown as { name: string } | null)?.name;
    if (program) map.set(normalizeVarietyName(v.name), program);
  }
  return map;
}
