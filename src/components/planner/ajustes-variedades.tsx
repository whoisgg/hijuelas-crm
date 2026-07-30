"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Link2, Link2Off, Search, Sprout } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  linkPlannerVarietyToMasters,
  mergeMasterVarieties,
  type VarietyMergeCandidate,
} from "@/lib/actions/admin-masters";

export type AjustesVariedadRow = {
  id: number;
  name: string;
  speciesId: number;
  speciesName: string;
  /** vinculada a la variedad maestra compartida del CRM */
  masterLinked: boolean;
};

/**
 * Todas las variedades del Planner agrupadas por especie, con su estado de
 * vínculo al maestro compartido — antes solo se veía el aviso disperso, lote
 * por lote, en /planner/movimientos; acá queda todo junto y accionable.
 */
export function AjustesVariedades({ varieties }: { varieties: AjustesVariedadRow[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [linking, setLinking] = React.useState<number | null>(null);
  // Cuando "Vincular" encuentra >1 maestro con el mismo nombre, queda acá
  // pendiente de que el usuario elija cuál mantener (nunca se adivina).
  const [pendingMerge, setPendingMerge] = React.useState<{
    row: AjustesVariedadRow;
    candidates: VarietyMergeCandidate[];
  } | null>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? varieties.filter(
        (v) =>
          v.name.toLowerCase().includes(q) || v.speciesName.toLowerCase().includes(q),
      )
    : varieties;

  const bySpecies = React.useMemo(() => {
    const map = new Map<string, AjustesVariedadRow[]>();
    for (const v of filtered) {
      const arr = map.get(v.speciesName) ?? [];
      arr.push(v);
      map.set(v.speciesName, arr);
    }
    return [...map.entries()]
      .map(([species, rows]) => ({
        species,
        rows: rows.sort((a, b) => a.name.localeCompare(b.name)),
        linked: rows.filter((r) => r.masterLinked).length,
      }))
      .sort((a, b) => a.species.localeCompare(b.species));
  }, [filtered]);

  const totalLinked = varieties.filter((v) => v.masterLinked).length;

  const link = async (v: AjustesVariedadRow) => {
    setLinking(v.id);
    try {
      const res = await linkPlannerVarietyToMasters(v.id);
      if (res.ok) {
        toast.success(
          res.action === "creada"
            ? `Se creó "${res.varietyName}" en maestros y se vinculó.`
            : `"${res.varietyName}" vinculada al maestro existente.`,
        );
        setPendingMerge(null);
        router.refresh();
      } else if (res.candidates?.length) {
        setPendingMerge({ row: v, candidates: res.candidates });
      } else {
        toast.error(res.error ?? "No se pudo vincular.");
      }
    } finally {
      setLinking(null);
    }
  };

  const keepCandidate = async (candidate: VarietyMergeCandidate) => {
    if (!pendingMerge) return;
    setLinking(pendingMerge.row.id);
    try {
      const mergeIds = pendingMerge.candidates
        .filter((c) => c.id !== candidate.id)
        .map((c) => c.id);
      const merged = await mergeMasterVarieties({ keepId: candidate.id, mergeIds });
      if (!merged.ok) {
        toast.error(merged.error ?? "No se pudo fusionar.");
        return;
      }
      const res = await linkPlannerVarietyToMasters(pendingMerge.row.id);
      if (res.ok) {
        toast.success(
          `Se fusionaron ${mergeIds.length} duplicado(s) en "${candidate.name}" y se vinculó.`,
        );
        setPendingMerge(null);
        router.refresh();
      } else {
        toast.error(res.error ?? "Se fusionó, pero no se pudo vincular después.");
      }
    } finally {
      setLinking(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por variedad o especie"
            className="pl-8"
          />
        </div>
        <span className="shrink-0 text-xs text-muted-foreground">
          {totalLinked}/{varieties.length} vinculadas
        </span>
      </div>

      {bySpecies.length === 0 ? (
        <p className="rounded-lg border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
          Sin variedades para ese filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {bySpecies.map((g) => (
            <details
              key={g.species}
              open={!!q || g.linked < g.rows.length}
              className="group/especie overflow-hidden rounded-lg border bg-card"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/especie:rotate-90" />
                <Sprout className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-semibold">{g.species}</span>
                <span
                  className={
                    g.linked === g.rows.length
                      ? "text-xs tabular-nums text-emerald-600 dark:text-emerald-400"
                      : "text-xs tabular-nums text-amber-600 dark:text-amber-400"
                  }
                >
                  {g.linked}/{g.rows.length} vinculadas
                </span>
              </summary>
              <div className="divide-y border-t">
                {g.rows.map((v) => (
                  <div key={v.id} className="px-4 py-2 text-sm">
                    <div className="flex items-center gap-3">
                      {v.masterLinked ? (
                        <Link2
                          className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                          aria-label="Vinculada al maestro"
                        />
                      ) : (
                        <Link2Off
                          className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50"
                          aria-label="Sin vínculo al maestro"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{v.name}</span>
                      {!v.masterLinked ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={linking === v.id}
                          onClick={() =>
                            pendingMerge?.row.id === v.id
                              ? setPendingMerge(null)
                              : link(v)
                          }
                        >
                          {linking === v.id
                            ? "Vinculando…"
                            : pendingMerge?.row.id === v.id
                              ? "Cancelar"
                              : "Vincular"}
                        </Button>
                      ) : null}
                    </div>
                    {pendingMerge?.row.id === v.id ? (
                      <div className="mt-2 ml-6 space-y-1.5 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-2.5">
                        <p className="text-xs text-muted-foreground">
                          Hay {pendingMerge.candidates.length} variedades maestras
                          llamadas &ldquo;{v.name}&rdquo; (mayúscula/minúscula distinta).
                          Elegí cuál mantener — la(s) otra(s) se fusiona(n) ahí (contratos
                          incluidos) y quedan de baja.
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {pendingMerge.candidates.map((c) => (
                            <Button
                              key={c.id}
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={linking === v.id}
                              onClick={() => keepCandidate(c)}
                            >
                              Mantener &ldquo;{c.name}&rdquo;
                              <span className="ml-1 text-muted-foreground">
                                ({c.contractItems} contrato
                                {c.contractItems === 1 ? "" : "s"})
                              </span>
                            </Button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}
