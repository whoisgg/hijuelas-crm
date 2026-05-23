import type { Database } from "@/lib/database.types";

type Currency = Database["public"]["Enums"]["currency_code"];

const FORMATTERS: Record<Currency, Intl.NumberFormat> = {
  CLP: new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }),
  USD: new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }),
  EUR: new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }),
};

export function formatMoney(value: number | null | undefined, currency: Currency): string {
  if (value == null) return "—";
  return FORMATTERS[currency].format(value);
}

const intFormatter = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

export function formatQty(value: number | null | undefined): string {
  if (value == null) return "—";
  return intFormatter.format(value);
}

/**
 * Formato compacto para números grandes: 1.500 → "1.5K", 13.992.722 → "14M".
 * Usa coma decimal (es-CL) y sufijos K/M/B.
 */
export function formatCompact(value: number | null | undefined): string {
  if (value == null) return "—";
  const abs = Math.abs(value);
  if (abs < 1000) return intFormatter.format(value);
  if (abs < 1_000_000) {
    const v = value / 1000;
    return `${stripZeros(v.toFixed(1))}K`;
  }
  if (abs < 1_000_000_000) {
    const v = value / 1_000_000;
    return `${stripZeros(v.toFixed(1))}M`;
  }
  const v = value / 1_000_000_000;
  return `${stripZeros(v.toFixed(1))}B`;
}

/**
 * Formato compacto para moneda: 26_788_734 USD → "$26.8M".
 * Símbolo según moneda; sin decimales bajo 1K.
 */
export function formatMoneyCompact(
  value: number | null | undefined,
  currency: Currency,
): string {
  if (value == null) return "—";
  const symbol = currency === "USD" ? "$" : currency === "EUR" ? "€" : "$";
  const prefix = currency === "CLP" ? "CLP " : symbol;
  const abs = Math.abs(value);
  if (abs < 1000) return `${prefix}${intFormatter.format(value)}`;
  if (abs < 1_000_000) {
    const v = value / 1000;
    return `${prefix}${stripZeros(v.toFixed(1))}K`;
  }
  if (abs < 1_000_000_000) {
    const v = value / 1_000_000;
    return `${prefix}${stripZeros(v.toFixed(1))}M`;
  }
  const v = value / 1_000_000_000;
  return `${prefix}${stripZeros(v.toFixed(1))}B`;
}

/** "1.0" → "1", "1.5" → "1.5". Evita "1.0M" → "1M". */
function stripZeros(s: string): string {
  return s.replace(/\.0$/, "");
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return value;
  }
}
