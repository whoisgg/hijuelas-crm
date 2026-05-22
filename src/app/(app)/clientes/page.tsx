import { Users } from "lucide-react";
import { StubPage } from "@/components/stub-page";

export const metadata = { title: "Clientes" };

export default function ClientesPage() {
  return (
    <StubPage
      title="Clientes"
      description="Maestro deduplicado con contactos, direcciones y account owners."
      sprint="Sprint 2 — Clientes & Contactos"
      icon={Users}
      bullets={[
        "Listado con filtros + saved views (TanStack Table)",
        "Detalle con timeline de actividad",
        "Related lists: contratos, oportunidades, contactos",
        "Dedup por tax_id + fuzzy match en nombre",
      ]}
    />
  );
}
