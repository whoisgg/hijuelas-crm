import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  ClipboardList,
  Package,
} from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Bodega" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  {
    icon: Package,
    title: "Productos",
    href: "/bodega/productos",
    description:
      "Catálogo de insumos con stock calculado, mínimos y estado de reposición.",
  },
  {
    icon: ArrowDownToLine,
    title: "Ingresos",
    href: null,
    description: "Recepciones de compra por bodega y proveedor. Próximamente (fase 2).",
  },
  {
    icon: ArrowUpFromLine,
    title: "Salidas",
    href: null,
    description: "Consumos por área de destino. Próximamente (fase 2).",
  },
  {
    icon: ArrowRightLeft,
    title: "Traspasos",
    href: null,
    description: "Movimientos entre bodegas con validación de stock. Próximamente (fase 3).",
  },
  {
    icon: ClipboardList,
    title: "Solicitudes",
    href: null,
    description: "Pedidos de las áreas con workflow de despacho. Próximamente (fase 3).",
  },
];

export default async function BodegaPage() {
  const supabase = await createClient();
  const profile = await getAccessProfile(supabase);
  if (!profile) redirect("/login");
  if (!hasModuleAccess(profile, "bodega")) redirect("/apps");

  const [{ data: stock }, ingresosSemana, salidasSemana] = await Promise.all([
    supabase
      .from("bodega_stock_disponible")
      .select("estado_stock")
      .limit(5000),
    supabase
      .from("bodega_ingresos")
      .select("id", { count: "exact", head: true })
      .gte("fecha_ingreso", isoDaysAgo(7)),
    supabase
      .from("bodega_salidas")
      .select("id", { count: "exact", head: true })
      .gte("fecha_salida", isoDaysAgo(7)),
  ]);

  const rows = stock ?? [];
  const urgente = rows.filter((r) => r.estado_stock === "urgente").length;
  const bajo = rows.filter((r) => r.estado_stock === "bajo").length;

  const kpis = [
    { label: "Productos activos", value: rows.length },
    { label: "Sin stock (urgente)", value: urgente, alert: urgente > 0 },
    { label: "Stock bajo", value: bajo, warn: bajo > 0 },
    {
      label: "Movimientos últimos 7 días",
      value: (ingresosSemana.count ?? 0) + (salidasSemana.count ?? 0),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Bodega e Insumos"
        description="Inventario de insumos — stock calculado desde ingresos y salidas."
      />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p
              className={
                "mt-0.5 text-2xl font-semibold tabular-nums" +
                ("alert" in k && k.alert
                  ? " text-red-600 dark:text-red-400"
                  : "warn" in k && k.warn
                    ? " text-amber-600 dark:text-amber-400"
                    : "")
              }
            >
              {k.value.toLocaleString("es-CL")}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map((item) => {
          const Icon = item.icon;
          const card = (
            <Card
              key={item.title}
              className={item.href ? "transition-colors hover:border-primary/40" : "opacity-70"}
            >
              <CardHeader className="flex flex-row items-center gap-3 space-y-0">
                <Icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">
                  {item.title}
                  {!item.href ? (
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      próximamente
                    </span>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {item.description}
              </CardContent>
            </Card>
          );
          return item.href ? (
            <Link key={item.title} href={item.href}>
              {card}
            </Link>
          ) : (
            card
          );
        })}
      </div>
    </AppShell>
  );
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}
