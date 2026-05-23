"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getKamPeriodOptions,
  resolveKamPeriod,
  type KamPeriodValue,
} from "@/lib/kam-period";

interface KamPeriodFilterProps {
  value: KamPeriodValue;
}

export function KamPeriodFilter({ value }: KamPeriodFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const options = React.useMemo(() => getKamPeriodOptions(), []);

  const onChange = (next: string | null) => {
    const sp = new URLSearchParams(params.toString());
    if (!next || next === "current") {
      sp.delete("period");
    } else {
      sp.set("period", next);
    }
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const presets = options.filter((o) => o.group === "preset");
  const years = options.filter((o) => o.group === "year");

  const resolved = resolveKamPeriod(value);

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[210px] gap-2 rounded-xl border-border/70">
        <CalendarRange className="h-4 w-4 text-muted-foreground" />
        <SelectValue placeholder="Período">{resolved.longLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent align="end" className="rounded-xl">
        <SelectGroup>
          <SelectLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Presets
          </SelectLabel>
          {presets.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.longLabel}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/70">
            Año específico
          </SelectLabel>
          {years.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.longLabel}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
