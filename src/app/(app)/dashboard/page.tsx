import { LayoutDashboard } from "lucide-react";
import { StubPage } from "@/components/stub-page";

export const metadata = { title: "Dashboard" };

export default function DashboardPage() {
  return (
    <StubPage
      title="Dashboard"
      description="KPIs personales: tareas pendientes, pipeline value, top clientes y variedades."
      sprint="Sprint 6 — Vistas Analíticas"
      icon={LayoutDashboard}
      bullets={[
        "Plantas comprometidas vs entregadas vs pendientes",
        "Pipeline ponderado por probabilidad",
        "Top 10 clientes y variedades",
        "Tareas pendientes y notificaciones del usuario",
      ]}
    />
  );
}
