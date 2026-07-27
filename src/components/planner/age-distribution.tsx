import { AGE_MAX_BUCKET, type AgeBucket } from "@/lib/planner/layout-data";
import { cn } from "@/lib/utils";

/**
 * Leyenda que es a la vez la estadística global de antigüedad.
 *
 * Nace de una observación del usuario: pensaba poner el número de meses dentro
 * de cada cuadrito del plano, pero notó que así "no tendría cómo ver la
 * estadística global". Esta leyenda resuelve eso — cada tramo muestra cuánto hay,
 * y la barra deja ver la forma de la distribución de un vistazo.
 *
 * La escala es secuencial (claro = recién plantado, oscuro = viejo) para que el
 * patrón salte sin leer números.
 */

/** Escala secuencial de 0 a 6+ meses. */
export const AGE_COLORS = [
  "#dcfce7",
  "#bbf7d0",
  "#86efac",
  "#4ade80",
  "#22c55e",
  "#16a34a",
  "#14532d",
] as const;

export function ageColor(months: number | null): string {
  if (months === null) return "#e5e7eb";
  const i = Math.max(0, Math.min(AGE_MAX_BUCKET, Math.round(months)));
  return AGE_COLORS[i];
}

export function ageLabel(months: number): string {
  return months >= AGE_MAX_BUCKET ? `${AGE_MAX_BUCKET}+ m` : `${months} m`;
}

const num = (n: number) => n.toLocaleString("es-CL");

export function AgeDistribution({
  distribution,
  unknownTrays,
  className,
}: {
  distribution: AgeBucket[];
  unknownTrays: number;
  className?: string;
}) {
  const total = distribution.reduce((s, b) => s + b.trays, 0);

  if (!total) {
    return (
      <p className={cn("text-[11px] text-muted-foreground", className)}>
        La foto activa no trae fechas de plantación, así que no se puede calcular
        antigüedad. La trae el Excel de inventario de hardening.
      </p>
    );
  }

  const viejas = distribution
    .filter((b) => b.months >= 5)
    .reduce((s, b) => s + b.trays, 0);

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-xs font-semibold">
          Antigüedad{" "}
          <span className="font-normal text-muted-foreground">
            — {num(total)} bandejas con fecha
          </span>
        </h3>
        {viejas > 0 ? (
          <p className="text-[11px] text-amber-600 tabular-nums dark:text-amber-400">
            {num(viejas)} con 5 meses o más
          </p>
        ) : null}
      </div>

      {/* Barra apilada: la forma de la distribución de un vistazo */}
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {distribution.map((b) => (
          <div
            key={b.months}
            style={{
              width: `${(b.trays / total) * 100}%`,
              backgroundColor: ageColor(b.months),
            }}
            title={`${ageLabel(b.months)}: ${num(b.trays)} bandejas · ${num(b.plants)} plantas`}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {distribution.map((b) => (
          <span key={b.months} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: ageColor(b.months) }}
            />
            <span className="font-medium text-foreground">{ageLabel(b.months)}</span>
            <span className="tabular-nums">{num(b.trays)}</span>
          </span>
        ))}
        {unknownTrays > 0 ? (
          <span
            className="flex items-center gap-1.5"
            title="Bandejas cuya fila del inventario no trae fecha de plantación."
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: ageColor(null) }}
            />
            sin fecha
            <span className="tabular-nums">{num(unknownTrays)}</span>
          </span>
        ) : null}
      </div>
    </div>
  );
}
