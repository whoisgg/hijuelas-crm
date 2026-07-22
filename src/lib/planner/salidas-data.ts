import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Salidas programadas del planner: por cada lote del plan vigente se derivan
 * sus eventos de salida — fin de enraizamiento → maduración y fin de
 * maduración → predespacho son CAMBIOS DE SECCIÓN (etapa de crecimiento);
 * el fin de predespacho es el DESPACHO final. Los despachos se cruzan con el
 * CRM (variedad maestra + año + semana de entrega ±2) para mostrar a qué
 * contrato/cliente corresponden; sin match quedan "sin asociación".
 */

export type SalidaMatch = {
  contractNumber: string;
  contractId: string;
  clientName: string;
  deliveryWeek: number | null;
  qtyPlants: number;
};

export type SalidaEvent = {
  lotId: number;
  lotCode: string;
  species: string;
  variety: string | null;
  trays: number;
  plants: number;
  /** semana campaña en que el lote sale (última semana de la etapa) */
  campaignWeek: number;
  weekLabel: string; // "S44 · 2026"
  kind: "etapa" | "despacho";
  fromArea: string;
  /** sector destino (cambio de etapa) o null (despacho) */
  toArea: string | null;
  /** solo despachos: contratos CRM candidatos (variedad+año+semana ±2) */
  matches: SalidaMatch[];
  /** despacho sin variedad vinculada a maestros: no se puede cruzar */
  unlinkedVariety: boolean;
};

export type SalidasData = {
  /** eventos agrupados por semana campaña, ascendente */
  weeks: { campaignWeek: number; weekLabel: string; events: SalidaEvent[] }[];
  currentCampaignWeek: number | null;
  totals: {
    despachos: number;
    despachoTrays: number;
    despachosConContrato: number;
    cambiosEtapa: number;
  };
};

type LotRow = {
  id: number;
  lot_code: string;
  year: number;
  trays: number | null;
  plants: number;
  rooting_area_id: number | null;
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

export async function getSalidasData(
  supabase: SupabaseClient<Database>,
): Promise<SalidasData | null> {
  const [lotsRes, areasRes, calendarRes] = await Promise.all([
    supabase
      .from("planner_lots")
      .select(
        "id, lot_code, year, trays, plants, rooting_area_id, rooting_end_week, maturation_area_id, maturation_start_week, maturation_end_week, predispatch_area_id, predispatch_start_week, predispatch_end_week, end_week, planner_species(name), planner_varieties(id, name, master_variety_id)",
      )
      .eq("status", "ACTIVO")
      .limit(10000),
    supabase.from("planner_areas").select("id, name"),
    supabase
      .from("planner_calendar_weeks")
      .select("campaign_week, year, week, start_date, end_date")
      .order("campaign_week"),
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

  const matchesFor = (lot: LotRow, dispatchCw: number): SalidaMatch[] => {
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
  const events: SalidaEvent[] = [];
  for (const lot of lots) {
    const base = {
      lotId: lot.id,
      lotCode: lot.lot_code,
      species: lot.planner_species?.name ?? "¿?",
      variety: lot.planner_varieties?.name ?? null,
      trays: lot.trays ?? 0,
      plants: lot.plants,
    };

    // Cambios de sección entre etapas consecutivas presentes.
    if (lot.rooting_end_week !== null && lot.maturation_area_id !== null) {
      events.push({
        ...base,
        campaignWeek: lot.rooting_end_week,
        weekLabel: weekLabelOf(lot.rooting_end_week),
        kind: "etapa",
        fromArea: areaName.get(lot.rooting_area_id ?? -1) ?? "¿?",
        toArea: areaName.get(lot.maturation_area_id) ?? "¿?",
        matches: [],
        unlinkedVariety: false,
      });
    }
    if (lot.maturation_end_week !== null && lot.predispatch_area_id !== null) {
      events.push({
        ...base,
        campaignWeek: lot.maturation_end_week,
        weekLabel: weekLabelOf(lot.maturation_end_week),
        kind: "etapa",
        fromArea: areaName.get(lot.maturation_area_id ?? -1) ?? "¿?",
        toArea: areaName.get(lot.predispatch_area_id) ?? "¿?",
        matches: [],
        unlinkedVariety: false,
      });
    }

    // Despacho final: última etapa presente del lote.
    const dispatchWeek =
      lot.predispatch_end_week ?? lot.end_week ?? lot.maturation_end_week ?? null;
    const lastAreaId =
      lot.predispatch_area_id ?? lot.maturation_area_id ?? lot.rooting_area_id;
    if (dispatchWeek !== null) {
      events.push({
        ...base,
        campaignWeek: dispatchWeek,
        weekLabel: weekLabelOf(dispatchWeek),
        kind: "despacho",
        fromArea: areaName.get(lastAreaId ?? -1) ?? "¿?",
        toArea: null,
        matches: matchesFor(lot, dispatchWeek),
        unlinkedVariety: !lot.planner_varieties?.master_variety_id,
      });
    }
  }

  // ── Agrupar por semana ──
  const byWeek = new Map<number, SalidaEvent[]>();
  for (const e of events) {
    const arr = byWeek.get(e.campaignWeek) ?? [];
    arr.push(e);
    byWeek.set(e.campaignWeek, arr);
  }
  const weeks = [...byWeek.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([campaignWeek, evts]) => ({
      campaignWeek,
      weekLabel: weekLabelOf(campaignWeek),
      events: evts.sort(
        (a, b) =>
          // Despachos primero dentro de la semana, luego por bandejas desc.
          Number(b.kind === "despacho") - Number(a.kind === "despacho") ||
          b.trays - a.trays,
      ),
    }));

  const despachos = events.filter((e) => e.kind === "despacho");
  return {
    weeks,
    currentCampaignWeek,
    totals: {
      despachos: despachos.length,
      despachoTrays: despachos.reduce((s, e) => s + e.trays, 0),
      despachosConContrato: despachos.filter((e) => e.matches.length > 0).length,
      cambiosEtapa: events.length - despachos.length,
    },
  };
}
