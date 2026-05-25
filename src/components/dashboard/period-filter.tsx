"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

export type PeriodKey = "this-month" | "next-3" | "year" | "next-year";

type Props = {
  /** Período activo. */
  selected: PeriodKey;
};

const ITEMS: { key: PeriodKey; label: string }[] = [
  { key: "this-month", label: "Este mes" },
  { key: "next-3", label: "Próximos 3 meses" },
  { key: "year", label: "Año actual" },
  { key: "next-year", label: "Próximo año" },
];

/**
 * Filtro rápido del dashboard — 4 chips de período preestablecido.
 * Diferencia el dashboard del calendario detallado: aquí la vista es
 * monitoring (glance), allá es planning fino con detalle por semana.
 */
export function PeriodFilter({ selected }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const update = React.useCallback(
    (key: PeriodKey) => {
      const next = new URLSearchParams(params.toString());
      if (key === "this-month") next.delete("period"); // default
      else next.set("period", key);
      const qs = next.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return (
    <div
      role="tablist"
      aria-label="Período"
      className="flex flex-wrap items-center gap-1.5 px-2 py-2"
    >
      {ITEMS.map((it) => {
        const active = selected === it.key;
        return (
          <button
            key={it.key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => update(it.key)}
            className={cn(
              "rounded-md border px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
