import { Sprout } from "lucide-react";
import { StubPage } from "@/components/stub-page";

export const metadata = { title: "Catálogo" };

export default function CatalogoPage() {
  return (
    <StubPage
      title="Catálogo"
      description="Especies, variedades y programas genéticos."
      sprint="Sprint 1 — Catálogos & Importador"
      icon={Sprout}
      bullets={[
        "Especies: arándano, frambuesa, cítricos, etc.",
        "Variedades por especie con royalty por planta",
        "Programas genéticos (MBO, Fall Creek, Driscolls...)",
        "Importador del Excel BBDD ventas.xlsx",
      ]}
    />
  );
}
