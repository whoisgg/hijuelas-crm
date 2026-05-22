import { Share2 } from "lucide-react";
import { StubPage } from "@/components/stub-page";

export const metadata = { title: "Compartir" };

export default function CompartirPage() {
  return (
    <StubPage
      title="Compartir"
      description="Gestión de share links activos con auditoría de aperturas."
      sprint="Sprint 7 — Sharing & Colaboración"
      icon={Share2}
      bullets={[
        "Tokens públicos con scope (cliente/contrato/calendario/mapa)",
        "Password opcional + expiración",
        "Log de aperturas (IP, user agent)",
        "Comentarios threaded + menciones",
      ]}
    />
  );
}
