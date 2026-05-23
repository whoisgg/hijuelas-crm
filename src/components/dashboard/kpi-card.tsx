import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type KpiCardProps = {
  label: string;
  value: string;
  helper?: string;
  delta?: { value: number; label?: string } | null;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "warning" | "muted";
};

const TONE_CLASSES: Record<NonNullable<KpiCardProps["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-emerald-600 dark:text-emerald-400",
  warning: "text-amber-600 dark:text-amber-400",
  muted: "text-muted-foreground",
};

export function KpiCard({ label, value, helper, delta, icon: Icon, tone = "default" }: KpiCardProps) {
  const deltaTone =
    delta == null
      ? null
      : delta.value > 0
      ? "positive"
      : delta.value < 0
      ? "warning"
      : "muted";
  const DeltaIcon =
    delta == null
      ? null
      : delta.value > 0
      ? ArrowUp
      : delta.value < 0
      ? ArrowDown
      : Minus;

  return (
    <Card size="sm">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
      </CardHeader>
      <CardContent className="space-y-1">
        <div className={cn("text-2xl font-semibold tabular-nums", TONE_CLASSES[tone])}>
          {value}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {delta && DeltaIcon ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                deltaTone === "positive" && "text-emerald-600 dark:text-emerald-400",
                deltaTone === "warning" && "text-amber-600 dark:text-amber-400",
                deltaTone === "muted" && "text-muted-foreground",
              )}
            >
              <DeltaIcon className="size-3" />
              {Math.abs(delta.value).toLocaleString("es-CL", {
                maximumFractionDigits: 1,
              })}
              %
            </span>
          ) : null}
          {delta?.label ? <span>{delta.label}</span> : null}
          {!delta && helper ? <span>{helper}</span> : null}
        </div>
      </CardContent>
    </Card>
  );
}
