import { BarChart3 } from "lucide-react";
import { StubPage } from "@/components/stub-page";

export const metadata = { title: "Reportes" };

export default function ReportesPage() {
  return (
    <StubPage
      title="Reportes"
      description="Por especie, por país, forecast y goals."
      sprint="Sprint 6 — Vistas Analíticas"
      icon={BarChart3}
      bullets={[
        "Por especie/variedad: inventario comprometido + royalty",
        "Por país: # plantas, USD, YoY",
        "Forecast: contratos firmados + pipeline ponderado",
        "Export a Excel y compartir snapshot",
      ]}
    />
  );
}
