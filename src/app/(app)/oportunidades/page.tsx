import { Briefcase } from "lucide-react";
import { StubPage } from "@/components/stub-page";

export const metadata = { title: "Oportunidades" };

export default function OportunidadesPage() {
  return (
    <StubPage
      title="Oportunidades"
      description="Pipeline kanban con conversión a contrato al ganar."
      sprint="Sprint 5 — Oportunidades de Negocio"
      icon={Briefcase}
      bullets={[
        "Kanban drag & drop por stage",
        "Items tentativos con semanas de entrega estimadas",
        "Conversión Oportunidad → Contrato (wizard)",
        "Probabilidad ponderada para forecast",
      ]}
    />
  );
}
