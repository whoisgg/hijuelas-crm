import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { getLotPlanHistory, type LotPlanChangeEvent } from "@/lib/planner/lot-plan-history";

/**
 * Movimientos PLANIFICADOS del vivero: se derivan del plan vigente (no son el
 * registro real, que vive en `planner_movements`). Por cada lote activo salen
 * tres tipos de evento, con el mismo vocabulario que el registro real:
 *
 *  - `ingreso`   — el lote entra al vivero (arranca enraizamiento).
 *  - `traslado`  — cambio de sección entre etapas de crecimiento
 *                  (enraizamiento → maduración → predespacho).
 *  - `despacho`  — el lote sale del vivero (fin de la última etapa).
 *
 * Los despachos se cruzan con el CRM (variedad maestra + año + semana de
 * entrega ±2) para mostrar a qué contrato/cliente corresponden; sin match
 * quedan "sin contrato asociado".
 */

export type PlannedMoveKind = "ingreso" | "traslado" | "despacho";

export type PlannedMoveMatch = {
  contractNumber: string;
  contractId: string;
  clientName: string;
  deliveryWeek: number | null;
  qtyPlants: number;
};

export type PlannedMove = {
  lotId: number;
  lotCode: string;
  species: string;
  variety: string | null;
  /** id de `planner_varieties` — lo usa el botón de vincular a maestros */
  varietyId: number | null;
  trays: number;
  plants: number;
  /** semana campaña en que ocurre el movimiento */
  campaignWeek: number;
  weekLabel: string; // "S44 · 2026"
  kind: PlannedMoveKind;
  /** sector de origen (null en ingresos: viene de afuera) */
  fromArea: string | null;
  /** sector destino (null en despachos: sale del vivero) */
  toArea: string | null;
  /** solo despachos: contratos CRM candidatos (variedad+año+semana ±2) */
  matches: PlannedMoveMatch[];
  /** despacho sin variedad vinculada a maestros: no se puede cruzar */
  unlinkedVariety: boolean;
  /** historial de cambios del plan de este lote, más reciente primero */
  changes: LotPlanChangeEvent[];
};

export type PlannedMovesWeek = {
  campaignWeek: number;
  weekLabel: string;
  moves: PlannedMove[];
};

export type PlannedMovesData = {
  /** eventos agrupados por semana campaña, ascendente */
  weeks: PlannedMovesWeek[];
  currentCampaignWeek: number | null;
  totals: {
    ingresos: number;
    ingresoTrays: number;
    traslados: number;
    despachos: number;
    despachoTrays: number;
    despachosConContrato: number;
  };
};

type LotRow = {
  id: number;
  lot_code: string;
  year: number;
  trays: number | null;
  plants: number;
  start_week: number | null;
  rooting_area_id: number | null;
  rooting_start_week: number | null;
  rooting_end_week: number | null;
  maturation_area_id: number | null;
  maturation_start_week: number | null;
  maturation_end_week: number | null;
  predispatch_area_id: number | null;
  predispatch_start_week: number | null;
  predispatch_end_week: number | null;
  end_week: number | null;
  planner_species: { name: string } | null;
  planner_varieties: { id: number; name: string; master_variety_id: string | null } | null;
};

const WEEK_TOLERANCE = 2;

