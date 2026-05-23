/**
 * Helpers de formato compartidos por las vistas analíticas.
 */

const usdFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const usdCompactFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

const numberFormatter = new Intl.NumberFormat("es-CL", {
  maximumFractionDigits: 0,
});

const numberCompactFormatter = new Intl.NumberFormat("es-CL", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatUsd(value: number, compact = false): string {
  return compact ? usdCompactFormatter.format(value) : usdFormatter.format(value);
}

export function formatNumber(value: number, compact = false): string {
  return compact
    ? numberCompactFormatter.format(value)
    : numberFormatter.format(value);
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return new Intl.NumberFormat("es-CL", {
    style: "percent",
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

export function formatDelta(
  current: number,
  previous: number,
): { value: number; label: string } | null {
  if (previous === 0) {
    return current === 0
      ? null
      : { value: 100, label: "vs año anterior" };
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  return { value: pct, label: "vs año anterior" };
}
