import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  BodegaProductosTable,
  type BodegaStockRow,
} from "@/components/bodega/productos-table";

export const metadata = { title: "Productos de bodega" };
export const dynamic = "force-dynamic";

export default async function BodegaProductosPage() {
  const supabase = await createClient();
  const profile = await getAccessProfile(supabase);
  if (!profile) redirect("/login");
  if (!hasModuleAccess(profile, "bodega")) redirect("/apps");

  const [{ data: stock }, { data: productos }, { data: unidades }] = await Promise.all([
    supabase
      .from("bodega_stock_disponible")
      .select(
        "id, codigo_producto, nombre_prod, descripcion, categoria, tipo_inventario, unidad_medida, stock_minimo, total_ingresos, total_salidas, stock_disponible, estado_stock",
      )
      .limit(5000),
    supabase
      .from("bodega_productos")
      .select("id, codigo_producto, activo, cuenta_contable")
      .limit(5000),
    supabase
      .from("bodega_unidades")
      .select("nombre")
      .eq("activo", true)
      .order("nombre"),
  ]);

  // La vista solo trae activos; el join con la tabla agrega cuenta contable.
  const extraByCodigo = new Map(
    (productos ?? []).map((p) => [p.codigo_producto, p]),
  );
  const rows: BodegaStockRow[] = (stock ?? []).map((r) => ({
    id: (r.id as string | null) ?? r.codigo_producto ?? "",
    codigo: r.codigo_producto ?? "",
    nombre: r.nombre_prod ?? "",
    descripcion: r.descripcion,
    categoria: r.categoria,
    tipoInventario: r.tipo_inventario,
    unidad: r.unidad_medida,
    stockMinimo: r.stock_minimo ?? 0,
    ingresos: r.total_ingresos ?? 0,
    salidas: r.total_salidas ?? 0,
    disponible: r.stock_disponible ?? 0,
    estado: r.estado_stock ?? "suficiente",
    cuentaContable: extraByCodigo.get(r.codigo_producto ?? "")?.cuenta_contable ?? null,
  }));

  const canEdit = hasModuleAccess(profile, "bodega", "editor");

  return (
    <AppShell>
      <PageHeader
        title="Productos"
        description="Catálogo de insumos de bodega. El stock se calcula desde ingresos y salidas."
      />
      <div className="mt-6">
        <BodegaProductosTable
          rows={rows}
          unidades={(unidades ?? []).map((u) => u.nombre)}
          canEdit={canEdit}
        />
      </div>
    </AppShell>
  );
}