export async function getPlannedMovesData(
  supabase: SupabaseClient<Database>,
): Promise<PlannedMovesData | null> {
  const [lotsRes, areasRes, calendarRes, changesByLot] = await Promise.all([
    supabase
      .from("planner_lots")
      .select(
        "id, lot_code, year, trays, plants, start_week, rooting_area_id, rooting_start_week, rooting_end_week, maturation_area_id, maturation_start_week, maturation_end_week, predispatch_area_id, predispatch_start_week, predispatch_end_week, end_week, planner_species(name), planner_varieties(id, name, master_variety_id)",
      )
      .eq("status", "ACTIVO")
      .limit(10000),
    supabase.from("planner_areas").select("id, name"),
    supabase
      .from("planner_calendar_weeks")
      .select("campaign_week, year, week, start_date, end_date")
      .order("campaign_week"),
    getLotPlanHistory(supabase),
  ]);

  const lots = (lotsRes.data ?? []) as unknown as LotRow[];
  if (!lots.length) return null;

  const areaName = new Map((areasRes.data ?? []).map((a) => [a.id, a.name]));
  const calendar = (calendarRes.data ?? []).filter((c) => c.campaign_week !== null);
  const byCampaign = new Map(calendar.map((c) => [c.campaign_week as number, c]));

  const today = new Date();
  const currentCampaignWeek =
    calendar.find((c) => {
      const start = c.start_date ? new Date(`${c.start_date}T00:00:00`) : null;
      const end = c.end_date ? new Date(`${c.end_date}T23:59:59`) : null;
      return !!(start && end && today >= start && today <= end);
    })?.campaign_week ?? null;

  const weekLabelOf = (cw: number): string => {
    const cal = byCampaign.get(cw);
    return cal ? `S${cal.week} · ${cal.year}` : `SC${cw}`;
  };
  /** semana real (año, semana) de una semana campaña — para cruzar con el CRM */
  const realWeekOf = (cw: number): { year: number; week: number } | null => {
    const cal = byCampaign.get(cw);
    return cal ? { year: cal.year, week: cal.week } : null;
  };

  // ── Cruce CRM: items de contrato por variedad maestra usada por los lotes ──
  const masterIds = [
    ...new Set(
      lots
        .map((l) => l.planner_varieties?.master_variety_id)
        .filter((v): v is string => !!v),
    ),
  ];
  type CrmItem = {
    variety_id: string;
    delivery_year: number;
    delivery_week: number | null;
    qty_plants: number;
    contracts: {
      id: string;
      number: string;
      clients: { name: string } | null;
    } | null;
  };
  let crmItems: CrmItem[] = [];
  if (masterIds.length) {
    const { data } = await supabase
      .from("contract_items")
      .select(
        "variety_id, delivery_year, delivery_week, qty_plants, contracts(id, number, clients!contracts_client_id_fkey(name))",
      )
      .in("variety_id", masterIds)
      .is("deleted_at", null)
      .limit(5000);
    crmItems = (data ?? []) as unknown as CrmItem[];
  }
  const crmByVariety = new Map<string, CrmItem[]>();
  for (const it of crmItems) {
    const arr = crmByVariety.get(it.variety_id) ?? [];
    arr.push(it);
    crmByVariety.set(it.variety_id, arr);
  }

  const matchesFor = (lot: LotRow, dispatchCw: number): PlannedMoveMatch[] => {
    const masterId = lot.planner_varieties?.master_variety_id;
    if (!masterId) return [];
    const real = realWeekOf(dispatchCw);
    if (!real) return [];
    const candidates = (crmByVariety.get(masterId) ?? []).filter(
      (it) =>
        it.contracts &&
        it.delivery_year === real.year &&
        (it.delivery_week === null ||
          Math.abs(it.delivery_week - real.week) <= WEEK_TOLERANCE),
    );
    // Semana exacta primero, luego cercanía; máx 3 para no saturar la fila.
    return candidates
      .sort(
        (a, b) =>
          Math.abs((a.delivery_week ?? 99) - real.week) -
          Math.abs((b.delivery_week ?? 99) - real.week),
      )
      .slice(0, 3)
      .map((it) => ({
        contractNumber: it.contracts!.number,
        contractId: it.contracts!.id,
        clientName: it.contracts!.clients?.name ?? "—",
        deliveryWeek: it.delivery_week,
        qtyPlants: it.qty_plants,
      }));
  };

  // ── Eventos ──
  const moves: PlannedMove[] = [];
  for (const lot of lots) {
    const base = {
      lotId: lot.id,
      lotCode: lot.lot_code,
      species: lot.planner_species?.name ?? "¿?",
      variety: lot.planner_varieties?.name ?? null,
      varietyId: lot.planner_varieties?.id ?? null,
      trays: lot.trays ?? 0,
      plants: lot.plants,
      matches: [] as PlannedMoveMatch[],
      // Propiedad del LOTE, no del evento: si la variedad no está vinculada a
      // los maestros no se puede cruzar con el CRM. Se marca en los tres tipos
      // para que el aviso sirva también en Ingresos y Traslados.
      unlinkedVariety: !lot.planner_varieties?.master_variety_id,
      changes: changesByLot.get(lot.lot_code) ?? [],
    };

    // Ingreso: el lote entra al vivero y arranca enraizamiento.
    const entryWeek = lot.rooting_start_week ?? lot.start_week;
    if (entryWeek !== null && lot.rooting_area_id !== null) {
      moves.push({
        ...base,
        campaignWeek: entryWeek,
        weekLabel: weekLabelOf(entryWeek),
        kind: "ingreso",
        fromArea: null,
        toArea: areaName.get(lot.rooting_area_id) ?? "¿?",
      });
    }

    // Traslados entre etapas consecutivas presentes.
    if (lot.rooting_end_week !== null && lot.maturation_area_id !== null) {
      moves.push({
        ...base,
        campaignWeek: lot.rooting_end_week,
        weekLabel: weekLabelOf(lot.rooting_end_week),
        kind: "traslado",
        fromArea: areaName.get(lot.rooting_area_id ?? -1) ?? "¿?",
        toArea: areaName.get(lot.maturation_area_id) ?? "¿?",
      });
    }
    if (lot.maturation_end_week !== null && lot.predispatch_area_id !== null) {
      moves.push({
        ...base,
        campaignWeek: lot.maturation_end_week,
        weekLabel: weekLabelOf(lot.maturation_end_week),
        kind: "traslado",
        fromArea: areaName.get(lot.maturation_area_id ?? -1) ?? "¿?",
        toArea: areaName.get(lot.predispatch_area_id) ?? "¿?",
      });
    }

    // Despacho: última etapa presente del lote.
    const dispatchWeek =
      lot.predispatch_end_week ?? lot.end_week ?? lot.maturation_end_week ?? null;
    const lastAreaId =
      lot.predispatch_area_id ?? lot.maturation_area_id ?? lot.rooting_area_id;
    if (dispatchWeek !== null) {
      moves.push({
        ...base,
        campaignWeek: dispatchWeek,
        weekLabel: weekLabelOf(dispatchWeek),
        kind: "despacho",
        fromArea: areaName.get(lastAreaId ?? -1) ?? "¿?",
        toArea: null,
        matches: matchesFor(lot, dispatchWeek),
      });
    }
  }

  // ── Agrupar por semana ──
  const KIND_ORDER: Record<PlannedMoveKind, number> = {
    despacho: 0,
    traslado: 1,
    ingreso: 2,
  };
  const byWeek = new Map<number, PlannedMove[]>();
  for (const m of moves) {
    const arr = byWeek.get(m.campaignWeek) ?? [];
    arr.push(m);
    byWeek.set(m.campaignWeek, arr);
  }
  const weeks = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([campaignWeek, list]) => ({
      campaignWeek,
      weekLabel: weekLabelOf(campaignWeek),
      moves: list.sort(
        (a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || b.trays - a.trays,
      ),
    }));

  const ingresos = moves.filter((m) => m.kind === "ingreso");
  const despachos = moves.filter((m) => m.kind === "despacho");
  return {
    weeks,
    currentCampaignWeek,
    totals: {
      ingresos: ingresos.length,
      ingresoTrays: ingresos.reduce((s, m) => s + m.trays, 0),
      traslados: moves.filter((m) => m.kind === "traslado").length,
      despachos: despachos.length,
      despachoTrays: despachos.reduce((s, m) => s + m.trays, 0),
      despachosConContrato: despachos.filter((m) => m.matches.length > 0).length,
    },
  };
}
