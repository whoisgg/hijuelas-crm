"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Moon, Plus, Sprout, Sun, User } from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  APP_NAME,
  liveModulesForAccess,
  moduleForPathname,
  QUICK_CREATE_ITEMS,
  type ModuleAccessInfo,
} from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AppLauncher } from "./app-launcher";
import { GlobalSearch } from "./global-search";
import { ScopeSwitcher, type ScopeOption } from "./scope-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

type TopbarProps = {
  userEmail: string | null;
  access?: ModuleAccessInfo | null;
  /** países donde el grupo opera, para el selector de alcance */
  scopeCountries?: ScopeOption[];
  /** iso2 del país activo; null = consolidado */
  activeScope?: string | null;
};

export function Topbar({
  userEmail,
  access = null,
  scopeCountries = [],
  activeScope = null,
}: TopbarProps) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);
  const { setTheme, resolvedTheme } = useTheme();
  // Evita el mismatch de hidratación: en el servidor no se sabe el tema.
  const mounted = React.useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  const initial = (userEmail?.[0] ?? "U").toUpperCase();
  const pathname = usePathname();
  const activeModule = moduleForPathname(pathname);
  const liveModules = liveModulesForAccess(access);
  const activeApp =
    liveModules.find((m) => m.navModule === activeModule) ?? liveModules[0];
  // El logo lleva al home del módulo activo; el switcher cambia de módulo.
  const homeHref = activeApp?.href ?? "/apps";
  const showQuickCreate = activeModule === "comercial";
  // El alcance por país se muestra donde el filtro REALMENTE corre: CRM (vía
  // la sociedad vendedora) y Planner (vía planner_areas.country_id). Bodega
  // queda fuera hasta que sus vistas de stock arrastren la bodega —
  // bodega_stock_disponible agrega sobre todas—; un selector sin efecto miente
  // más de lo que ayuda.
  const showScope = activeModule === "comercial" || activeModule === "produccion";

  const handleSignOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("No pudimos cerrar la sesión.");
      return;
    }
    toast.success("Sesión cerrada.");
    router.push("/login");
    router.refresh();
  };

  return (
    <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center gap-3 border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <AppLauncher access={access} />

      <Link href={homeHref} className="flex items-center gap-2 font-semibold">
        <Sprout className="h-5 w-5 text-primary" />
        <span className="hidden sm:inline">
          {APP_NAME}
          {activeApp ? (
            <span className="ml-1.5 font-normal text-muted-foreground">
              · {activeApp.label}
            </span>
          ) : null}
        </span>
      </Link>

      {/* Mobile: la barra queda con lo esencial (+, país, perfil). La búsqueda
          se abre desde el ⌘K / la lupa de cada vista; acá solo comía ancho. */}
      <div className="ml-4 hidden flex-1 md:block">
        <GlobalSearch access={access} />
      </div>
      <div className="flex-1 md:hidden" />

      {/* Nuevo dropdown — trigger estilizado directo (no render={<Button>})
          para evitar nested-button hydration bug de base-ui. Solo módulo
          comercial: los quick-creates son de ventas. */}
      {showQuickCreate ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ size: "sm" }),
            "gap-1",
          )}
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nuevo</span>
          <ChevronDown className="h-3 w-3 opacity-70" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
            Crear nuevo
          </div>
          <DropdownMenuSeparator />
          {QUICK_CREATE_ITEMS.map((item) => (
            <DropdownMenuItem
              key={item.href}
              onClick={() => router.push(item.href)}
              className="flex items-center justify-between gap-4"
            >
              <span>{item.label}</span>
              {item.shortcut ? (
                <kbd className="ml-4 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                  {item.shortcut}
                </kbd>
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      ) : null}

      {showScope ? (
        <ScopeSwitcher countries={scopeCountries} active={activeScope} />
      ) : null}

      {/* Notificaciones y tema: en mobile viven dentro del menú de perfil. */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Notificaciones"
        className="relative hidden md:inline-flex"
      >
        <Bell className="h-4 w-4" />
      </Button>

      <div className="hidden md:block">
        <ThemeToggle />
      </div>

      {/* Avatar menu — mismo patrón sin render={<Button>}. */}
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Menú de usuario"
          className={cn(
            buttonVariants({ variant: "ghost", size: "icon" }),
          )}
        >
          <Avatar className="h-7 w-7">
            <AvatarFallback className="text-xs">{initial}</AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <div className="flex flex-col px-1.5 py-1">
            <span className="text-sm font-medium">Mi cuenta</span>
            <span className="truncate text-xs text-muted-foreground">
              {userEmail ?? "Invitado"}
            </span>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => router.push("/perfil")}
            className="gap-2"
          >
            <User className="h-4 w-4" />
            Perfil
          </DropdownMenuItem>

          {/* Solo mobile: lo que se sacó de la barra para dejarla con +,
              país y perfil. En desktop siguen como iconos propios. */}
          <DropdownMenuItem className="gap-2 md:hidden">
            <Bell className="h-4 w-4" />
            Notificaciones
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e: React.MouseEvent) => {
              // No cerrar el menú: el usuario suele probar claro/oscuro.
              e.preventDefault();
              setTheme(resolvedTheme === "dark" ? "light" : "dark");
            }}
            className="gap-2 md:hidden"
          >
            {mounted && resolvedTheme === "dark" ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
            {mounted && resolvedTheme === "dark" ? "Modo claro" : "Modo oscuro"}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} className="gap-2">
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
