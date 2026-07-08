"use client";

import * as React from "react";

import {
  DOC_TYPE_OPTIONS,
  type CommercialDocType,
} from "@/lib/contract-doc-type";

interface Props {
  selected: Set<CommercialDocType>;
  onChange: (next: Set<CommercialDocType>) => void;
  size?: "sm" | "md";
}

/**
 * Chips toggleables para filtrar por tipo de documento
 * (Contrato / Orden de compra / Venta spot).
 * Controlled — el parent maneja el state (URL o local).
 */
export function ContractDocTypeFilter({ selected, onChange, size = "md" }: Props) {
  const hClass = size === "sm" ? "h-7" : "h-8";
  const textClass = size === "sm" ? "text-[11px]" : "text-xs";

  const toggle = (key: CommercialDocType) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {DOC_TYPE_OPTIONS.map((o) => {
        const active = selected.has(o.key);
        return (
          <label
            key={o.key}
            className={
              "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 font-medium transition-colors " +
              hClass +
              " " +
              textClass +
              " " +
              (active
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-muted")
            }
          >
            <input
              type="checkbox"
              className="accent-primary"
              checked={active}
              onChange={() => toggle(o.key)}
            />
            {o.label}
          </label>
        );
      })}
    </div>
  );
}
