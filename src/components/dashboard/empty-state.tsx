import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export type EmptyStateProps = {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
};

export function EmptyState({
  title = "Sin datos",
  description = "No hay registros que mostrar.",
  icon: Icon = Inbox,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-muted-foreground",
        className,
      )}
    >
      <Icon className="size-8 opacity-50" />
      <div className="space-y-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs">{description}</p>
      </div>
    </div>
  );
}
