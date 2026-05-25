import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  ChevronRight,
  Globe2,
  LineChart,
  ListChecks,
  Sprout,
  TrendingDown,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Reportes" };

type Report = {
  title: string;
  description: string;
  icon: LucideIcon;
  href?: string;
  sprint?: string;
  available: boolean;
};

const REPORTS: Report[] = [
  {
    title: "Mapa mundial",
    description:
      "Distribución geográfica de plantas y revenue. Toggle de oportunidades ponderadas.",
    icon: Globe2,
    href: "/mapa",
    available: true,
  },
  {
    title: "Calendario de entregas",
    description:
      "Vista temporal por semana, mes o año con eventos de contratos y pipeline.",
    icon: Calendar,
    href: "/calendario",
    available: true,
  },
  {
    title: "Catálogo de variedades",
    description:
      "Stats por especie/variedad: comprometidas, entregadas y tendencia YoY.",
    icon: Sprout,
    href: "/catalogo",
    available: true,
  },
  {
    title: "Forecast comercial",
    description:
      "Curvas de pipeline, escenarios y goals por owner. Comparación contra meta.",
    icon: LineChart,
    sprint: "Sprint 9",
    available: false,
  },
  {
    title: "Win / Loss analysis",
    description:
      "Razones de oportunidades ganadas y perdidas, segmentadas por owner / país.",
    icon: TrendingDown,
    sprint: "Sprint 9",
    available: false,
  },
  {
    title: "Reportes ad-hoc",
    description:
      "Constructor de reportes guardados con export a Excel y compartir snapshot.",
    icon: ListChecks,
    sprint: "Sprint 10",
    available: false,
  },
];

export default function ReportesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <PageHeader
        title="Reportes"
        description="Vistas analíticas y reportes guardados. Más reportes vienen en sprints futuros."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const card = (
            <Card
              className={
                r.available
                  ? "transition-colors hover:bg-muted/30"
                  : "opacity-60"
              }
            >
              <CardHeader className="flex flex-row items-start gap-3 space-y-0">
                <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon className="size-4" />
                </div>
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {r.title}
                    {!r.available && r.sprint ? (
                      <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                        {r.sprint}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground">{r.description}</p>
                </div>
                {r.available ? (
                  <ChevronRight className="ml-auto size-4 text-muted-foreground" />
                ) : null}
              </CardHeader>
              <CardContent className="pb-3 pt-0">
                {r.available ? (
                  <span className="text-xs font-medium text-primary">Abrir reporte</span>
                ) : (
                  <span className="text-xs text-muted-foreground">Próximamente</span>
                )}
              </CardContent>
            </Card>
          );
          if (r.available && r.href) {
            return (
              <Link key={r.title} href={r.href} className="block">
                {card}
              </Link>
            );
          }
          return <div key={r.title}>{card}</div>;
        })}
      </div>
    </div>
  );
}
