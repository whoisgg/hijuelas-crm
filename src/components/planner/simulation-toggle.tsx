"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Simulation } from "@/lib/planner/simulation";

/**
 * Control de simulación en Ocupación: el checkbox suma TODAS las simulaciones
 * cargables (estado "En evaluación" o "Confirmada"); el texto es el link al
 * Simulador. El detalle (cuántas, cuántas bandejas) vive en el tooltip.
 */
export function SimulationToggle({
  checked,
  simulations,
}: {
  checked: boolean;
  simulations: Simulation[];
}) {
  const router = useRouter();
  const loadable = simulations.filter((s) => s.loadable);
  const trays = loadable.reduce((sum, s) => sum + s.trays, 0);

  return (
    <div className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        aria-label="Incluir simulación"
        checked={checked && loadable.length > 0}
        disabled={!loadable.length}
        onChange={(e) =>
          router.push(e.target.checked ? "/planner/ocupacion?sim=1" : "/planner/ocupacion")
        }
        title={
          loadable.length
            ? `Suma ${trays.toLocaleString("es-CL")} bandejas de ${loadable.length} ${loadable.length === 1 ? "simulación" : "simulaciones"} al plan.`
            : "No hay simulaciones cargables — muévelas a «En evaluación» o «Confirmada» en el Simulador."
        }
        className={cn(
          "h-4 w-4 accent-[#185FA5]",
          loadable.length ? "cursor-pointer" : "cursor-not-allowed opacity-60",
        )}
      />
      <Link
        href="/planner/simulador"
        title="Abrir el Simulador"
        className="flex select-none items-center gap-1.5 underline-offset-2 hover:underline"
      >
        <FlaskConical className="h-4 w-4 text-muted-foreground" />
        Incluir simulación
      </Link>
    </div>
  );
}
