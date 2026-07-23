"use client";

import * as React from "react";
import { FileText, Briefcase, Users, Sprout, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { navItemsFor, type ModuleAccessInfo } from "@/lib/constants";
import { usePathname, useRouter } from "next/navigation";
import {
  globalSearch,
  type GlobalSearchResults,
  type SearchHit,
} from "@/lib/actions/global-search";

const EMPTY: GlobalSearchResults = {
  clientes: [],
  contratos: [],
  oportunidades: [],
  variedades: [],
};

export function GlobalSearch({ access = null }: { access?: ModuleAccessInfo | null }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<GlobalSearchResults>(EMPTY);
  const [loading, setLoading] = React.useState(false);
  const router = useRouter();
  const pathname = usePathname();
  const reqIdRef = React.useRef(0);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  React.useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
      setLoading(false);
    }
  }, [open]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setLoading(false);
      return;
    }
    const id = ++reqIdRef.current;
    setLoading(true);
    const handle = window.setTimeout(() => {
      globalSearch(q)
        .then((data) => {
          if (id === reqIdRef.current) {
            setResults(data);
            setLoading(false);
          }
        })
        .catch(() => {
          if (id === reqIdRef.current) {
            setResults(EMPTY);
            setLoading(false);
          }
        });
    }, 180);
    return () => window.clearTimeout(handle);
  }, [query]);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const trimmed = query.trim();
  const navItems = navItemsFor(access, pathname);
  const navMatches =
    trimmed.length === 0
      ? navItems
      : navItems.filter((item) =>
          item.label.toLowerCase().includes(trimmed.toLowerCase()),
        );

  const totalHits =
    results.clientes.length +
    results.contratos.length +
    results.oportunidades.length +
    results.variedades.length;

  const showEmpty =
    trimmed.length >= 2 && !loading && totalHits === 0 && navMatches.length === 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-9 w-full max-w-sm justify-between gap-2 text-muted-foreground"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" />
          <span className="hidden sm:inline">
            Buscar clientes, contratos, oportunidades...
          </span>
        </span>
        <kbd className="pointer-events-none hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={false}>
        <CommandInput
          placeholder="Buscar clientes, contratos, oportunidades, variedades..."
          value={query}
          onValueChange={setQuery}
        />
        <CommandList>
          {showEmpty && <CommandEmpty>Sin resultados.</CommandEmpty>}

          {trimmed.length >= 2 && loading && totalHits === 0 && (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              Buscando...
            </div>
          )}

          {navMatches.length > 0 && (
            <CommandGroup heading="Navegar">
              {navMatches.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={item.href}
                    value={`nav-${item.href}`}
                    onSelect={() => navigate(item.href)}
                  >
                    <Icon className="mr-2 h-4 w-4" />
                    {item.label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          <HitGroup
            heading="Clientes"
            icon={Users}
            hits={results.clientes}
            onSelect={navigate}
          />
          <HitGroup
            heading="Ventas"
            icon={FileText}
            hits={results.contratos}
            onSelect={navigate}
          />
          <HitGroup
            heading="Oportunidades"
            icon={Briefcase}
            hits={results.oportunidades}
            onSelect={navigate}
          />
          <HitGroup
            heading="Variedades"
            icon={Sprout}
            hits={results.variedades}
            onSelect={navigate}
          />
        </CommandList>
      </CommandDialog>
    </>
  );
}

function HitGroup({
  heading,
  icon: Icon,
  hits,
  onSelect,
}: {
  heading: string;
  icon: React.ComponentType<{ className?: string }>;
  hits: SearchHit[];
  onSelect: (href: string) => void;
}) {
  if (hits.length === 0) return null;
  return (
    <>
      <CommandSeparator />
      <CommandGroup heading={heading}>
        {hits.map((hit) => (
          <CommandItem
            key={hit.id}
            value={`${heading}-${hit.id}`}
            onSelect={() => onSelect(hit.href)}
          >
            <Icon className="mr-2 h-4 w-4 shrink-0" />
            <span className="flex min-w-0 flex-1 items-center gap-2">
              <span className="truncate">{hit.label}</span>
              {hit.sublabel && (
                <span className="truncate text-xs text-muted-foreground">
                  · {hit.sublabel}
                </span>
              )}
            </span>
          </CommandItem>
        ))}
      </CommandGroup>
    </>
  );
}
