"use client";

import * as React from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight, Sprout, FlaskConical } from "lucide-react";

import type { CatalogNode } from "@/lib/actions/analytics";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Props = {
  tree: CatalogNode[];
};

export function CatalogTree({ tree }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const selected = params.get("variety");

  // Pre-expand the species + program that contains the selected variety,
  // otherwise expand the first species
  const [openSpecies, setOpenSpecies] = React.useState<Record<string, boolean>>(
    () => {
      const init: Record<string, boolean> = {};
      if (selected) {
        const parent = tree.find((s) =>
          s.programs.some((p) => p.varieties.some((v) => v.id === selected)),
        );
        if (parent) init[parent.speciesId] = true;
      } else if (tree[0]) {
        init[tree[0].speciesId] = true;
      }
      return init;
    },
  );

  const [openProgram, setOpenProgram] = React.useState<Record<string, boolean>>(
    () => {
      const init: Record<string, boolean> = {};
      if (selected) {
        for (const s of tree) {
          for (const p of s.programs) {
            if (p.varieties.some((v) => v.id === selected)) {
              init[`${s.speciesId}::${p.programId ?? "_"}`] = true;
            }
          }
        }
      }
      return init;
    },
  );

  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tree;
    return tree
      .map((sp) => {
        const programs = sp.programs
          .map((p) => ({
            ...p,
            varieties: p.varieties.filter(
              (v) =>
                v.name.toLowerCase().includes(q) ||
                p.programName.toLowerCase().includes(q) ||
                sp.speciesName.toLowerCase().includes(q),
            ),
          }))
          .filter((p) => p.varieties.length > 0);
        return {
          ...sp,
          programs,
          totalVarieties: programs.reduce((s, p) => s + p.varieties.length, 0),
        };
      })
      .filter((sp) => sp.programs.length > 0);
  }, [tree, query]);

  // Auto-expand all matches when searching
  React.useEffect(() => {
    if (!query.trim()) return;
    const nextSp: Record<string, boolean> = {};
    const nextPr: Record<string, boolean> = {};
    for (const s of filtered) {
      nextSp[s.speciesId] = true;
      for (const p of s.programs) {
        nextPr[`${s.speciesId}::${p.programId ?? "_"}`] = true;
      }
    }
    setOpenSpecies(nextSp);
    setOpenProgram(nextPr);
  }, [filtered, query]);

  const selectVariety = (id: string) => {
    const next = new URLSearchParams(params.toString());
    next.set("variety", id);
    router.push(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const toggleSpecies = (id: string) =>
    setOpenSpecies((prev) => ({ ...prev, [id]: !prev[id] }));

  const toggleProgram = (key: string) =>
    setOpenProgram((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <Card size="sm" className="w-full lg:w-80">
      <CardHeader className="space-y-2 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sprout className="size-4 text-primary" />
          Especies / programa / variedades
        </CardTitle>
        <Input
          placeholder="Buscar variedad, programa o especie..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 text-xs"
        />
      </CardHeader>
      <CardContent className="max-h-[560px] space-y-0.5 overflow-y-auto px-2 pb-3">
        {filtered.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            Sin resultados.
          </p>
        ) : (
          filtered.map((sp) => {
            const isOpen = openSpecies[sp.speciesId] ?? false;
            return (
              <div key={sp.speciesId}>
                <button
                  type="button"
                  onClick={() => toggleSpecies(sp.speciesId)}
                  className="flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-semibold hover:bg-muted/50"
                >
                  {isOpen ? (
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="size-3.5 text-muted-foreground" />
                  )}
                  <span className="flex-1 truncate">{sp.speciesName}</span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {sp.totalVarieties}
                  </span>
                </button>
                {isOpen ? (
                  <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-2">
                    {sp.programs.map((p) => {
                      const progKey = `${sp.speciesId}::${p.programId ?? "_"}`;
                      const progOpen = openProgram[progKey] ?? false;
                      return (
                        <div key={progKey}>
                          <button
                            type="button"
                            onClick={() => toggleProgram(progKey)}
                            className={cn(
                              "flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-left text-[11px] font-medium hover:bg-muted/50",
                              p.programName === "Libre"
                                ? "text-muted-foreground"
                                : "text-foreground/80",
                            )}
                          >
                            {progOpen ? (
                              <ChevronDown className="size-3 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="size-3 text-muted-foreground" />
                            )}
                            <FlaskConical className="size-3 text-muted-foreground" />
                            <span className="flex-1 truncate">
                              {p.programName}
                            </span>
                            <span className="text-[10px] tabular-nums text-muted-foreground">
                              {p.varieties.length}
                            </span>
                          </button>
                          {progOpen ? (
                            <div className="ml-4 mt-0.5 space-y-0.5 border-l pl-2">
                              {p.varieties.map((v) => (
                                <button
                                  key={v.id}
                                  type="button"
                                  onClick={() => selectVariety(v.id)}
                                  className={cn(
                                    "flex w-full rounded-md px-2 py-1 text-left text-xs hover:bg-muted/50",
                                    v.id === selected &&
                                      "bg-primary/10 text-foreground hover:bg-primary/15",
                                  )}
                                >
                                  <span className="truncate font-normal">
                                    {v.name}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
