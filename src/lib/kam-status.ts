/**
 * Filtros de status para el módulo KAM.
 *
 * Agrupan los 7 status del enum `contract_status` en 3 buckets de negocio:
 *
 *   activos    → firmado, en_proceso, finalizado
 *   por_firmar → borrador, por_revisar               (borrador cuenta como por firmar)
 *   cancelados → cancelado
 *
 * Codificados en `?statuses=activos,por_firmar` para URLs compartibles.
 */

import type { Database } from "@/lib/database.types";

export type ContractStatus = Database["public"]["Enums"]["contract_status"];

export type KamStatusKey = "activos" | "por_firmar" | "cancelados";

export const KAM_STATUS_GROUPS: ReadonlyArray<{
  key: KamStatusKey;
  label: string;
  matches: ContractStatus[];
}> = [
  { key: "activos", label: "Activos", matches: ["firmado", "en_proceso", "finalizado"] },
  // "por_revisar" se descontinuó pero se mantiene en el matcher para que
  // contratos legacy no queden huérfanos del filtro.
  { key: "por_firmar", label: "Por firmar", matches: ["borrador", "por_revisar"] },
  { key: "cancelados", label: "Cancelados", matches: ["cancelado"] },
];

const ALL_KEYS = KAM_STATUS_GROUPS.map((g) => g.key);
const DEFAULT_KEYS: KamStatusKey[] = ["activos"];

/**
 * Parsea el searchParam `statuses` (comma-separated) a un Set tipado.
 * Si no hay nada, devuelve el default ("activos").
 */
export function parseKamStatuses(raw: string | undefined): Set<KamStatusKey> {
  if (!raw) return new Set(DEFAULT_KEYS);
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is KamStatusKey => ALL_KEYS.includes(s as KamStatusKey));
  if (parts.length === 0) return new Set(DEFAULT_KEYS);
  return new Set(parts);
}

/**
 * Determina si un status del contrato pasa el filtro.
 */
export function matchesKamStatuses(
  status: ContractStatus | string | null | undefined,
  selected: Set<KamStatusKey>,
): boolean {
  if (!status) return false;
  for (const group of KAM_STATUS_GROUPS) {
    if (!selected.has(group.key)) continue;
    if ((group.matches as readonly string[]).includes(status)) return true;
  }
  return false;
}

/**
 * Serializa el set a string para la URL. Si todos están seleccionados o es el
 * default exacto, devuelve undefined (URL limpia).
 */
export function serializeKamStatuses(selected: Set<KamStatusKey>): string | undefined {
  if (selected.size === 0) return "none";
  if (
    selected.size === DEFAULT_KEYS.length &&
    DEFAULT_KEYS.every((k) => selected.has(k))
  )
    return undefined;
  return Array.from(selected).join(",");
}
