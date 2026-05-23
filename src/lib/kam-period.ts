/**
 * Períodos para filtrar métricas del módulo KAM (plantas, revenue).
 *
 * Encoded como string en `?period=` para URLs compartibles.
 *
 *   "all"      → todo el histórico (sin filtro de fechas)
 *   "current"  → año en curso (por default)
 *   "last-year"→ año anterior
 *   "last-3"   → últimos 3 años rolling (incluye actual)
 *   "last-5"   → últimos 5 años rolling
 *   "YYYY"     → año específico (e.g. "2024")
 */

export type KamPeriodValue =
  | "all"
  | "current"
  | "last-year"
  | "last-3"
  | "last-5"
  | `${number}`;

export interface KamPeriodResolved {
  value: KamPeriodValue;
  /** Año inicial inclusivo, o null si "all" */
  fromYear: number | null;
  /** Año final inclusivo, o null si "all" */
  toYear: number | null;
  /** Etiqueta corta para mostrar en cards y badges (e.g. "2026", "2022-26", "Total") */
  shortLabel: string;
  /** Etiqueta larga para el selector */
  longLabel: string;
}

const YEAR_REGEX = /^(\d{4})$/;

export function resolveKamPeriod(
  raw: string | undefined,
  now: Date = new Date(),
): KamPeriodResolved {
  const currentYear = now.getFullYear();
  const value = normalize(raw);

  switch (value) {
    case "all":
      return {
        value,
        fromYear: null,
        toYear: null,
        shortLabel: "Total",
        longLabel: "Total histórico",
      };
    case "current":
      return {
        value,
        fromYear: currentYear,
        toYear: currentYear,
        shortLabel: String(currentYear),
        longLabel: `Año en curso (${currentYear})`,
      };
    case "last-year":
      return {
        value,
        fromYear: currentYear - 1,
        toYear: currentYear - 1,
        shortLabel: String(currentYear - 1),
        longLabel: `Año pasado (${currentYear - 1})`,
      };
    case "last-3":
      return {
        value,
        fromYear: currentYear - 2,
        toYear: currentYear,
        shortLabel: `${String(currentYear - 2).slice(2)}-${String(currentYear).slice(2)}`,
        longLabel: `Últimos 3 años (${currentYear - 2}–${currentYear})`,
      };
    case "last-5":
      return {
        value,
        fromYear: currentYear - 4,
        toYear: currentYear,
        shortLabel: `${String(currentYear - 4).slice(2)}-${String(currentYear).slice(2)}`,
        longLabel: `Últimos 5 años (${currentYear - 4}–${currentYear})`,
      };
    default: {
      const m = value.match(YEAR_REGEX);
      if (m) {
        const yr = Number(m[1]);
        return {
          value: `${yr}`,
          fromYear: yr,
          toYear: yr,
          shortLabel: String(yr),
          longLabel: String(yr),
        };
      }
      // fallback: año en curso
      return resolveKamPeriod("current", now);
    }
  }
}

/**
 * Si una fecha cae dentro del rango del período. `null` from/to = unbounded.
 */
export function isInPeriod(
  date: Date | string | null | undefined,
  period: KamPeriodResolved,
): boolean {
  if (period.fromYear === null && period.toYear === null) return true; // "all"
  if (!date) return false;
  const d = typeof date === "string" ? new Date(date) : date;
  const yr = d.getFullYear();
  if (period.fromYear !== null && yr < period.fromYear) return false;
  if (period.toYear !== null && yr > period.toYear) return false;
  return true;
}

/**
 * Opciones para el dropdown del filtro. Incluye los presets + N años individuales hacia atrás.
 */
export function getKamPeriodOptions(
  now: Date = new Date(),
  yearsBack = 5,
): Array<{ value: KamPeriodValue; longLabel: string; group: "preset" | "year" }> {
  const currentYear = now.getFullYear();
  const presets: Array<{ value: KamPeriodValue; longLabel: string; group: "preset" }> = [
    { value: "current", longLabel: `Año en curso (${currentYear})`, group: "preset" },
    { value: "last-year", longLabel: `Año pasado (${currentYear - 1})`, group: "preset" },
    { value: "last-3", longLabel: `Últimos 3 años`, group: "preset" },
    { value: "last-5", longLabel: `Últimos 5 años`, group: "preset" },
    { value: "all", longLabel: `Total histórico`, group: "preset" },
  ];
  const years: Array<{ value: KamPeriodValue; longLabel: string; group: "year" }> = [];
  for (let y = currentYear; y >= currentYear - yearsBack; y--) {
    years.push({ value: `${y}` as const, longLabel: String(y), group: "year" });
  }
  return [...presets, ...years];
}

function normalize(raw: string | undefined): KamPeriodValue {
  if (!raw) return "current";
  const v = raw.trim().toLowerCase();
  if (
    v === "all" ||
    v === "current" ||
    v === "last-year" ||
    v === "last-3" ||
    v === "last-5"
  )
    return v;
  if (YEAR_REGEX.test(v)) return v as `${number}`;
  return "current";
}
