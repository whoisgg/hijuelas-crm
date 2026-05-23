/**
 * Condición comercial del contrato — orthogonal al status.
 *
 *   venta      → contrato comercial estándar (default, ~93% de la base)
 *   muestra    → envío sin facturar (sample para evaluación)
 *   reposicion → reemplazo gratuito de pérdidas/fallas
 *
 * URL: `?conditions=venta,muestra`
 */

import type { Database } from "@/lib/database.types";

export type ContractCondition = Database["public"]["Enums"]["condition_type"];

export const CONTRACT_CONDITION_OPTIONS: ReadonlyArray<{
  key: ContractCondition;
  label: string;
  /** Variante de Badge — colores monocromáticos sutiles. */
  className: string;
}> = [
  {
    key: "venta",
    label: "Venta",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  {
    key: "muestra",
    label: "Muestra",
    className:
      "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
  },
  {
    key: "reposicion",
    label: "Reposición",
    className:
      "bg-sky-500/10 text-sky-700 border-sky-500/20 dark:text-sky-300",
  },
];

const ALL_KEYS = CONTRACT_CONDITION_OPTIONS.map((o) => o.key);

export function parseContractConditions(
  raw: string | undefined,
): Set<ContractCondition> {
  if (!raw) return new Set(ALL_KEYS);
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is ContractCondition =>
      ALL_KEYS.includes(s as ContractCondition),
    );
  if (parts.length === 0) return new Set(ALL_KEYS);
  return new Set(parts);
}

export function matchesContractConditions(
  condition: ContractCondition | string | null | undefined,
  selected: Set<ContractCondition>,
): boolean {
  if (!condition) return selected.has("venta"); // null fallback to venta
  return selected.has(condition as ContractCondition);
}

export function serializeContractConditions(
  selected: Set<ContractCondition>,
): string | undefined {
  if (selected.size === 0) return "none";
  if (selected.size === ALL_KEYS.length) return undefined; // default: all
  return Array.from(selected).join(",");
}

export function conditionMeta(condition: ContractCondition | string | null | undefined) {
  return (
    CONTRACT_CONDITION_OPTIONS.find((o) => o.key === condition) ??
    CONTRACT_CONDITION_OPTIONS[0]
  );
}
