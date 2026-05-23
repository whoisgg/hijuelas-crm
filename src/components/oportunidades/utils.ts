import type { Database } from "@/lib/database.types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];

export const CURRENCY_LABEL: Record<CurrencyCode, string> = {
  USD: "USD",
  CLP: "CLP",
  EUR: "EUR",
};

export function formatCurrency(
  value: number | null | undefined,
  currency: CurrencyCode | null | undefined,
): string {
  if (value === null || value === undefined) return "—";
  const cur = currency ?? "USD";
  const locale = cur === "CLP" ? "es-CL" : "en-US";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: cur,
      maximumFractionDigits: cur === "CLP" ? 0 : 2,
    }).format(value);
  } catch {
    return `${cur} ${value.toLocaleString()}`;
  }
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("es-CL", {
      year: "numeric",
      month: "short",
      day: "2-digit",
    });
  } catch {
    return value;
  }
}

export function initialsOf(name: string | null | undefined): string {
  if (!name) return "??";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export function daysBetween(from: string, to: Date = new Date()): number {
  const start = new Date(from).getTime();
  const end = to.getTime();
  return Math.max(0, Math.round((end - start) / (1000 * 60 * 60 * 24)));
}

export function isOverdue(dateIso: string | null | undefined): boolean {
  if (!dateIso) return false;
  return new Date(dateIso).getTime() < Date.now();
}
