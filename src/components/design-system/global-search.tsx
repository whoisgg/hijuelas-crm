"use client";

import * as React from "react";
import {
  Building2,
  Clock,
  FileText,
  Leaf,
  MessageSquare,
  Sparkles,
  Target,
  Terminal,
  type LucideIcon,
} from "lucide-react";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

export type SearchResultType =
  | "cliente"
  | "contrato"
  | "oportunidad"
  | "variedad"
  | "comentario"
  | "comando";

export type SearchResult = {
  id: string;
  type: SearchResultType;
  title: string;
  subtitle?: string;
  href?: string;
  onSelect?: () => void;
  icon?: LucideIcon;
};

export type GlobalSearchProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSearch: (query: string) => Promise<SearchResult[]>;
  recentItems?: SearchResult[];
  placeholder?: string;
};

const TYPE_META: Record<
  SearchResultType,
  { label: string; icon: LucideIcon }
> = {
  cliente: { label: "Clientes", icon: Building2 },
  contrato: { label: "Contratos", icon: FileText },
  oportunidad: { label: "Oportunidades", icon: Target },
  variedad: { label: "Variedades", icon: Leaf },
  comentario: { label: "Comentarios", icon: MessageSquare },
  comando: { label: "Comandos", icon: Terminal },
};

const TYPE_ORDER: SearchResultType[] = [
  "comando",
  "cliente",
  "contrato",
  "oportunidad",
  "variedad",
  "comentario",
];

/**
 * Command palette (Cmd+K) con resultados agrupados por tipo y atajos para
 * comandos rápidos (`> nuevo contrato`).
 */
export function GlobalSearch({
  open,
  onOpenChange,
  onSearch,
  recentItems,
  placeholder = "Buscar clientes, contratos, oportunidades...",
}: GlobalSearchProps) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  // Debounced search — kick off after the timeout so we never call setState
  // synchronously inside the effect body.
  React.useEffect(() => {
    if (!open || !hasQuery) {
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      if (cancelled) return;
      setLoading(true);
      onSearch(trimmed)
        .then((res) => {
          if (!cancelled) setResults(res);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [trimmed, hasQuery, open, onSearch]);

  // When closed or query cleared, drop stale results without an effect.
  const safeResults: SearchResult[] = React.useMemo(
    () => (!open || !hasQuery ? [] : results),
    [open, hasQuery, results],
  );

  // Wrap onOpenChange so closing resets the query without an effect.
  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        setQuery("");
        setResults([]);
        setLoading(false);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const isCommandMode = query.startsWith(">");

  const grouped = React.useMemo(() => {
    const map = new Map<SearchResultType, SearchResult[]>();
    for (const r of safeResults) {
      const arr = map.get(r.type) ?? [];
      arr.push(r);
      map.set(r.type, arr);
    }
    return TYPE_ORDER.filter((t) => map.has(t)).map((t) => ({
      type: t,
      items: map.get(t)!,
    }));
  }, [safeResults]);

  const handleSelect = (result: SearchResult) => {
    handleOpenChange(false);
    if (result.onSelect) result.onSelect();
    else if (result.href && typeof window !== "undefined") {
      window.location.href = result.href;
    }
  };

  const showRecents = !hasQuery && recentItems && recentItems.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder={placeholder}
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {loading ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Buscando...
          </div>
        ) : null}

        {!loading && hasQuery && grouped.length === 0 ? (
          <CommandEmpty>Sin resultados para &ldquo;{query}&rdquo;.</CommandEmpty>
        ) : null}

        {!hasQuery && !showRecents ? (
          <div className="flex flex-col items-center gap-1 py-6 text-center">
            <Sparkles className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-xs text-muted-foreground">
              Escribe para buscar. Usa <kbd className="rounded border bg-muted px-1 font-mono text-[10px]">&gt;</kbd>{" "}
              para comandos rápidos.
            </p>
          </div>
        ) : null}

        {showRecents ? (
          <CommandGroup heading="Recientes">
            {recentItems!.map((r) => (
              <ResultRow key={r.id} result={r} onSelect={handleSelect} icon={Clock} />
            ))}
          </CommandGroup>
        ) : null}

        {grouped.map((group, idx) => (
          <React.Fragment key={group.type}>
            {idx > 0 ? <CommandSeparator /> : null}
            <CommandGroup heading={isCommandMode && group.type === "comando" ? "Comandos" : TYPE_META[group.type].label}>
              {group.items.map((r) => (
                <ResultRow key={r.id} result={r} onSelect={handleSelect} />
              ))}
            </CommandGroup>
          </React.Fragment>
        ))}
      </CommandList>
    </CommandDialog>
  );
}

function ResultRow({
  result,
  onSelect,
  icon: ForcedIcon,
}: {
  result: SearchResult;
  onSelect: (r: SearchResult) => void;
  icon?: LucideIcon;
}) {
  const Icon = ForcedIcon ?? result.icon ?? TYPE_META[result.type].icon;
  return (
    <CommandItem
      value={`${result.title} ${result.subtitle ?? ""} ${result.id}`}
      onSelect={() => onSelect(result)}
    >
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div className="flex flex-col">
        <span className="text-sm">{result.title}</span>
        {result.subtitle ? (
          <span className="text-xs text-muted-foreground">
            {result.subtitle}
          </span>
        ) : null}
      </div>
    </CommandItem>
  );
}
