import { Map } from "lucide-react";
import { StubPage } from "@/components/stub-page";

export const metadata = { title: "Mapa Mundial" };

export default function MapaPage() {
  return (
    <StubPage
      title="Mapa Mundial"
      description="Burbujas por país con # plantas comprometidas y USD."
      sprint="Sprint 6 — Vistas Analíticas"
      icon={Map}
      bullets={[
        "react-simple-maps + d3-geo",
        "Burbujas escaladas por # plantas o USD",
        "Toggle para incluir oportunidades ponderadas",
        "Drilldown al hacer clic en un país",
      ]}
    />
  );
}
