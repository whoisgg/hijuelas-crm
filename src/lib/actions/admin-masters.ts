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
