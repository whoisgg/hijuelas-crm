"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireModuleAccess } from "@/lib/access";

/**
 * Productos del módulo Bodega e Insumos (port de Ventory, optimizado):
 * el stock NO se edita acá — es calculado por las vistas
 * bodega_stock_disponible / bodega_stock_por_bodega a partir de
 * ingresos y salidas. El código GHPROD-xxxxxx lo asigna un trigger.
 */

const productoSchema = z.object({
  nombre_prod: z.string().min(2, "Mínimo 2 caracteres").max(255),
  descripcion: z.string().max(2000).optional().or(z.literal("").transform(() => undefined)),
  categoria: z.string().max(100).optional().or(z.literal("").transform(() => undefined)),
  unidad_medida: z.string().max(50).optional().or(z.literal("").transform(() => undefined)),
  stock_minimo: z.number().min(0).max(999999999),
  tipo_inventario: z.string().max(100).optional().or(z.literal("").transform(() => undefined)),
  cuenta_contable: z.string().max(50).optional().or(z.literal("").transform(() => undefined)),
});

export type BodegaProductoInput = z.input<typeof productoSchema>;

export async function createBodegaProducto(
  input: BodegaProductoInput,
): Promise<{ ok: true; codigo: string } | { ok: false; message: string }> {
  try {
    const parsed = productoSchema.parse(input);
    const { supabase, userId } = await requireModuleAccess("bodega", "editor");
    const { data, error } = await supabase
      .from("bodega_productos")
      .insert({ ...parsed, created_by: userId })
      .select("codigo_producto")
      .single();
    if (error) return { ok: false, message: error.message };
    revalidatePath("/bodega/productos");
    revalidatePath("/bodega");
    return { ok: true, codigo: data.codigo_producto };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}

export async function updateBodegaProducto(
  id: string,
  input: BodegaProductoInput & { activo: boolean },
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const parsed = productoSchema.parse(input);
    const { supabase } = await requireModuleAccess("bodega", "editor");
    const { error } = await supabase
      .from("bodega_productos")
      .update({ ...parsed, activo: input.activo, updated_at: new Date().toISOString() })
      .eq("id", id);
    if (error) return { ok: false, message: error.message };
    revalidatePath("/bodega/productos");
    revalidatePath("/bodega");
    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "Error desconocido" };
  }
}
