"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ExternalLink, LayoutGrid } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { modulesForRole, moduleForPathname } from "@/lib/constants";

/**
 * Switcher de módulos: lista todos los módulos que el rol puede ver (barras,
 * no cuadros). Los "próximamente" salen atenuados; los enlaces abren fuera.
 */
export function AppLauncher({ role = null }: { role?: string | null }) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();

  const modules = modulesForRole(role);
  const liveCount = modules.filter((m) => m.status === "live").length;
  if (liveCount < 2 && modules.length < 2) return null;

  const activeModule = moduleForPathname(pathname);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" aria-label="Cambiar de módulo">
            <LayoutGrid className="h-4 w-4" />
          </Button>
        }
      />
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-sm">
        <DialogHeader className="border-b px-4 py-3">
          <DialogTitle className="text-base">Módulos</DialogTitle>
        </DialogHeader>
        <div className="divide-y">
          {modules.map((m) => {
            const Icon = m.icon;
            const isActive = m.status === "live" && m.navModule === activeModule;
            const disabled = m.status === "soon";

            const row = (
              <>
                {/* acento lateral tipo ticketera */}
                <span
                  className={cn(
                    "w-1 shrink-0 self-stretch",
                    isActive ? "bg-primary" : disabled ? "bg-transparent" : "bg-primary/30",
                  )}
                />
                <span
                  className={cn(
                    "my-3 ml-3 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                    disabled ? "bg-muted" : "bg-primary/10",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5",
                      disabled ? "text-muted-foreground" : "text-primary",
                    )}
                  />
                </span>
                <span className="min-w-0 flex-1 px-3 py-3">
                  <span className="block truncate text-sm font-medium">{m.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {m.description}
                  </span>
                </span>
                <span className="flex shrink-0 items-center pr-3">
                  {m.status === "soon" ? (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Pronto
                    </span>
                  ) : m.status === "external" ? (
                    <ExternalLink className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight
                      className={cn(
                        "h-4 w-4",
                        isActive ? "text-primary" : "text-muted-foreground/50",
                      )}
                    />
                  )}
                </span>
              </>
            );

            const cls = cn(
              "flex items-center transition-colors",
              isActive && "bg-primary/[0.04]",
              disabled ? "cursor-default opacity-60" : "hover:bg-accent",
            );

            if (m.status === "live" && m.href) {
              return (
                <Link key={m.key} href={m.href} onClick={() => setOpen(false)} className={cls}>
                  {row}
                </Link>
              );
            }
            if (m.status === "external" && m.url) {
              return (
                <a
                  key={m.key}
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className={cls}
                >
                  {row}
                </a>
              );
            }
            return (
              <div key={m.key} className={cls}>
                {row}
              </div>
            );
          })}
        </div>
        <Link
          href="/apps"
          onClick={() => setOpen(false)}
          className="block border-t px-4 py-3 text-center text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Ver selector completo →
        </Link>
      </DialogContent>
    </Dialog>
  );
}
