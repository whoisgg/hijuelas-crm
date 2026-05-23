"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type AppItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  description?: string;
};

export type AppLauncherProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: AppItem[];
  title?: string;
  description?: string;
};

/**
 * Modal con grilla 3×3 (Salesforce 9-dot) para cambiar de módulo.
 */
export function AppLauncher({
  open,
  onOpenChange,
  apps,
  title = "Módulos",
  description = "Selecciona el módulo al que quieres ir.",
}: AppLauncherProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 pt-2">
          {apps.map((app) => {
            const Icon = app.icon;
            return (
              <Link
                key={app.id}
                href={app.href}
                onClick={() => onOpenChange(false)}
                className={cn(
                  "group flex aspect-square flex-col items-center justify-center gap-1.5 rounded-lg border bg-card p-3 text-center transition-all",
                  "hover:scale-[1.03] hover:bg-accent hover:shadow-sm",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                )}
                aria-label={app.label}
              >
                <Icon className="h-6 w-6 text-primary transition-transform group-hover:scale-110" />
                <span className="text-xs font-medium text-foreground">
                  {app.label}
                </span>
                {app.description ? (
                  <span className="line-clamp-2 text-[10px] leading-tight text-muted-foreground">
                    {app.description}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
