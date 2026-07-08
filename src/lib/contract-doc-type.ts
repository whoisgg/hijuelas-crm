/**
 * Tipo de documento comercial — orthogonal al status y a la condición.
 *
 *   contrato     → contrato firmado estándar (default)
 *   orden_compra → orden de compra del cliente, sin contrato firmado
 *   venta_spot   → venta puntual sin contrato ni OC
 *
 * El documento siempre pertenece al cliente que paga (`client_id`);
 * el despacho a terceros se registra en `ship_to_client_id`.
 *
 * URL: `?docTypes=contrato,venta_spot`
 */

import type { Database } from "@/lib/database.types";

export type CommercialDocType =
  Database["public"]["Enums"]["commercial_doc_type"];

export const DOC_TYPE_OPTIONS: ReadonlyArray<{
  key: CommercialDocType;
  label: string;
  /** Etiqueta corta para tablas densas. */
  shortLabel: string;
  /** Variante de Badge — colores monocromáticos sutiles. */
  className: string;
}> = [
  {
    key: "contrato",
    label: "Contrato",
    shortLabel: "Contrato",
    className: "bg-primary/10 text-primary border-primary/20",
  },
  {
    key: "orden_compra",
    label: "Orden de compra",
    shortLabel: "OC",
    className:
      "bg-violet-500/10 text-violet-700 border-violet-500/20 dark:text-violet-300",
  },
  {
    key: "venta_spot",
    label: "Venta spot",
    shortLabel: "Spot",
    className:
      "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
  },
];

const ALL_KEYS = DOC_TYPE_OPTIONS.map((o) => o.key);

export function parseDocTypes(
  raw: string | undefined,
): Set<CommercialDocType> {
  if (!raw) return new Set(ALL_KEYS);
  const parts = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is CommercialDocType =>
      ALL_KEYS.includes(s as CommercialDocType),
    );
  if (parts.length === 0) return new Set(ALL_KEYS);
  return new Set(parts);
}

export function matchesDocTypes(
  docType: CommercialDocType | string | null | undefined,
  selected: Set<CommercialDocType>,
): boolean {
  if (!docType) return selected.has("contrato"); // null fallback a contrato
  return selected.has(docType as CommercialDocType);
}

export function serializeDocTypes(
  selected: Set<CommercialDocType>,
): string | undefined {
  if (selected.size === 0) return "none";
  if (selected.size === ALL_KEYS.length) return undefined; // default: todos
  return Array.from(selected).join(",");
}

export function docTypeMeta(
  docType: CommercialDocType | string | null | undefined,
) {
  return (
    DOC_TYPE_OPTIONS.find((o) => o.key === docType) ?? DOC_TYPE_OPTIONS[0]
  );
}
