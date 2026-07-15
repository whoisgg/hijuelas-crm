import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Mesa de trabajo "invisible": un único escenario sandbox POR USUARIO donde
 * caen los movimientos del plano (siempre editable) sin tocar el plan real.
 * Se crea la primera vez y se reutiliza; el usuario nunca navega a él.
 *
 * Atómico: el índice único parcial `planner_scenarios_one_working_per_user`
 * (unique (created_by) where is_working) garantiza que dos renders concurrentes
 * —típico con el prefetch de Next— no puedan crear duplicados; el que pierde el
 * conflicto reutiliza el que ganó.
 */
const WORKING_NAME = "Mesa de trabajo";

export async function ensureWorkingScenario(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<{ id: number; name: string } | null> {
  const findMine = () =>
    supabase
      .from("planner_scenarios")
      .select("id, name")
      .eq("is_working", true)
      .eq("created_by", userId)
      .maybeSingle();

  const { data: existing } = await findMine();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from("planner_scenarios")
    .insert({
      name: WORKING_NAME,
      description: "Mesa de trabajo del planner (movimientos sobre el plano).",
      created_by: userId,
      status: "borrador",
      is_working: true,
    })
    .select("id, name")
    .single();

  // Conflicto con el índice único (otra render concurrente ganó): reutilizar.
  if (error || !created) {
    const { data: winner } = await findMine();
    return winner ?? null;
  }

  const { error: copyError } = await supabase.rpc(
    "planner_copy_lots_to_scenario",
    { p_scenario_id: created.id },
  );
  if (copyError) {
    // Liberar el cupo único para poder reintentar en el próximo load.
    await supabase.from("planner_scenarios").delete().eq("id", created.id);
    return null;
  }
  return created;
}
