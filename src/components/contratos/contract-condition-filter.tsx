"use client";

import * as React from "react";

import {
  CONTRACT_CONDITION_OPTIONS,
  type ContractCondition,
} from "@/lib/contract-condition";

interface Props {
  selected: Set<ContractCondition>;
  onChange: (next: Set<ContractCondition>) => void;
  size?: "sm" | "md";
}

/**
 * Chips toggleables para filtrar por condición (Venta / Muestra / Reposición).
 * Controlled — el parent maneja el state (URL o local).
 */
export function ContractConditionFilter({ selected, onChange, size = "md" }: Props) {
  const hClass = size === "sm" ? "h-7" : "h-8";
  const textClass = size === "sm" ? "text-[11px]" : "text-xs";

  const toggle = (key: ContractCondition) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  };

  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      {CONTRACT_CONDITION_OPTIONS.map((o) => {
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
