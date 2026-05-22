import { Calendar } from "lucide-react";
import { StubPage } from "@/components/stub-page";

export const metadata = { title: "Calendario" };

export default function CalendarioPage() {
  return (
    <StubPage
      title="Calendario"
      description="Vista de entregas semana/mes/año con toggle de oportunidades."
      sprint="Sprint 6 — Vistas Analíticas"
      icon={Calendar}
      bullets={[
        "Vistas semana / mes / año (FullCalendar)",
        "Drag-to-reschedule de entregas",
        "Toggle para incluir oportunidades abiertas",
        "Filtros por stage, owner y probabilidad mínima",
      ]}
    />
  );
}
