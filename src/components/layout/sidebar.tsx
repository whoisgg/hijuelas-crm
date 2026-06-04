"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CircleHelp, Shield } from "lucide-react";

import { cn } from "@/lib/utils";
import { NAV_ITEMS, type NavItem } from "@/lib/constants";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const ADMIN_NAV: NavItem[] = [
  { label: "Usuarios", href: "/admin/usuarios", icon: Shield },
  { label: "Organizaciones", href: "/admin/organizaciones", icon: Building2 },
];

export function Sidebar({ isAdmin = false }: { isAdmin?: boolean }) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV_ITEMS, ...ADMIN_NAV] : NAV_ITEMS;

  return (
    <TooltipProvider delay={200}>
      <aside
        className={cn(
          // Mobile usa <BottomNav> tipo iOS, sidebar oculto.
          "group/sidebar fixed inset-y-0 left-0 z-30 hidden md:flex flex-col",
          "border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "w-14 hover:w-56 transition-[width] duration-200 ease-out",
          "pt-14",
        )}
      >
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3">
          <ul className="flex flex-col gap-1 px-2">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive =
                pathname === item.href ||
                pathname.startsWith(`${item.href}/`);

              return (
                <li key={item.href}>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Link
                          href={item.href}
                          className={cn(
                            "flex h-10 items-center gap-3 rounded-md px-2.5 text-sm font-medium",
                            "transition-colors",
                            isActive
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" />
                          <span className="truncate opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100">
                            {item.label}
                          </span>
                        </Link>
                      }
                    />
                    <TooltipContent
                      side="right"
                      className="group-hover/sidebar:hidden"
                    >
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="border-t border-sidebar-border px-2 py-3">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    "flex h-10 w-full items-center gap-3 rounded-md px-2.5 text-sm",
                    "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  )}
                >
                  <CircleHelp className="h-4 w-4 shrink-0" />
                  <span className="truncate opacity-0 transition-opacity duration-150 group-hover/sidebar:opacity-100">
                    Ayuda
                  </span>
                </button>
              }
            />
            <TooltipContent
              side="right"
              className="group-hover/sidebar:hidden"
            >
              Ayuda
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
