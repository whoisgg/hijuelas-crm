import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarRange, FileUp, Layers, Map } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTimelineData } from "@/lib/planner/occupancy-data";

export const metadata = { title: "Planner" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

const MODULES = [
  {
    icon: FileUp,
    title: "Carga de archivos",
    href: "/planner/carga",
    description:
      "Importa el Vivero Planner y el snapshot de Hotelería. Los maestros persisten; cantidades y fechas se actualizan con cada carga.",
  },
  {
    icon: CalendarRange,
    title: "Ocupación",
    href: "/planner/ocupacion",
    description:
      "Ocupación por área y semana, multi-año. Alertas cuando la utilización supera el máximo configurado.",
  },
  {
    icon: Map,
    title: "Layout por sector",
    href: "/planner/ocupacion",
    description:
      "Clic en una celda de Ocupación abre el plano físico del sector: cada mesón con su ocupación real, lados y filas según nomenclatura.",
  },
  {
    icon: Layers,
    title: "Lotes",
    href: "/planner/lotes",
    description:
      "Las 314 asignaciones planificadas. Edita plantas, semanas o estado y la ocupación se recalcula.",
  },
];

export default async function PlannerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!appUser?.role || !PLANNER_ROLES.has(appUser.role)) {
    redirect("/dashboard");
  }

  const [timeline, lots, speciesCount, lastUpload] = await Promise.all([
    getTimelineData(supabase),
    supabase.from("planner_lots").select("plants", { count: "exact" }),
    supabase.from("planner_species").select("id", { count: "exact", head: true }),
    supabase
      .from("planner_uploads")
      .select("created_at")
      .eq("status", "applied")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  const totalPlants = (lots.data ?? []).reduce((acc, l) => acc + (l.plants ?? 0), 0);

  const alertWeeks = (timeline?.weeks ?? []).filter((w) =>
    (timeline?.areas ?? []).some((a) => {
      const t = w.occupied[String(a.id)] ?? 0;
      return a.capacityTrays > 0 && t / a.capacityTrays >= (timeline?.maxUtilization ?? 0.95);
    }),
  ).length;

  const kpis = [
    { label: "Lotes planificados", value: lots.count ?? 0 },
    { label: "Plantas", value: totalPlants },
    { label: "Especies", value: speciesCount.count ?? 0 },
    { label: "Semanas en alerta", value: alertWeeks, alert: alertWeeks > 0 },
  ];

  return (
    <AppShell>
      <PageHeader
        title="Planner"
        description="Planificación de producción del vivero — ocupación, capacidad y lotes."
        badge={
          lastUpload.data?.created_at
            ? `Última carga: ${new Date(lastUpload.data.created_at).toLocaleDateString("es-CL", { day: "2-digit", month: "short" })}`
            : undefined
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-lg border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">{k.label}</p>
            <p
              className={
                "mt-0.5 text-2xl font-semibold tabular-nums" +
                ("alert" in k && k.alert ? " text-red-600 dark:text-red-400" : "")
              }
            >
              {k.value.toLocaleString("es-CL")}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((item) => {
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
