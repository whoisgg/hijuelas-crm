import { AGE_MAX_BUCKET } from "@/lib/planner/layout-data";

/** Escala semáforo de 0 a 6+ meses: verde = recién plantado, pasa por amarillo, termina en rojo = viejo. */
export const AGE_COLORS = [
  "#16a34a",
  "#4ade80",
  "#a3e635",
  "#facc15",
  "#fb923c",
  "#f87171",
  "#dc2626",
] as const;

export function ageColor(months: number | null): string {
  if (months === null) return "#e5e7eb";
  const i = Math.max(0, Math.min(AGE_MAX_BUCKET, Math.round(months)));
  return AGE_COLORS[i];
}

export function ageLabel(months: number): string {
  return months >= AGE_MAX_BUCKET ? `${AGE_MAX_BUCKET}+ m` : `${months} m`;
}
