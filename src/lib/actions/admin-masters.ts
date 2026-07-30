"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { normalizeVarietyName } from "@/lib/planner/variety-programs";

/**
 * Datos maestros compartidos por todas las apps (CRM, Planner): especies,
 * variedades y programas genéticos. Solo admin escribe (la RLS *_admin_write
 * lo garantiza a nivel base; acá se valida además para dar errores claros).
 */

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (appUser?.role !== "admin" && !appUser?.is_platform_admin) {
    throw new Error("Solo admin puede editar maestros.");
  }
  return { supabase, userId: user.id };
}

// ── Especies ────────────────────────────────────────────────────────────────

export async function createMasterSpecies(input: {
  name: string;
  code: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireAdmin();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Nombre muy corto." };

  const { error } = await supabase.from("species").insert({
    name,
    code: input.code?.trim() || null,
    created_by: userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/maestros");
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function updateMasterSpecies(input: {
  id: string;
  name: string;
  code: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireAdmin();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Nombre muy corto." };

  const { error } = await supabase
    .from("species")
    .update({ name, code: input.code?.trim() || null, updated_by: userId })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/maestros");
  revalidatePath("/catalogo");
  return { ok: true };
}

// ── Variedades ──────────────────────────────────────────────────────────────

export async function createMasterVariety(input: {
  speciesId: string;
  name: string;
  geneticProgramId: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireAdmin();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Nombre muy corto." };

  const { error } = await supabase.from("varieties").insert({
    species_id: input.speciesId,
    name,
    genetic_program_id: input.geneticProgramId,
    created_by: userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/maestros");
  revalidatePath("/catalogo");
  return { ok: true };
}

export async function updateMasterVariety(input: {
  id: string;
  name: string;
  geneticProgramId: string | null;
  isActive: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireAdmin();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Nombre muy corto." };

  const { error } = await supabase
    .from("varieties")
    .update({
      name,
      genetic_program_id: input.geneticProgramId,
      is_active: input.isActive,
      updated_by: userId,
    })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/maestros");
  revalidatePath("/catalogo");
  return { ok: true };
}

// ── Programas genéticos ─────────────────────────────────────────────────────

export async function createMasterProgram(input: {
  name: string;
  owner: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireAdmin();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Nombre muy corto." };

  const { error } = await supabase.from("genetic_programs").insert({
    name,
    owner: input.owner?.trim() || null,
    created_by: userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/maestros");
  return { ok: true };
}

export async function updateMasterProgram(input: {
  id: string;
  name: string;
  owner: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase, userId } = await requireAdmin();
  const name = input.name.trim();
  if (name.length < 2) return { ok: false, error: "Nombre muy corto." };

  const { error } = await supabase
    .from("genetic_programs")
    .update({ name, owner: input.owner?.trim() || null, updated_by: userId })
    .eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/maestros");
  return { ok: true };
}

// ── Re-vinculación del planner ──────────────────────────────────────────────

/**
 * Vuelve a correr el match planner ↔ maestros (mismo criterio de la migración
 * 00045): vincula catálogos del planner aún sin master_*_id cuyo nombre
 * normalizado calce con un maestro (variedades solo si el nombre es único).
 * Útil después de completar los maestros con variedades que faltaban.
 */
export async function relinkPlannerCatalogs(): Promise<{
  ok: boolean;
  speciesLinked?: number;
  varietiesLinked?: number;
  error?: string;
}> {
  const { supabase } = await requireAdmin();

  const [pSpecies, mSpecies, pVarieties, mVarieties] = await Promise.all([
    supabase.from("planner_species").select("id, name, master_species_id"),
    supabase.from("species").select("id, name").is("deleted_at", null),
    supabase.from("planner_varieties").select("id, name, master_variety_id").limit(2000),
    supabase.from("varieties").select("id, name").is("deleted_at", null).limit(2000),
  ]);

  const speciesByName = new Map(
    (mSpecies.data ?? []).map((s) => [normalizeVarietyName(s.name), s.id]),
  );
  let speciesLinked = 0;
  for (const ps of pSpecies.data ?? []) {
    if (ps.master_species_id) continue;
    const masterId = speciesByName.get(normalizeVarietyName(ps.name));
    if (!masterId) continue;
    const { error } = await supabase
      .from("planner_species")
      .update({ master_species_id: masterId })
      .eq("id", ps.id);
    if (!error) speciesLinked++;
  }

  // Variedades: solo nombres normalizados únicos entre los maestros.
  const nameCount = new Map<string, number>();
  for (const v of mVarieties.data ?? []) {
    const n = normalizeVarietyName(v.name);
    nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
  }
  const varietyByName = new Map(
    (mVarieties.data ?? [])
      .filter((v) => nameCount.get(normalizeVarietyName(v.name)) === 1)
      .map((v) => [normalizeVarietyName(v.name), v.id]),
  );
  let varietiesLinked = 0;
  for (const pv of pVarieties.data ?? []) {
    if (pv.master_variety_id) continue;
    const masterId = varietyByName.get(normalizeVarietyName(pv.name));
    if (!masterId) continue;
    const { error } = await supabase
      .from("planner_varieties")
      .update({ master_variety_id: masterId })
      .eq("id", pv.id);
    if (!error) varietiesLinked++;
  }

  revalidatePath("/admin/maestros");
  revalidatePath("/planner/maestros");
  revalidatePath("/planner/lotes");
  return { ok: true, speciesLinked, varietiesLinked };
}

/**
 * Vincula UNA variedad del planner a los maestros, desde donde se detecta el
 * problema (ej. el aviso "variedad sin vínculo" en /planner/movimientos) en vez
 * de obligar a ir a /admin/maestros y correr la re-vinculación completa.
 *
 * Reusa el maestro si ya existe uno con el mismo nombre normalizado dentro de la
 * especie (no duplica); solo crea cuando no hay. Si hay más de un candidato
 * (caso "Tonda" → Giffoni/Pacifica) no adivina y pide resolverlo a mano.
 */
export type VarietyMergeCandidate = { id: string; name: string; contractItems: number };

export async function linkPlannerVarietyToMasters(plannerVarietyId: number): Promise<{
  ok: boolean;
  action?: "vinculada" | "creada";
  varietyName?: string;
  speciesName?: string;
  error?: string;
  /** presente solo cuando hay >1 maestro con ese nombre — elegir cuál mantener
   *  (contractItems ayuda a decidir) y llamar mergeMasterVarieties antes de reintentar. */
  candidates?: VarietyMergeCandidate[];
}> {
  const { supabase, userId } = await requireAdmin();

  const { data: pv } = await supabase
    .from("planner_varieties")
    .select("id, name, master_variety_id, planner_species(name, master_species_id)")
    .eq("id", plannerVarietyId)
    .maybeSingle();
  if (!pv) return { ok: false, error: "No se encontró la variedad del planner." };
  if (pv.master_variety_id) return { ok: false, error: "Ya estaba vinculada." };

  const pSpecies = pv.planner_species as unknown as {
    name: string;
    master_species_id: string | null;
  } | null;
  if (!pSpecies) return { ok: false, error: "La variedad no tiene especie en el planner." };

  // Especie maestra: por el vínculo si existe, si no por nombre normalizado.
  let masterSpeciesId = pSpecies.master_species_id;
  if (!masterSpeciesId) {
    const { data: allSpecies } = await supabase
      .from("species")
      .select("id, name")
      .is("deleted_at", null);
    const target = normalizeVarietyName(pSpecies.name);
    const hits = (allSpecies ?? []).filter((s) => normalizeVarietyName(s.name) === target);
    if (hits.length !== 1) {
      return {
        ok: false,
        error: `La especie "${pSpecies.name}" no está vinculada a maestros. Vincúlala primero en Administración → Datos maestros.`,
      };
    }
    masterSpeciesId = hits[0].id;
  }

  // ¿Ya existe un maestro con ese nombre en esa especie? Entonces solo vincular.
  const { data: candidates } = await supabase
    .from("varieties")
    .select("id, name")
    .eq("species_id", masterSpeciesId)
    .is("deleted_at", null)
    .limit(2000);
  const target = normalizeVarietyName(pv.name);
  const matches = (candidates ?? []).filter((v) => normalizeVarietyName(v.name) === target);

  if (matches.length > 1) {
    const candidates: VarietyMergeCandidate[] = await Promise.all(
      matches.map(async (m) => {
        const { count } = await supabase
          .from("contract_items")
          .select("id", { count: "exact", head: true })
          .eq("variety_id", m.id);
        return { id: m.id, name: m.name, contractItems: count ?? 0 };
      }),
    );
    return {
      ok: false,
      error: `Hay ${matches.length} variedades maestras llamadas "${pv.name}" en ${pSpecies.name}. Elegí cuál mantener.`,
      candidates,
    };
  }

  let masterVarietyId: string;
  let action: "vinculada" | "creada";
  if (matches.length === 1) {
    masterVarietyId = matches[0].id;
    action = "vinculada";
  } else {
    const { data: created, error: insertError } = await supabase
      .from("varieties")
      .insert({ species_id: masterSpeciesId, name: pv.name.trim(), created_by: userId })
      .select("id")
      .single();
    if (insertError || !created) {
      return { ok: false, error: insertError?.message ?? "No se pudo crear la variedad." };
    }
    masterVarietyId = created.id;
    action = "creada";
  }

  const { error: linkError } = await supabase
    .from("planner_varieties")
    .update({ master_variety_id: masterVarietyId })
    .eq("id", pv.id);
  if (linkError) return { ok: false, error: linkError.message };

  revalidatePath("/admin/maestros");
  revalidatePath("/planner/maestros");
  revalidatePath("/planner/lotes");
  revalidatePath("/planner/movimientos");
  revalidatePath("/catalogo");
  return { ok: true, action, varietyName: pv.name, speciesName: pSpecies.name };
}

/**
 * Fusiona variedades maestras duplicadas (mismo nombre normalizado, ej.
 * "Eureka Sunrise" vs "Eureka sunrise"): reasigna toda referencia real
 * (contratos, oportunidades, calendario, vínculos del planner) a `keepId` y
 * da de baja las demás (deleted_at, no hard delete — puede haber historial).
 * Llamar antes de reintentar linkPlannerVarietyToMasters cuando esa acción
 * devuelve `candidates` (>1 maestro con el mismo nombre).
 */
export async function mergeMasterVarieties(input: {
  keepId: string;
  mergeIds: string[];
}): Promise<{ ok: boolean; error?: string }> {
  const { supabase } = await requireAdmin();
  const mergeIds = input.mergeIds.filter((id) => id !== input.keepId);
  if (!mergeIds.length) return { ok: false, error: "Nada que fusionar." };

  for (const table of ["contract_items", "opportunity_items", "calendar_events"] as const) {
    const { error } = await supabase
      .from(table)
      .update({ variety_id: input.keepId })
      .in("variety_id", mergeIds);
    if (error) return { ok: false, error: error.message };
  }
  const { error: plannerError } = await supabase
    .from("planner_varieties")
    .update({ master_variety_id: input.keepId })
    .in("master_variety_id", mergeIds);
  if (plannerError) return { ok: false, error: plannerError.message };

  const { error: deleteError } = await supabase
    .from("varieties")
    .update({ deleted_at: new Date().toISOString() })
    .in("id", mergeIds);
  if (deleteError) return { ok: false, error: deleteError.message };

  revalidatePath("/admin/maestros");
  revalidatePath("/planner/maestros");
  revalidatePath("/planner/lotes");
  revalidatePath("/catalogo");
  return { ok: true };
}
