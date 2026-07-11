/**
 * Escala de calor compartida del Planner (timeline y layout por sector).
 *
 * Rampa secuencial de un solo tono (verde, claro→oscuro en light; oscuro→
 * brillante en dark, para que "cerca de cero" receda hacia la superficie) +
 * rojo de estado reservado para la alerta ≥ máximo de utilización.
 * Contrastes de texto verificados ≥ 4.8:1 en ambos modos.
 */

export function heatTone(pct: number, alertAt: number): string {
  if (pct >= alertAt * 100) {
    return "bg-[#d03b3b] font-medium text-white";
  }
  if (pct >= 85) {
    return "bg-[#1f6b24] text-white dark:bg-[#7ccc80] dark:text-[#0d3a10]";
  }
  if (pct >= 60) {
    return "bg-[#6cbb70] text-[#0d3a10] dark:bg-[#1f7a26] dark:text-white";
  }
  if (pct > 0) {
    return "bg-[#bfe0bf] text-[#0d3a10] dark:bg-[#0d3a10] dark:text-[#c9e8cb]";
  }
  return "bg-muted/30 text-muted-foreground/40";
}

export const HEAT_LEGEND = [
  { label: "<60%", swatch: "bg-[#bfe0bf] dark:bg-[#0d3a10]" },
  { label: "60–85%", swatch: "bg-[#6cbb70] dark:bg-[#1f7a26]" },
  { label: "85–{max}%", swatch: "bg-[#1f6b24] dark:bg-[#7ccc80]" },
  { label: "≥{max}% alerta", swatch: "bg-[#d03b3b]" },
] as const;
