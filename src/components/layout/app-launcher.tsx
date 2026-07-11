"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { appsForRole, moduleForPathname } from "@/lib/constants";

/**
 * Switcher de apps de la suite (CRM / Planner). Solo se muestra si el rol
 * tiene acceso a más de una app.
 */
export function AppLauncher({ role = null }: { role?: string | null }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  const apps = appsForRole(role);
  if (apps.length < 2) return null;

  const activeModule = moduleForPathname(pathname);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Cambiar de app">
            <LayoutGrid className="h-4 w-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apps</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 pt-2">
          {apps.map((app) => {
            const Icon = app.icon;
            const isActive = app.key === activeModule;
            return (
              <Link
                key={app.key}
                href={app.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-center text-sm transition-colors hover:bg-accent",
                  isActive && "border-primary/40 bg-primary/5",
                )}
              >
                <Icon className="h-6 w-6 text-primary" />
                <span className="font-medium">{app.label}</span>
                <span className="text-xs text-muted-foreground">
                  {app.description}
                </span>
              </Link>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
