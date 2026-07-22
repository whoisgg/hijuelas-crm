"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";

import type { Simulation } from "@/lib/planner/simulation";

/**
 * Control de simulación en Ocupación: un checkbox simple. Al activarlo se
 * suman TODAS las simulaciones cargables (estado "En evaluación" o
 * "Confirmada"). Si no hay ninguna cargable, queda deshabilitado con la
 * explicación — los borradores se cargan moviéndolos de columna en el
 * Simulador.
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
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <label
        className={
          loadable.length
            ? "flex cursor-pointer select-none items-center gap-2"
            : "flex cursor-not-allowed select-none items-center gap-2 opacity-60"
        }
        title={
          loadable.length
            ? `Suma ${trays.toLocaleString("es-CL")} bandejas de ${loadable.length} ${loadable.length === 1 ? "simulación" : "simulaciones"} al plan.`
            : "No hay simulaciones cargables — muévelas a «En evaluación» o «Confirmada» en el Simulador."
        }
      >
        <input
          type="checkbox"
          checked={checked && loadable.length > 0}
          disabled={!loadable.length}
          onChange={(e) =>
            router.push(e.target.checked ? "/planner/ocupacion?sim=1" : "/planner/ocupacion")
          }
          className="h-4 w-4 accent-[#185FA5]"
        />
        <span className="flex items-center gap-1.5">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          Incluir simulación
          {loadable.length ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              ({loadable.length} · {trays.toLocaleString("es-CL")} band.)
            </span>
          ) : null}
        </span>
      </label>

      <Link
        href="/planner/simulador"
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Simulador
      </Link>
    </div>
  );
}
