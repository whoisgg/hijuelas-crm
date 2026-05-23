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
