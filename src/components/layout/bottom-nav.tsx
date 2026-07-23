"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";

import { cn } from "@/lib/utils";
import {
  navItemsFor,
  type ModuleAccessInfo,
  type NavItem,
} from "@/lib/constants";

// 4 ítems principales en el bottom-bar (iOS-style). El resto vive en "Más".
// Orden mobile: Dashboard, Calendario, Contratos, Oportunidades.
// Planner es primario para el rol produccion (es su único módulo).
const PRIMARY_HREFS = [
  "/dashboard",
  "/calendario",
  "/contratos",
  "/oportunidades",
  "/planner",
  "/planner/carga",
];

/**
 * Bottom navigation tipo iOS app — sólo visible en mobile.
 * Hasta 4 ítems principales + un "Más" que abre un sheet con el resto.
 */
export function BottomNav({ access = null }: { access?: ModuleAccessInfo | null }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = React.useState(false);

  const items = navItemsFor(access, pathname);

  const primaryItems = PRIMARY_HREFS.map((href) =>
    items.find((i) => i.href === href),
  )
    .filter((i): i is NavItem => !!i)
    .slice(0, 4);

  const secondaryItems = items.filter(
    (i) => !primaryItems.some((p) => p.href === i.href),
  );

  const isItemActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  // Si alguno de los items secundarios está activo, marca "Más" como activo
  const isMoreActive = secondaryItems.some((i) => isItemActive(i.href));

  return (
    <>
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-30 flex md:hidden",
          "border-t border-sidebar-border bg-sidebar/95 backdrop-blur",
          "supports-[backdrop-filter]:bg-sidebar/85",
          // Safe-area iOS (notch + home indicator)
          "pb-[env(safe-area-inset-bottom)]",
        )}
      >
        {primaryItems.map((item) => {
          const Icon = item.icon;
          const active = isItemActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium",
                "transition-colors",
                active
                  ? "text-primary"
                  : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
              )}
            >
              <Icon className="h-5 w-5" strokeWidth={active ? 2.5 : 2} />
              <span className="leading-tight">{item.label}</span>
            </Link>
          );
        })}

        {secondaryItems.length > 0 ? (
          <button
            type="button"
            onClick={() => setMoreOpen((v) => !v)}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium",
              "transition-colors",
              isMoreActive || moreOpen
                ? "text-primary"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground",
            )}
            aria-label={moreOpen ? "Cerrar menú" : "Más opciones"}
          >
            {moreOpen ? (
              <X className="h-5 w-5" strokeWidth={2.5} />
            ) : (
              <Menu className="h-5 w-5" strokeWidth={isMoreActive ? 2.5 : 2} />
            )}
            <span className="leading-tight">Más</span>
          </button>
        ) : null}
      </nav>

      {/* Drawer "Más" — items secundarios */}
      {moreOpen ? (
        <>
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setMoreOpen(false)}
            className="fixed inset-0 z-30 bg-black/40 backdrop-blur-sm md:hidden"
          />
          <div
            className={cn(
              "fixed inset-x-0 bottom-0 z-40 md:hidden",
              "rounded-t-2xl border border-b-0 border-sidebar-border bg-card",
              "pb-[calc(4rem+env(safe-area-inset-bottom))] shadow-2xl",
              "animate-in slide-in-from-bottom duration-200",
            )}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/30" />
            <div className="grid grid-cols-3 gap-1 p-4">
              {secondaryItems.map((item) => {
                const Icon = item.icon;
                const active = isItemActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl px-2 py-3 text-xs font-medium",
                      "transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-foreground hover:bg-muted",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="leading-tight">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
