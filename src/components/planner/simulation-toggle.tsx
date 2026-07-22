"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Simulation } from "@/lib/planner/simulation";

/**
 * Control de simulación en Ocupación: checkbox maestro + chips por
 * simulación cargable (estado evaluacion/aprobado). Un chip se puede apagar
 * puntualmente (?off=ids) sin tocar su estado; los borradores aparecen
 * apagados y sin acción — se cargan moviéndolos de columna en el Simulador.
 */
export function SimulationToggle({
  checked,
  simulations,
  offIds,
}: {
  checked: boolean;
  simulations: Simulation[];
  offIds: number[];
}) {
  const router = useRouter();
  const off = new Set(offIds);

  const push = (on: boolean, nextOff: Set<number>) => {
    if (!on) {
      router.push("/planner/ocupacion");
      return;
    }
    const offQs = [...nextOff].sort((a, b) => a - b).join(",");
    router.push(`/planner/ocupacion?sim=1${offQs ? `&off=${offQs}` : ""}`);
  };

  const toggleChip = (id: number) => {
    const next = new Set(off);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    push(true, next);
  };

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
      <label className="flex cursor-pointer select-none items-center gap-2">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => push(e.target.checked, off)}
          className="h-4 w-4 accent-[#185FA5]"
        />
        <span className="flex items-center gap-1.5">
          <FlaskConical className="h-4 w-4 text-muted-foreground" />
          Incluir simulación
        </span>
      </label>

      {checked
        ? simulations.map((s) =>
            s.loadable ? (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleChip(s.id)}
                title={
                  off.has(s.id)
                    ? "Apagada en esta vista — clic para volver a sumarla."
                    : "Sumada a la ocupación — clic para apagarla en esta vista."
                }
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors",
                  off.has(s.id)
                    ? "text-muted-foreground line-through hover:text-foreground"
                    : s.status === "aprobado"
                      ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300"
                      : "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300",
                )}
              >
                {off.has(s.id) ? "" : "✓ "}
                {s.name} · {s.trays.toLocaleString("es-CL")}
              </button>
            ) : (
              <span
                key={s.id}
                title="Borrador: no se suma. Muévela a «En evaluación» en el Simulador."
                className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground/70 line-through"
              >
                {s.name}
              </span>
            ),
          )
        : null}

      <Link
        href="/planner/simulador"
        className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      >
        Simulador
      </Link>
    </div>
  );
}
