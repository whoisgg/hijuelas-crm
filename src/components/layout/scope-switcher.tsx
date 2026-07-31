"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Globe } from "lucide-react";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CountryFlag } from "@/components/clientes/country-flag";
import { setDataScope } from "@/lib/actions/scope";

export type ScopeOption = { iso2: string; name: string };

/**
 * Selector de alcance por país de operación. Vive en el topbar y aplica a
 * todo el módulo: "Grupo" es la vista consolidada, un país acota los datos a
 * las sociedades de ese país (ver lib/scope).
 *
 * El valor se guarda en una cookie desde el servidor y se refresca la ruta:
 * el filtro se aplica en el server component, no en el cliente.
 */
export function ScopeSwitcher({
  countries,
  active,
}: {
  countries: ScopeOption[];
  /** iso2 del país activo, o null para consolidado */
  active: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  // Con una sola operación no hay nada que elegir.
  if (countries.length < 2) return null;

  const current = countries.find((c) => c.iso2 === active) ?? null;

  const choose = (iso2: string | null) => {
    startTransition(async () => {
      await setDataScope(iso2);
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Alcance por país"
        className={cn(
          buttonVariants({ variant: "ghost", size: "sm" }),
          "gap-1.5 px-2",
          pending && "opacity-60",
        )}
      >
        {current ? (
          <CountryFlag iso2={current.iso2} name={current.name} showName={false} size="sm" />
        ) : (
          <Globe className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="hidden text-sm sm:inline">{current?.name ?? "Grupo"}</span>
        <ChevronDown className="h-3 w-3 opacity-70" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <div className="px-1.5 py-1 text-xs font-medium text-muted-foreground">
          Alcance
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => choose(null)}
          className={cn("gap-2", !current && "font-medium")}
        >
          <Globe className="h-4 w-4 text-muted-foreground" />
          Grupo (consolidado)
        </DropdownMenuItem>
        {countries.map((c) => (
          <DropdownMenuItem
            key={c.iso2}
            onClick={() => choose(c.iso2)}
            className={cn("gap-2", current?.iso2 === c.iso2 && "font-medium")}
          >
            <CountryFlag iso2={c.iso2} name={c.name} showName={false} size="sm" />
            {c.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
