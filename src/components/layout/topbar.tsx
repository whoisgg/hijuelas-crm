"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Plus, Sprout, User } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { APP_NAME, QUICK_CREATE_ITEMS } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";
import { AppLauncher } from "./app-launcher";
import { GlobalSearch } from "./global-search";
import { ThemeToggle } from "@/components/theme-toggle";

type TopbarProps = {
  userEmail: string | null;
};

export function Topbar({ userEmail }: TopbarProps) {
  const router = useRouter();
  const supabase = React.useMemo(() => createClient(), []);

  const initial = (userEmail?.[0] ?? "U").toUpperCase();

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
      <AppLauncher />
      <Link href="/dashboard" className="flex items-center gap-2 font-semibold">
        <Sprout className="h-5 w-5 text-primary" />
        <span className="hidden sm:inline">{APP_NAME}</span>
      </Link>

      <div className="ml-4 flex-1">
        <GlobalSearch />
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button size="sm" className="gap-1">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Nuevo</span>
              <ChevronDown className="h-3 w-3 opacity-70" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Crear nuevo</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {QUICK_CREATE_ITEMS.map((item) => (
            <DropdownMenuItem
              key={item.href}
              render={
                <Link href={item.href} className="flex items-center justify-between">
                  <span>{item.label}</span>
                  {item.shortcut ? (
                    <kbd className="ml-4 rounded border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
                      {item.shortcut}
                    </kbd>
                  ) : null}
                </Link>
              }
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="ghost"
        size="icon"
        aria-label="Notificaciones"
        className="relative"
      >
        <Bell className="h-4 w-4" />
      </Button>

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Menú de usuario">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs">{initial}</AvatarFallback>
              </Avatar>
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col">
              <span className="text-sm font-medium">Mi cuenta</span>
              <span className="truncate text-xs text-muted-foreground">
                {userEmail ?? "Invitado"}
              </span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={
              <Link href="/perfil">
                <User className="mr-2 h-4 w-4" />
                Perfil
              </Link>
            }
          />
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
