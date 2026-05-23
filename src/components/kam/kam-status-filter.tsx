"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  KAM_STATUS_GROUPS,
  serializeKamStatuses,
  type KamStatusKey,
} from "@/lib/kam-status";

interface KamStatusFilterProps {
  /** Set actual de status habilitados. */
  selected: Set<KamStatusKey>;
  /** Tamaño visual del control. Por defecto md. */
  size?: "sm" | "md";
}

export function KamStatusFilter({ selected, size = "md" }: KamStatusFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const update = (next: Set<KamStatusKey>) => {
    const sp = new URLSearchParams(params.toString());
    const serialized = serializeKamStatuses(next);
    if (serialized === undefined) sp.delete("statuses");
    else sp.set("statuses", serialized);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const toggle = (key: KamStatusKey) => {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    update(next);
  };

  const allActive = KAM_STATUS_GROUPS.every((g) => selected.has(g.key));

  const hClass = size === "sm" ? "h-7" : "h-8";
  const textClass = size === "sm" ? "text-[11px]" : "text-xs";

  return (
    <div className="inline-flex flex-wrap items-center gap-1">
      <label
        className={
          "inline-flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 font-medium transition-colors " +
          hClass +
          " " +
          textClass +
          " " +
          (allActive
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-border text-muted-foreground hover:bg-muted")
        }
      >
        <input
          type="checkbox"
          className="accent-primary"
          checked={allActive}
          onChange={() => {
            update(
              allActive
                ? new Set()
                : new Set(KAM_STATUS_GROUPS.map((g) => g.key)),
            );
          }}
        />
        Todos
      </label>
      {KAM_STATUS_GROUPS.map((g) => {
        const active = selected.has(g.key);
        return (
          <label
            key={g.key}
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
              onChange={() => toggle(g.key)}
            />
            {g.label}
          </label>
        );
      })}
    </div>
  );
}
