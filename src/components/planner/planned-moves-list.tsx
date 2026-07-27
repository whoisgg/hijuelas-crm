"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  FileText,
  Link2,
  Loader2,
  Search,
  Sprout,
} from "lucide-react";
import { toast } from "sonner";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { linkPlannerVarietyToMasters } from "@/lib/actions/admin-masters";
import type { PlannedMove, PlannedMoveKind, PlannedMovesWeek } from "@/lib/planner/movimientos-data";

const num = (n: number) => n.toLocaleString("es-CL");

const KIND_LABEL: Record<PlannedMoveKind, { singular: string; plural: string }> = {
  ingreso: { singular: "ingreso", plural: "ingresos" },
  traslado: { singular: "traslado", plural: "traslados" },
  despacho: { singular: "despacho", plural: "despachos" },
};

/**
 * Acordeón semana → especie de los movimientos planificados, con el mismo
 * patrón que /planner/lotes (especie → programa): totales en cada header,
 * colapsado salvo la primera semana, y la búsqueda expande lo que hace match.
 */
export function PlannedMovesList({
  weeks,
  currentCampaignWeek,
  kind,
  canLinkMasters = false,
}: {
  weeks: PlannedMovesWeek[];
  currentCampaignWeek: number | null;
  kind: PlannedMoveKind;
  /** solo admin/platform admin puede tocar los maestros compartidos */
  canLinkMasters?: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const q = query.trim().toLowerCase();
  const label = KIND_LABEL[kind];

  const groups = React.useMemo(() => {
    const matches = (m: PlannedMove) =>
      !q ||
      m.lotCode.toLowerCase().includes(q) ||
      m.species.toLowerCase().includes(q) ||
      (m.variety ?? "").toLowerCase().includes(q) ||
      (m.fromArea ?? "").toLowerCase().includes(q) ||
      (m.toArea ?? "").toLowerCase().includes(q) ||
      m.matches.some(
        (c) =>
          c.contractNumber.toLowerCase().includes(q) ||
          c.clientName.toLowerCase().includes(q),
      );

    return weeks
      .map((w) => {
        const moves = w.moves.filter(matches);
        const bySpecies = new Map<string, PlannedMove[]>();
        for (const m of moves) {
          const arr = bySpecies.get(m.species) ?? [];
          arr.push(m);
          bySpecies.set(m.species, arr);
        }
        const species = [...bySpecies.entries()]
          .map(([name, rows]) => ({
            name,
            rows,
            trays: rows.reduce((s, r) => s + r.trays, 0),
            plants: rows.reduce((s, r) => s + r.plants, 0),
          }))
          .sort((a, b) => b.trays - a.trays || b.rows.length - a.rows.length);
        return {
          ...w,
          moves,
          species,
          trays: moves.reduce((s, m) => s + m.trays, 0),
          plants: moves.reduce((s, m) => s + m.plants, 0),
        };
      })
      .filter((w) => w.moves.length > 0);
  }, [weeks, q]);

  const shown = groups.reduce((s, w) => s + w.moves.length, 0);
  const total = weeks.reduce((s, w) => s + w.moves.length, 0);

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={
            kind === "despacho"
              ? "Buscar por lote, especie, variedad, sector o cliente"
              : "Buscar por lote, especie, variedad o sector"
          }
          className="pl-8"
        />
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border bg-card px-3 py-6 text-center text-sm text-muted-foreground">
          Sin {label.plural} planificados para este filtro.
        </p>
      ) : (
        <div className="space-y-3">
          {groups.map((w, wi) => {
            const isCurrent = w.campaignWeek === currentCampaignWeek;
            return (
              <details
                // Remount al cambiar el modo búsqueda para re-aplicar `open`.
                // Colapsado salvo la primera semana visible; buscar expande todo.
                key={`${w.campaignWeek}-${q ? "s" : "g"}`}
                open={!!q || wi === 0}
                className="group/semana overflow-hidden rounded-lg border bg-card"
              >
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open/semana:rotate-90" />
                  <CalendarDays
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isCurrent ? "text-primary" : "text-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "truncate font-semibold tabular-nums",
                        isCurrent && "text-primary",
                      )}
                    >
                      {w.weekLabel}
                      {isCurrent ? " · hoy" : ""}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {w.moves.length}{" "}
                      {w.moves.length === 1 ? label.singular : label.plural}
                      {w.species.length > 1 ? ` · ${w.species.length} especies` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-4 text-right">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Bandejas
                      </div>
                      <div className="font-mono text-sm font-bold tabular-nums">
                        {num(w.trays)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        Plantas
                      </div>
                      <div className="font-mono text-sm font-bold tabular-nums">
                        {num(w.plants)}
                      </div>
                    </div>
                  </div>
                </summary>

                {w.species.length > 1 ? (
                  <div className="border-t bg-background/50 px-2 py-2">
                    {w.species.map((sp) => (
                      <details
                        key={`${w.campaignWeek}-${sp.name}`}
                        open={!!q}
                        className="group/especie mb-1 overflow-hidden rounded-md last:mb-0"
                      >
                        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-muted/40">
                          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-open/especie:rotate-90" />
                          <Sprout className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {sp.name}
                            <span className="ml-2 text-[11px] font-normal text-muted-foreground">
                              {sp.rows.length}{" "}
                              {sp.rows.length === 1 ? label.singular : label.plural}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-xs font-semibold tabular-nums">
                            {num(sp.trays)}{" "}
                            <span className="font-normal text-muted-foreground">band. ·</span>{" "}
                            {num(sp.plants)}{" "}
                            <span className="font-normal text-muted-foreground">pl</span>
                          </span>
                        </summary>
                        <MovesTable
                          moves={sp.rows}
                          kind={kind}
                          canLinkMasters={canLinkMasters}
                        />
                      </details>
                    ))}
                  </div>
                ) : (
                  <div className="border-t">
                    <MovesTable moves={w.moves} kind={kind} canLinkMasters={canLinkMasters} />
                  </div>
                )}
              </details>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {num(shown)} de {num(total)} {label.plural} · {groups.length}{" "}
        {groups.length === 1 ? "semana" : "semanas"}
      </p>
    </div>
  );
}

/**
 * El propio aviso ámbar es el botón: un click crea la variedad en los maestros
 * (o la vincula si ya existe) sin salir de la vista. Si el usuario no puede
 * tocar maestros, queda como texto plano igual que antes.
 */
function LinkVarietyButton({ varietyId, name }: { varietyId: number; name: string | null }) {
  const router = useRouter();
  const [saving, setSaving] = React.useState(false);

  const run = async () => {
    setSaving(true);
    try {
      const res = await linkPlannerVarietyToMasters(varietyId);
      if (res.ok) {
        toast.success(
          res.action === "creada"
            ? `"${res.varietyName}" creada en maestros (${res.speciesName}) y vinculada.`
            : `"${res.varietyName}" vinculada al maestro existente.`,
        );
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo vincular.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo vincular.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={saving}
      title={`Crear "${name ?? "esta variedad"}" en los datos maestros y vincularla para poder cruzarla con los contratos`}
      className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/[0.06] px-2 py-0.5 text-[11px] text-amber-700 transition-colors hover:border-amber-500 hover:bg-amber-500/10 disabled:opacity-50 dark:text-amber-400"
    >
      {saving ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
      ) : (
        <Link2 className="h-3 w-3 shrink-0" />
      )}
      {saving ? "vinculando…" : "vincular variedad"}
    </button>
  );
}

function MovesTable({
  moves,
  kind,
  canLinkMasters,
}: {
  moves: PlannedMove[];
  kind: PlannedMoveKind;
  canLinkMasters: boolean;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-left font-medium">Lote</th>
            <th className="px-3 py-2 text-left font-medium">Variedad</th>
            <th className="px-3 py-2 text-right font-medium">Bandejas</th>
            <th className="px-3 py-2 text-right font-medium">Plantas</th>
            <th className="px-3 py-2 text-left font-medium">
              {kind === "ingreso" ? "Entra a" : kind === "traslado" ? "Movimiento" : "Sale de"}
            </th>
            {kind === "despacho" ? (
              <th className="px-3 py-2 text-left font-medium">Contrato</th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y">
          {moves.map((m, i) => (
            <tr key={`${m.lotId}-${m.kind}-${i}`} className="hover:bg-muted/30">
              <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{m.lotCode}</td>
              <td className="px-3 py-2 text-muted-foreground">{m.variety ?? "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(m.trays)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(m.plants)}</td>
              <td className="px-3 py-2">
                {kind === "traslado" ? (
                  <span className="flex items-center gap-1 whitespace-nowrap text-xs text-muted-foreground">
                    {m.fromArea}
                    <ArrowRight className="h-3 w-3 shrink-0" />
                    <span className="font-medium text-foreground">{m.toArea}</span>
                  </span>
                ) : (
                  <span className="whitespace-nowrap text-xs text-muted-foreground">
                    {kind === "ingreso" ? m.toArea : m.fromArea}
                  </span>
                )}
              </td>
              {kind === "despacho" ? (
                <td className="px-3 py-2">
                  <span className="flex flex-wrap items-center gap-1.5">
                    {m.matches.length ? (
                      m.matches.map((c) => (
                        <Link
                          key={c.contractId}
                          href={`/contratos/${c.contractId}`}
                          title={`${c.clientName} · ${num(c.qtyPlants)} plantas${c.deliveryWeek ? ` · S${c.deliveryWeek}` : ""}`}
                          className="inline-flex max-w-56 items-center gap-1 truncate rounded-full border border-[#8b5cf6]/40 bg-[#8b5cf6]/[0.06] px-2 py-0.5 text-[11px] text-foreground transition-colors hover:border-[#8b5cf6]"
                        >
                          <FileText className="h-3 w-3 shrink-0 text-[#8b5cf6]" />
                          <span className="truncate">
                            {c.contractNumber} · {c.clientName}
                          </span>
                        </Link>
                      ))
                    ) : m.unlinkedVariety ? (
                      canLinkMasters && m.varietyId !== null ? (
                        <LinkVarietyButton varietyId={m.varietyId} name={m.variety} />
                      ) : (
                        <span
                          className="text-[11px] text-amber-600 dark:text-amber-400"
                          title="La variedad del lote no está vinculada a los maestros — vincúlala en Administración → Datos maestros para poder cruzar."
                        >
                          variedad sin vínculo
                        </span>
                      )
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        sin contrato asociado
                      </span>
                    )}
                  </span>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
