import { FileText } from "lucide-react";
import { StubPage } from "@/components/stub-page";

export const metadata = { title: "Contratos" };

export default function ContratosPage() {
  return (
    <StubPage
      title="Contratos"
      description="Ciclo de vida completo: borrador → firmado → finalizado."
      sprint="Sprint 3 — Contratos & Amendments"
      icon={FileText}
      bullets={[
        "Header + items + amendments + versiones congeladas",
        "PathStepper con stages del contrato",
        "Related lists: pagos, entregas, items, adjuntos",
        "Saldo en moneda original y snapshot USD",
      ]}
    />
  );
}
