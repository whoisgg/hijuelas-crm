"use server";

import { revalidatePath } from "next/cache";

import { requireModuleAccess } from "@/lib/access";
import { parsePlannerWorkbook } from "@/lib/planner/parse-planner";
import { parseHoteleriaWorkbook } from "@/lib/planner/parse-hoteleria";
import { parseInventarioWorkbook } from "@/lib/planner/parse-inventario";
import {
  applyHoteleriaCore,
  applyPlannerCore,
  previewHoteleriaCore,
  previewPlannerCore,
  type ImportSummary,
} from "@/lib/planner/import-core";
import {
  applyInventarioCore,
  previewInventarioCore,
} from "@/lib/planner/import-inventario";

export type { ImportSummary } from "@/lib/planner/import-core";

export type UploadRow = {
  id: string;
  kind: string;
  file_name: string;
  status: string;
  stats: Record<string, number>;
  warnings: string[];
  created_at: string;
  uploaded_by_name: string | null;
};

async function requireAccess() {
  return requireModuleAccess("planner", "editor");
}

async function fileFromForm(
  formData: FormData,
): Promise<{ name: string; buffer: Buffer }> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No se recibió el archivo.");
  const buffer = Buffer.from(await file.arrayBuffer());
  return { name: file.name, buffer };
}

function revalidatePlanner() {
  revalidatePath("/planner");
  revalidatePath("/planner/carga");
}

/**
 * ⚠️ NO EXPUESTAS EN LA UI (decisión del usuario, 2026-07-27).
 *
 * La carga del "Vivero Planner" se retiró de /planner/carga porque en la
 * práctica nunca se vuelve a subir y aplicarla es DESTRUCTIVO: `applyPlannerCore`
 * hace `delete()` de toda `planner_demand` y toda `planner_lots` antes de
 * reinsertar desde el Excel, y `applyPlannerImport` borra además todas las mesas
 * de trabajo (`planner_scenarios.is_working`). Con los datos de hoy eso
 * significa perder 314 lotes / 21,1M plantas y el trabajo sin aprobar de todos.
 *
 * El plan se mantiene dentro de la app (edición de lotes, mesa de trabajo,
 * simulaciones). Estas funciones quedan para un re-baseline deliberado; si se
 * vuelven a exponer, hacerlo solo para admin y con confirmación explícita de que
 * reemplazan el plan completo.
 *
 * Ojo con el efecto lateral: los maestros del planner (áreas, especies,
 * variedades y el CALENDARIO) venían de este Excel. Como ya no se re-importa,
 * hay que mantenerlos por migración o desde la app — de hecho el calendario
 * quedó corto en 53 semanas y hubo que extenderlo así (migración 00052).
 */
export async function previewPlannerImport(formData: FormData): Promise<ImportSummary> {
  const { supabase } = await requireAccess();
  const { name, buffer } = await fileFromForm(formData);
  return previewPlannerCore(supabase, parsePlannerWorkbook(buffer), name);
}

export async function applyPlannerImport(formData: FormData): Promise<ImportSummary> {
  const { supabase, userId } = await requireAccess();
  const { name, buffer } = await fileFromForm(formData);
  const result = await applyPlannerCore(supabase, parsePlannerWorkbook(buffer), name, userId);
  if (result.ok) {
    // Re-sync de las mesas de trabajo: el plan cambió, así que los sandbox
    // por usuario quedarían obsoletos. Se eliminan (cascade borra lotes y
    // pins) y el próximo load los recrea como copia fresca del plan nuevo.
    const { count } = await supabase
      .from("planner_scenarios")
      .delete({ count: "exact" })
      .eq("is_working", true);
    if (count) {
      result.warnings.push(
        `${count} ${count === 1 ? "mesa de trabajo re-sincronizada" : "mesas de trabajo re-sincronizadas"} con el plan nuevo — los movimientos sin aprobar se descartaron.`,
      );
    }
    revalidatePlanner();
  }
  return result;
}

export async function previewInventarioImport(formData: FormData): Promise<ImportSummary> {
  const { supabase } = await requireAccess();
  const { name, buffer } = await fileFromForm(formData);
  return previewInventarioCore(supabase, parseInventarioWorkbook(buffer), name);
}

export async function applyInventarioImport(formData: FormData): Promise<ImportSummary> {
  const { supabase, userId } = await requireAccess();
  const { name, buffer } = await fileFromForm(formData);
  const result = await applyInventarioCore(
    supabase,
    parseInventarioWorkbook(buffer),
    name,
    userId,
  );
  if (result.ok) revalidatePlanner();
  return result;
}

export async function previewHoteleriaImport(formData: FormData): Promise<ImportSummary> {
  const { supabase } = await requireAccess();
  const { name, buffer } = await fileFromForm(formData);
  return previewHoteleriaCore(supabase, parseHoteleriaWorkbook(buffer), name);
}

export async function applyHoteleriaImport(formData: FormData): Promise<ImportSummary> {
  const { supabase, userId } = await requireAccess();
  const { name, buffer } = await fileFromForm(formData);
  const result = await applyHoteleriaCore(
    supabase,
    parseHoteleriaWorkbook(buffer),
    name,
    userId,
  );
  if (result.ok) revalidatePlanner();
  return result;
}

export async function listPlannerUploads(): Promise<UploadRow[]> {
  const { supabase } = await requireAccess();
  const { data } = await supabase
    .from("planner_uploads")
    .select(
      "id, kind, file_name, status, stats, warnings, created_at, app_users(full_name)",
    )
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).map((u) => ({
    id: u.id,
    kind: u.kind,
    file_name: u.file_name,
    status: u.status,
    stats: (u.stats ?? {}) as Record<string, number>,
    warnings: (u.warnings ?? []) as string[],
    created_at: u.created_at,
    uploaded_by_name:
      (u.app_users as unknown as { full_name: string | null } | null)?.full_name ?? null,
  }));
}
