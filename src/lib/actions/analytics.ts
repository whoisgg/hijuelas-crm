"use server";

/**
 * Analytics server actions — Sprint 6 (Vistas Analíticas).
 *
 * Todas las consultas usan el cliente tipado de Supabase y respetan RLS.
 * Para agregaciones grandes preferimos paginar/limit en vez de descargar
 * todas las filas crudas.
 */

import {
  addWeeks,
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  startOfISOWeek,
} from "date-fns";
import { es } from "date-fns/locale";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type CalendarEventRow = Database["public"]["Views"]["calendar_events"]["Row"];

/* -------------------------------------------------------------------------- */
/* Tipos públicos                                                              */
/* -------------------------------------------------------------------------- */

export type DashboardKPIs = {
  year: number;
  // Plantas
  plantsCommittedYtd: number;
  plantsCommittedPrevYtd: number;
  plantsDeliveredYtd: number;
  plantsPendingYtd: number;
  plantsCommittedNext12w: number;
  // USD
  revenueUsdYtd: number;
  pipelineValueUsd: number;
  royaltyOwedUsd: number;
};

export type WeekStripSpecies = {
  speciesId: string;
  name: string;
  abbr: string;
  qty: number;
};

export type WeekStripEntry = {
  year: number;
  week: number;
  /** ISO label like "2026-W22". */
  isoLabel: string;
  /** Local date string for start of ISO week (Monday). */
  startISO: string;
  /** Local date string for end of ISO week (Sunday). */
  endISO: string;
  /** Range label like "26 may — 1 jun". */
  rangeLabel: string;
  /** Capitalized month abbreviation (uppercase) of the Monday: "MAYO". */
  monthLabel: string;
  /** Month abbreviation of the Sunday (if it spans 2 months) — else null. */
  monthLabelEnd: string | null;
  totalPlants: number;
  bySpecies: WeekStripSpecies[];
  isCurrentWeek: boolean;
};

export type TopClient = {
  id: string;
  name: string;
  countryName: string | null;
  revenueUsd: number;
  contractsCount: number;
};

export type TopVariety = {
  id: string;
  name: string;
  speciesName: string | null;
  qtyPlants: number;
};

export type UpcomingDelivery = {
  id: string;
  clientName: string;
  varietyName: string;
  qtyPlants: number;
  deliveryYear: number;
  deliveryWeek: number;
  status: string;
};

export type PendingTask = {
  id: string;
  subject: string;
  type: string;
  dueAt: string | null;
  opportunityId: string;
  opportunityName: string;
};

export type TopRankingItem = {
  key: string;       // id (genetic_program | client | country)
  name: string;
  totalUsd: number;
  share: number;     // 0..1, share of total visible
};

export type TopRankings = {
  year: number;
  totalUsd: number;  // gran total considerado en el ranking
  programs: TopRankingItem[];
  clients: TopRankingItem[];
  countries: TopRankingItem[];
  /** Top KAMs por USD comprometido del año (prorrateado por items del año). */
  kams: TopRankingItem[];
};

export type MapCountryDatum = {
  countryId: string;
  iso2: string;
  iso3: string;
  nameEs: string;
  plantsCommitted: number;
  plantsFromOpportunities: number;
  revenueUsd: number;
  pipelineValueUsd: number;
  clientsCount: number;
  contractsCount: number;
  opportunitiesCount: number;
};

export type ContractStatusCounts = {
  firmados: number;    // firmado + en_proceso + finalizado
  porFirmar: number;   // borrador + por_revisar
  cancelados: number;  // cancelado
};

export type YearCommitmentKpi = {
  year: number;
  plants: number;
};

export type DashboardSummary = {
  year: number;
  months: number[] | null; // lista de meses filtrados; null = año completo
  mapData: MapCountryDatum[];
  statusCounts: ContractStatusCounts;
  currentYearCommitments: YearCommitmentKpi;
  nextYearCommitments: YearCommitmentKpi;
};

export type CalendarFilters = {
  ownerId?: string | null;
  clientId?: string | null;
  varietyId?: string | null;
  speciesId?: string | null;
  organizationId?: string | null;
  minProbability?: number;
};

export type CalendarEvent = CalendarEventRow & {
  clientName: string | null;
  countryId: string | null;
  countryIso2: string | null;
  countryName: string | null;
  varietyName: string | null;
  speciesId: string | null;
  speciesName: string | null;
  organizationName: string | null;
  ownerName: string | null;
  /** Contract ID padre (solo cuando source_type='contract'). */
  contract_id: string | null;
  /** Número del contrato padre (ej. VHSA-2026-0001). NULL para opportunities. */
  contract_number: string | null;
  /** Contract status padre (firmado/borrador/etc). NULL para opportunities. */
  contract_status: string | null;
  /** Condition del contrato (venta/muestra/reposicion). NULL para opportunities. */
  contract_condition: string | null;
};

export type CatalogStats = {
  varietyId: string;
  varietyName: string;
  speciesName: string | null;
  geneticProgram: string | null;
  royaltyPerPlant: number | null;
  plantsCommittedYtd: number;
  plantsDeliveredYtd: number;
  plantsPipeline: number;
  topClients: Array<{ id: string; name: string; qtyPlants: number }>;
  topCountries: Array<{ iso2: string | null; name: string; qtyPlants: number }>;
  yearlyTrend: Array<{ year: number; qtyPlants: number; revenueUsd: number }>;
};

export type CatalogOverview = {
  speciesCount: number;
  programsCount: number;
  varietiesCount: number;
  plantsCommittedYtd: number;       // suma de qty_plants items del año
  topVarietiesYtd: Array<{
    varietyId: string;
    name: string;
    speciesName: string | null;
    qtyPlants: number;
  }>;
};

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const PAGE_SIZE = 1000;

const currentYear = (): number => new Date().getUTCFullYear();

/**
 * Set de números de semana ISO que CAEN al menos parcialmente dentro
 * del mes calendario `month` (1-12) del año `year`. Una semana puede
 * pertenecer a dos meses adyacentes — la incluimos en ambos.
 */
function weeksInMonth(year: number, month: number): number[] {
  const result = new Set<number>();
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const lastDay = new Date(Date.UTC(year, month, 0));
  for (
    let d = new Date(firstDay);
    d.getTime() <= lastDay.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    result.add(getISOWeek(d));
  }
  return Array.from(result).sort((a, b) => a - b);
}

/** Sum helper que ignora null/undefined. */
function sum<T>(items: readonly T[], pick: (item: T) => number | null | undefined): number {
  let total = 0;
  for (const it of items) {
    const v = pick(it);
    if (typeof v === "number" && Number.isFinite(v)) total += v;
  }
  return total;
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

export async function getDashboardKPIs(): Promise<DashboardKPIs> {
  const supabase = await createClient();
  const year = currentYear();
  const prevYear = year - 1;

  // Plantas comprometidas (year & prevYear) + entregadas + pendientes
  const [itemsCurr, itemsPrev] = await Promise.all([
    supabase
      .from("contract_items")
      .select("qty_plants, qty_delivered, status")
      .eq("delivery_year", year)
      .is("deleted_at", null),
    supabase
      .from("contract_items")
      .select("qty_plants")
      .eq("delivery_year", prevYear)
      .is("deleted_at", null),
  ]);

  const currItems = itemsCurr.data ?? [];
  const prevItems = itemsPrev.data ?? [];

  const plantsCommittedYtd = sum(currItems, (i) => Number(i.qty_plants));
  const plantsCommittedPrevYtd = sum(prevItems, (i) => Number(i.qty_plants));
  const plantsDeliveredYtd = sum(currItems, (i) => Number(i.qty_delivered));
  const plantsPendingYtd = Math.max(0, plantsCommittedYtd - plantsDeliveredYtd);

  // Revenue USD YTD: contratos firmados con signed_at en current year
  const yearStart = `${year}-01-01`;
  const nextYearStart = `${year + 1}-01-01`;

  const contractsRes = await supabase
    .from("contracts")
    .select("total_neto_usd")
    .gte("signed_at", yearStart)
    .lt("signed_at", nextYearStart)
    .is("deleted_at", null);

  const revenueUsdYtd = sum(contractsRes.data ?? [], (c) => Number(c.total_neto_usd));

  // Pipeline value USD ponderado
  const oppsRes = await supabase
    .from("opportunities")
    .select(
      "estimated_value_usd, probability_pct, stage_id, opportunity_stages!opportunities_stage_id_fkey(is_won, is_lost)",
    )
    .is("deleted_at", null);

  const pipelineValueUsd = sum(oppsRes.data ?? [], (o) => {
    type StageRel = { is_won: boolean; is_lost: boolean };
    const stages = o.opportunity_stages as StageRel | StageRel[] | null;
    const stage = Array.isArray(stages) ? stages[0] : stages;
    if (!stage || stage.is_won || stage.is_lost) return 0;
    const v = Number(o.estimated_value_usd ?? 0);
    const p = Number(o.probability_pct ?? 0);
    return (v * p) / 100;
  });

  // Royalty owed (USD)
  const royaltyRes = await supabase
    .from("royalty_obligations")
    .select("amount, currency")
    .eq("status", "pendiente")
    .is("deleted_at", null);

  // No tenemos fx_rate aquí; asumimos USD o approx. (Sprint 6 trabajamos solo USD).
  const royaltyOwedUsd = sum(royaltyRes.data ?? [], (r) =>
    r.currency === "USD" ? Number(r.amount) : 0,
  );

  // Plantas comprometidas próximas 12 semanas ISO
  const stripWeeks = buildIsoWeekWindow(new Date(), 12);
  const stripGrouped = groupWeeksByYear(stripWeeks);
  let plantsCommittedNext12w = 0;
  for (const [yearKey, weeks] of stripGrouped) {
    const stripRes = await supabase
      .from("contract_items")
      .select("qty_plants, contracts!inner(status, deleted_at)")
      .eq("delivery_year", yearKey)
      .in("delivery_week", weeks)
      .is("deleted_at", null);

    type StripRow = {
      qty_plants: number | string | null;
      contracts:
        | { status: string; deleted_at: string | null }
        | { status: string; deleted_at: string | null }[]
        | null;
    };
    for (const item of stripRes.data ?? []) {
      const row = item as StripRow;
      const contractRel = row.contracts;
      const contract = Array.isArray(contractRel) ? contractRel[0] : contractRel;
      if (!contract) continue;
      if (contract.deleted_at) continue;
      if (!isCommittedContractStatus(contract.status)) continue;
      plantsCommittedNext12w += Number(row.qty_plants ?? 0);
    }
  }

  return {
    year,
    plantsCommittedYtd,
    plantsCommittedPrevYtd,
    plantsDeliveredYtd,
    plantsPendingYtd,
    plantsCommittedNext12w,
    revenueUsdYtd,
    pipelineValueUsd,
    royaltyOwedUsd,
  };
}

/* -------------------------------------------------------------------------- */
/* Week-strip calendar                                                         */
/* -------------------------------------------------------------------------- */

const COMMITTED_CONTRACT_STATUSES = new Set([
  "firmado",
  "en_proceso",
  "finalizado",
]);

function isCommittedContractStatus(status: string | null | undefined): boolean {
  if (!status) return false;
  return COMMITTED_CONTRACT_STATUSES.has(status);
}

type IsoWeek = {
  year: number;
  week: number;
  start: Date;
  end: Date;
};

function buildIsoWeekWindow(from: Date, count: number): IsoWeek[] {
  const baseStart = startOfISOWeek(from);
  const weeks: IsoWeek[] = [];
  for (let i = 0; i < count; i++) {
    const start = addWeeks(baseStart, i);
    const end = endOfISOWeek(start);
    weeks.push({
      year: getISOWeekYear(start),
      week: getISOWeek(start),
      start,
      end,
    });
  }
  return weeks;
}

function groupWeeksByYear(weeks: IsoWeek[]): Map<number, number[]> {
  const map = new Map<number, number[]>();
  for (const w of weeks) {
    const arr = map.get(w.year);
    if (arr) arr.push(w.week);
    else map.set(w.year, [w.week]);
  }
  return map;
}

function capitalizeMonth(date: Date): string {
  return format(date, "MMM", { locale: es })
    .replace(".", "")
    .toUpperCase();
}

function abbreviateSpecies(name: string): string {
  const cleaned = name.trim();
  if (!cleaned) return "—";
  // Toma las primeras 3 letras significativas, capitalizando la inicial.
  const first = cleaned[0]?.toUpperCase() ?? "";
  const rest = cleaned.slice(1, 3).toLowerCase();
  return `${first}${rest}`;
}

export async function getWeekStripData({
  weeks = 12,
}: { weeks?: number } = {}): Promise<WeekStripEntry[]> {
  const supabase = await createClient();
  const window = buildIsoWeekWindow(new Date(), weeks);
  const grouped = groupWeeksByYear(window);
  const currentIsoWeek = getISOWeek(new Date());
  const currentIsoYear = getISOWeekYear(new Date());

  type ItemRow = {
    qty_plants: number | string | null;
    delivery_year: number;
    delivery_week: number;
    contracts:
      | { status: string; deleted_at: string | null }
      | { status: string; deleted_at: string | null }[]
      | null;
    varieties:
      | {
          species_id: string | null;
          species: { id: string; name: string } | { id: string; name: string }[] | null;
        }
      | {
          species_id: string | null;
          species: { id: string; name: string } | { id: string; name: string }[] | null;
        }[]
      | null;
  };

  // Acumulador: clave "year-week" → { total, bySpecies }
  type WeekBucket = {
    total: number;
    species: Map<string, { speciesId: string; name: string; qty: number }>;
  };
  const buckets = new Map<string, WeekBucket>();

  for (const [yearKey, weekNumbers] of grouped) {
    const res = await supabase
      .from("contract_items")
      .select(
        "qty_plants, delivery_year, delivery_week, contracts!inner(status, deleted_at), varieties(species_id, species(id, name))",
      )
      .eq("delivery_year", yearKey)
      .in("delivery_week", weekNumbers)
      .is("deleted_at", null);

    for (const item of res.data ?? []) {
      const row = item as ItemRow;
      const contractRel = row.contracts;
      const contract = Array.isArray(contractRel) ? contractRel[0] : contractRel;
      if (!contract) continue;
      if (contract.deleted_at) continue;
      if (!isCommittedContractStatus(contract.status)) continue;

      const qty = Number(row.qty_plants ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const key = `${row.delivery_year}-${row.delivery_week}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { total: 0, species: new Map() };
        buckets.set(key, bucket);
      }
      bucket.total += qty;

      const varietyRel = row.varieties;
      const variety = Array.isArray(varietyRel) ? varietyRel[0] : varietyRel;
      const species = variety
        ? Array.isArray(variety.species)
          ? variety.species[0]
          : variety.species
        : null;
      const speciesId = species?.id ?? variety?.species_id ?? "__sin_especie__";
      const speciesName = species?.name ?? "Sin especie";

      const existing = bucket.species.get(speciesId);
      if (existing) {
        existing.qty += qty;
      } else {
        bucket.species.set(speciesId, {
          speciesId,
          name: speciesName,
          qty,
        });
      }
    }
  }

  return window.map((w) => {
    const key = `${w.year}-${w.week}`;
    const bucket = buckets.get(key);
    const speciesArr = bucket
      ? [...bucket.species.values()]
          .sort((a, b) => b.qty - a.qty)
          .map<WeekStripSpecies>((s) => ({
            speciesId: s.speciesId,
            name: s.name,
            abbr: abbreviateSpecies(s.name),
            qty: s.qty,
          }))
      : [];

    const startMonth = capitalizeMonth(w.start);
    const endMonth = capitalizeMonth(w.end);

    return {
      year: w.year,
      week: w.week,
      isoLabel: `${w.year}-W${String(w.week).padStart(2, "0")}`,
      startISO: format(w.start, "yyyy-MM-dd"),
      endISO: format(w.end, "yyyy-MM-dd"),
      rangeLabel: `${format(w.start, "d MMM", { locale: es }).replace(".", "")} — ${format(
        w.end,
        "d MMM",
        { locale: es },
      ).replace(".", "")}`,
      monthLabel: startMonth,
      monthLabelEnd: startMonth === endMonth ? null : endMonth,
      totalPlants: bucket?.total ?? 0,
      bySpecies: speciesArr,
      isCurrentWeek: w.year === currentIsoYear && w.week === currentIsoWeek,
    };
  });
}

export async function getTopClients(limit = 5): Promise<TopClient[]> {
  const supabase = await createClient();
  const year = currentYear();
  const yearStart = `${year}-01-01`;
  const nextYearStart = `${year + 1}-01-01`;

  const res = await supabase
    .from("contracts")
    .select(
      "client_id, total_neto_usd, clients(id, name, countries(name_es))",
    )
    .gte("signed_at", yearStart)
    .lt("signed_at", nextYearStart)
    .is("deleted_at", null);

  type ClientRel = { id: string; name: string; countries: { name_es: string } | null };
  const acc = new Map<string, TopClient>();
  for (const c of res.data ?? []) {
    const row = c as { client_id: string | null; total_neto_usd: number | null; clients: unknown };
    if (!row.client_id) continue;
    const clientRel = row.clients as ClientRel | ClientRel[] | null;
    const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
    if (!client) continue;
    const country = Array.isArray(client.countries) ? client.countries[0] : client.countries;
    const existing = acc.get(row.client_id);
    if (existing) {
      existing.revenueUsd += Number(row.total_neto_usd ?? 0);
      existing.contractsCount += 1;
    } else {
      acc.set(row.client_id, {
        id: client.id,
        name: client.name,
        countryName: country?.name_es ?? null,
        revenueUsd: Number(row.total_neto_usd ?? 0),
        contractsCount: 1,
      });
    }
  }

  return [...acc.values()]
    .sort((a, b) => b.revenueUsd - a.revenueUsd)
    .slice(0, limit);
}

export async function getTopVarieties(limit = 5): Promise<TopVariety[]> {
  const supabase = await createClient();
  const year = currentYear();

  const res = await supabase
    .from("contract_items")
    .select(
      "variety_id, qty_plants, varieties(id, name, species(name))",
    )
    .eq("delivery_year", year)
    .is("deleted_at", null);

  type VarietyRel = { id: string; name: string; species: { name: string } | null };
  const acc = new Map<string, TopVariety>();
  for (const it of res.data ?? []) {
    const row = it as { variety_id: string | null; qty_plants: number | string | null; varieties: unknown };
    const varietyRel = row.varieties as VarietyRel | VarietyRel[] | null;
    const variety = Array.isArray(varietyRel) ? varietyRel[0] : varietyRel;
    if (!variety) continue;
    const species = Array.isArray(variety.species) ? variety.species[0] : variety.species;
    const existing = acc.get(variety.id);
    const qty = Number(row.qty_plants ?? 0);
    if (existing) {
      existing.qtyPlants += qty;
    } else {
      acc.set(variety.id, {
        id: variety.id,
        name: variety.name,
        speciesName: species?.name ?? null,
        qtyPlants: qty,
      });
    }
  }

  return [...acc.values()]
    .sort((a, b) => b.qtyPlants - a.qtyPlants)
    .slice(0, limit);
}

export async function getUpcomingDeliveries(weeks = 4): Promise<UpcomingDelivery[]> {
  const supabase = await createClient();
  const now = new Date();
  const year = now.getUTCFullYear();

  // Calcula semana ISO actual de manera simple
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const dayOfYear = Math.floor((now.getTime() - jan1.getTime()) / 86400000) + 1;
  const week = Math.max(1, Math.ceil(dayOfYear / 7));

  const res = await supabase
    .from("contract_items")
    .select(
      "id, qty_plants, delivery_year, delivery_week, status, contracts!inner(client_id, clients(name)), varieties(name)",
    )
    .eq("delivery_year", year)
    .gte("delivery_week", week)
    .lte("delivery_week", week + weeks)
    .neq("status", "finalizado")
    .neq("status", "eliminado")
    .is("deleted_at", null)
    .order("delivery_week", { ascending: true })
    .limit(50);

  type ContractRel = { clients: { name: string } | null };
  type VarietyRel = { name: string };
  return (res.data ?? []).map((it) => {
    const row = it as {
      id: string;
      qty_plants: number | string | null;
      delivery_year: number;
      delivery_week: number;
      status: string;
      contracts: unknown;
      varieties: unknown;
    };
    const contractRel = row.contracts as ContractRel | ContractRel[] | null;
    const contract = Array.isArray(contractRel) ? contractRel[0] : contractRel;
    const clientRel = contract?.clients as { name: string } | { name: string }[] | null | undefined;
    const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
    const varietyRel = row.varieties as VarietyRel | VarietyRel[] | null;
    const variety = Array.isArray(varietyRel) ? varietyRel[0] : varietyRel;
    return {
      id: row.id,
      clientName: client?.name ?? "—",
      varietyName: variety?.name ?? "—",
      qtyPlants: Number(row.qty_plants ?? 0),
      deliveryYear: Number(row.delivery_year),
      deliveryWeek: Number(row.delivery_week),
      status: row.status,
    };
  });
}

export async function getMyPendingTasks(limit = 8): Promise<PendingTask[]> {
  const supabase = await createClient();
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return [];

  const res = await supabase
    .from("opportunity_activities")
    .select("id, subject, type, due_at, opportunity_id, opportunities(name)")
    .eq("owner_id", userId)
    .is("done_at", null)
    .is("deleted_at", null)
    .order("due_at", { ascending: true, nullsFirst: false })
    .limit(limit);

  type Row = NonNullable<typeof res.data>[number];
  type OppRel = { name: string };
  return (res.data ?? []).map((it) => {
    const row = it as Row;
    const oppRel = row.opportunities as OppRel | OppRel[] | null;
    const opp = Array.isArray(oppRel) ? oppRel[0] : oppRel;
    return {
      id: row.id,
      subject: row.subject,
      type: row.type,
      dueAt: row.due_at ?? null,
      opportunityId: row.opportunity_id,
      opportunityName: opp?.name ?? "—",
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Mapa                                                                        */
/* -------------------------------------------------------------------------- */

export type MapFilters = {
  year?: number;
  /**
   * Lista de meses calendario 1-12 a incluir. Si se pasa, filtra
   * contract_items por delivery_week dentro de cualquiera de esos meses
   * (unión). null/undefined o array vacío = todo el año.
   */
  months?: number[] | null;
  organizationId?: string | null;
  speciesId?: string | null;
  includeOpportunities?: boolean;
  contractStatuses?: string[] | null; // null = todos
};

export async function getMapData(
  filters: MapFilters = {},
): Promise<MapCountryDatum[]> {
  const supabase = await createClient();
  const year = filters.year ?? currentYear();
  // Si hay filtro de meses, precomputamos la UNIÓN de semanas ISO que
  // caen en cualquiera de ellos. null/empty = sin filtro de mes (año
  // completo).
  const monthWeeks = (() => {
    const list = filters.months ?? null;
    if (!list || list.length === 0) return null;
    const acc = new Set<number>();
    for (const m of list) {
      if (m >= 1 && m <= 12) {
        for (const w of weeksInMonth(year, m)) acc.add(w);
      }
    }
    return acc.size > 0 ? acc : null;
  })();

  // Lista de países como base
  const countriesRes = await supabase
    .from("countries")
    .select("id, iso2, iso3, name_es");

  const countries = countriesRes.data ?? [];
  const byId = new Map<string, MapCountryDatum>();
  for (const c of countries) {
    byId.set(c.id, {
      countryId: c.id,
      iso2: c.iso2,
      iso3: c.iso3,
      nameEs: c.name_es,
      plantsCommitted: 0,
      plantsFromOpportunities: 0,
      revenueUsd: 0,
      pipelineValueUsd: 0,
      clientsCount: 0,
      contractsCount: 0,
      opportunitiesCount: 0,
    });
  }

  // Contratos del year — necesitamos items para qty_plants
  let contractsQ = supabase
    .from("contracts")
    .select(
      "id, client_id, status, total_neto_usd, organization_id, clients!inner(country_id), contract_items(qty_plants, variety_id, delivery_year, delivery_week, deleted_at, varieties(species_id))",
    )
    .is("deleted_at", null);

  if (filters.organizationId) contractsQ = contractsQ.eq("organization_id", filters.organizationId);
  if (filters.contractStatuses && filters.contractStatuses.length > 0) {
    contractsQ = contractsQ.in("status", filters.contractStatuses);
  }

  const contractsRes = await contractsQ;

  type ContractRow = NonNullable<typeof contractsRes.data>[number];
  type ClientRel = { country_id: string | null };
  type ItemRow = {
    qty_plants: number | string;
    variety_id: string;
    delivery_year: number;
    delivery_week: number | null;
    deleted_at: string | null;
    varieties: { species_id: string | null } | { species_id: string | null }[] | null;
  };

  const clientsByCountry = new Map<string, Set<string>>(); // country_id -> client ids
  for (const c of contractsRes.data ?? []) {
    const row = c as ContractRow;
    const clientRel = row.clients as ClientRel | ClientRel[] | null;
    const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
    if (!client?.country_id) continue;
    const datum = byId.get(client.country_id);
    if (!datum) continue;

    const items = (row.contract_items as ItemRow[] | null) ?? [];
    let plantsInItems = 0;
    let hasItemsInYear = false;
    for (const item of items) {
      if (item.deleted_at) continue;
      if (Number(item.delivery_year) !== year) continue;
      // Filtro de mes: incluir solo items cuya semana ISO cae en el mes.
      // Items sin delivery_week se excluyen del filtro de mes.
      if (monthWeeks) {
        if (item.delivery_week == null) continue;
        if (!monthWeeks.has(Number(item.delivery_week))) continue;
      }
      if (filters.speciesId) {
        const speciesRel = item.varieties as { species_id: string | null } | { species_id: string | null }[] | null;
        const speciesIdItem = Array.isArray(speciesRel) ? speciesRel[0]?.species_id : speciesRel?.species_id;
        if (speciesIdItem !== filters.speciesId) continue;
      }
      plantsInItems += Number(item.qty_plants);
      hasItemsInYear = true;
    }

    datum.plantsCommitted += plantsInItems;
    if (hasItemsInYear) {
      // Revenue del contrato sólo si hay actividad del año
      datum.revenueUsd += Number(row.total_neto_usd ?? 0);
      datum.contractsCount += 1;
      if (row.client_id) {
        let set = clientsByCountry.get(client.country_id);
        if (!set) {
          set = new Set();
          clientsByCountry.set(client.country_id, set);
        }
        set.add(row.client_id);
      }
    }
  }

  for (const [countryId, set] of clientsByCountry) {
    const d = byId.get(countryId);
    if (d) d.clientsCount = set.size;
  }

  if (filters.includeOpportunities) {
    let oppsQ = supabase
      .from("opportunities")
      .select(
        "id, client_id, estimated_value_usd, probability_pct, organization_id, clients(country_id), opportunity_stages!opportunities_stage_id_fkey(is_won, is_lost), opportunity_items(qty_plants_est, expected_delivery_year, deleted_at, varieties(species_id))",
      )
      .is("deleted_at", null);

    if (filters.organizationId) oppsQ = oppsQ.eq("organization_id", filters.organizationId);

    const oppsRes = await oppsQ;
    type OppRow = NonNullable<typeof oppsRes.data>[number];
    type OppStageRel = { is_won: boolean; is_lost: boolean };
    type OppItemRow = {
      qty_plants_est: number | string;
      expected_delivery_year: number | null;
      deleted_at: string | null;
      varieties: { species_id: string | null } | { species_id: string | null }[] | null;
    };

    for (const o of oppsRes.data ?? []) {
      const row = o as OppRow;
      const stageRel = row.opportunity_stages as OppStageRel | OppStageRel[] | null;
      const stage = Array.isArray(stageRel) ? stageRel[0] : stageRel;
      if (!stage || stage.is_won || stage.is_lost) continue;

      const clientRel = row.clients as { country_id: string | null } | { country_id: string | null }[] | null;
      const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
      if (!client?.country_id) continue;
      const datum = byId.get(client.country_id);
      if (!datum) continue;

      const items = (row.opportunity_items as OppItemRow[] | null) ?? [];
      const p = Number(row.probability_pct ?? 0) / 100;
      let plantsWeighted = 0;
      let matched = false;
      for (const item of items) {
        if (item.deleted_at) continue;
        if (item.expected_delivery_year != null && Number(item.expected_delivery_year) !== year) continue;
        if (filters.speciesId) {
          const speciesRel = item.varieties as { species_id: string | null } | { species_id: string | null }[] | null;
          const speciesIdItem = Array.isArray(speciesRel) ? speciesRel[0]?.species_id : speciesRel?.species_id;
          if (speciesIdItem !== filters.speciesId) continue;
        }
        plantsWeighted += Number(item.qty_plants_est) * p;
        matched = true;
      }
      datum.plantsFromOpportunities += plantsWeighted;
      if (matched || items.length === 0) {
        datum.pipelineValueUsd += Number(row.estimated_value_usd ?? 0) * p;
        datum.opportunitiesCount += 1;
      }
    }
  }

  // Filtra los que tienen 0 actividad para no plotear todo el mundo
  return [...byId.values()].filter(
    (d) =>
      d.plantsCommitted > 0 ||
      d.plantsFromOpportunities > 0 ||
      d.revenueUsd > 0 ||
      d.pipelineValueUsd > 0,
  );
}

/* -------------------------------------------------------------------------- */
/* Calendario                                                                  */
/* -------------------------------------------------------------------------- */

export type CalendarEventsParams = {
  fromYear?: number;
  toYear?: number;
  includeOpportunities?: boolean;
  filters?: CalendarFilters;
};

export async function getCalendarEvents(
  params: CalendarEventsParams = {},
): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const year = currentYear();
  const fromYear = params.fromYear ?? year;
  const toYear = params.toYear ?? year + 1;
  const includeOpps = params.includeOpportunities ?? false;
  const filters = params.filters ?? {};

  let q = supabase
    .from("calendar_events")
    .select("*")
    .gte("year", fromYear)
    .lte("year", toYear);

  if (!includeOpps) q = q.eq("source_type", "contract");
  if (filters.ownerId) q = q.eq("owner_id", filters.ownerId);
  if (filters.clientId) q = q.eq("client_id", filters.clientId);
  if (filters.varietyId) q = q.eq("variety_id", filters.varietyId);
  if (filters.organizationId) q = q.eq("organization_id", filters.organizationId);
  if (filters.minProbability != null && filters.minProbability > 0) {
    q = q.or(
      `probability_pct.gte.${filters.minProbability},and(source_type.eq.contract)`,
    );
  }

  const res = await q.limit(2000);
  const events = res.data ?? [];

  // Enriquecer nombres con queries IN
  const clientIds = [...new Set(events.map((e) => e.client_id).filter((x): x is string => !!x))];
  const varietyIds = [...new Set(events.map((e) => e.variety_id).filter((x): x is string => !!x))];
  const orgIds = [...new Set(events.map((e) => e.organization_id).filter((x): x is string => !!x))];
  const ownerIds = [...new Set(events.map((e) => e.owner_id).filter((x): x is string => !!x))];

  const [clientsRes, varietiesRes, orgsRes, ownersRes] = await Promise.all([
    clientIds.length
      ? supabase
          .from("clients")
          .select("id, name, country:countries(id, iso2, name_es)")
          .in("id", clientIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            name: string;
            country:
              | { id: string; iso2: string | null; name_es: string }
              | { id: string; iso2: string | null; name_es: string }[]
              | null;
          }>,
        }),
    varietyIds.length
      ? supabase
          .from("varieties")
          .select("id, name, species_id, species(name)")
          .in("id", varietyIds)
      : Promise.resolve({
          data: [] as Array<{
            id: string;
            name: string;
            species_id: string | null;
            species: { name: string } | { name: string }[] | null;
          }>,
        }),
    orgIds.length
      ? supabase.from("organizations").select("id, name").in("id", orgIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ownerIds.length
      ? supabase.from("app_users").select("id, full_name").in("id", ownerIds)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null }[] }),
  ]);

  type ClientEnriched = {
    name: string;
    countryId: string | null;
    countryIso2: string | null;
    countryName: string | null;
  };
  const clientById = new Map<string, ClientEnriched>(
    (clientsRes.data ?? []).map((c) => {
      const country = Array.isArray(c.country) ? c.country[0] : c.country;
      return [
        c.id,
        {
          name: c.name,
          countryId: country?.id ?? null,
          countryIso2: country?.iso2 ?? null,
          countryName: country?.name_es ?? null,
        },
      ];
    }),
  );
  type VarietyEnriched = { name: string; speciesId: string | null; speciesName: string | null };
  const varietyById = new Map<string, VarietyEnriched>(
    (varietiesRes.data ?? []).map((v) => {
      const sp = Array.isArray(v.species) ? v.species[0] : v.species;
      return [
        v.id,
        { name: v.name, speciesId: v.species_id, speciesName: sp?.name ?? null },
      ];
    }),
  );
  const orgById = new Map((orgsRes.data ?? []).map((o) => [o.id, o.name]));
  const ownerById = new Map((ownersRes.data ?? []).map((u) => [u.id, u.full_name ?? null]));

  // Batch-query contract numbers (solo para events que son de contratos).
  const contractIds = [
    ...new Set(
      events
        .map(
          (e) =>
            (e as typeof e & { contract_id?: string | null }).contract_id ??
            null,
        )
        .filter((x): x is string => !!x),
    ),
  ];
  const contractNumberById = new Map<string, string>();
  if (contractIds.length) {
    const cRes = await supabase
      .from("contracts")
      .select("id, number")
      .in("id", contractIds);
    for (const c of cRes.data ?? []) {
      contractNumberById.set(c.id, c.number);
    }
  }

  let enriched: CalendarEvent[] = events.map((e) => {
    const variety = e.variety_id ? varietyById.get(e.variety_id) : null;
    const client = e.client_id ? clientById.get(e.client_id) : null;
    const raw = e as typeof e & {
      contract_id?: string | null;
      contract_status?: string | null;
      contract_condition?: string | null;
    };
    return {
      ...e,
      clientName: client?.name ?? null,
      countryId: client?.countryId ?? null,
      countryIso2: client?.countryIso2 ?? null,
      countryName: client?.countryName ?? null,
      varietyName: variety?.name ?? null,
      speciesId: variety?.speciesId ?? null,
      speciesName: variety?.speciesName ?? null,
      organizationName: e.organization_id ? orgById.get(e.organization_id) ?? null : null,
      ownerName: e.owner_id ? ownerById.get(e.owner_id) ?? null : null,
      contract_id: raw.contract_id ?? null,
      contract_number: raw.contract_id ? (contractNumberById.get(raw.contract_id) ?? null) : null,
      contract_status: raw.contract_status ?? null,
      contract_condition: raw.contract_condition ?? null,
    };
  });

  // Filtros que dependen del join (speciesId)
  if (filters.speciesId) {
    enriched = enriched.filter((e) => e.speciesId === filters.speciesId);
  }

  return enriched;
}

/* -------------------------------------------------------------------------- */
/* Catálogo                                                                    */
/* -------------------------------------------------------------------------- */

export async function getCatalogStats(varietyId: string): Promise<CatalogStats | null> {
  const supabase = await createClient();
  const year = currentYear();

  const variety = await supabase
    .from("varieties")
    .select(
      "id, name, royalty_per_plant, species(name), genetic_programs(name)",
    )
    .eq("id", varietyId)
    .maybeSingle();

  if (!variety.data) return null;

  // Contract items por año (incluye country del cliente para topCountries)
  const itemsRes = await supabase
    .from("contract_items")
    .select(
      "qty_plants, qty_delivered, delivery_year, unit_price, currency, contract_id, contracts(client_id, clients(id, name, country:countries(iso2, name_es)), total_neto_usd)",
    )
    .eq("variety_id", varietyId)
    .is("deleted_at", null);

  type ItemRow = NonNullable<typeof itemsRes.data>[number];
  type CountryRel = { iso2: string | null; name_es: string };
  type ClientRel = {
    id: string;
    name: string;
    country: CountryRel | CountryRel[] | null;
  };
  type ContractRel = {
    client_id: string | null;
    clients: ClientRel | ClientRel[] | null;
    total_neto_usd: number;
  };

  const byYear = new Map<number, { qty: number; revenue: number }>();
  const byClient = new Map<string, { id: string; name: string; qtyPlants: number }>();
  const byCountry = new Map<string, { iso2: string | null; name: string; qtyPlants: number }>();
  let plantsCommittedYtd = 0;
  let plantsDeliveredYtd = 0;

  for (const item of itemsRes.data ?? []) {
    const row = item as ItemRow;
    const y = Number(row.delivery_year);
    const qty = Number(row.qty_plants ?? 0);
    const delivered = Number(row.qty_delivered ?? 0);

    const yearAcc = byYear.get(y) ?? { qty: 0, revenue: 0 };
    yearAcc.qty += qty;
    // approx revenue line: unit_price * qty (no fx)
    yearAcc.revenue += Number(row.unit_price ?? 0) * qty;
    byYear.set(y, yearAcc);

    if (y === year) {
      plantsCommittedYtd += qty;
      plantsDeliveredYtd += delivered;

      const contractRel = row.contracts as ContractRel | ContractRel[] | null;
      const contract = Array.isArray(contractRel) ? contractRel[0] : contractRel;
      const clientRel = contract?.clients as ClientRel | ClientRel[] | null | undefined;
      const client = Array.isArray(clientRel) ? clientRel[0] : clientRel;
      if (client) {
        const ex = byClient.get(client.id);
        if (ex) ex.qtyPlants += qty;
        else byClient.set(client.id, { id: client.id, name: client.name, qtyPlants: qty });

        // Country aggregation
        const countryRel = client.country as CountryRel | CountryRel[] | null;
        const country = Array.isArray(countryRel) ? countryRel[0] : countryRel;
        if (country) {
          const key = country.iso2 ?? country.name_es;
          const exC = byCountry.get(key);
          if (exC) exC.qtyPlants += qty;
          else byCountry.set(key, { iso2: country.iso2, name: country.name_es, qtyPlants: qty });
        }
      }
    }
  }

  // Pipeline ponderado
  const oppItemsRes = await supabase
    .from("opportunity_items")
    .select(
      "qty_plants_est, expected_delivery_year, opportunities(probability_pct, opportunity_stages!opportunities_stage_id_fkey(is_won, is_lost))",
    )
    .eq("variety_id", varietyId)
    .is("deleted_at", null);

  type OppItemRow = NonNullable<typeof oppItemsRes.data>[number];
  type OppRel = {
    probability_pct: number;
    opportunity_stages: { is_won: boolean; is_lost: boolean } | { is_won: boolean; is_lost: boolean }[] | null;
  };

  let plantsPipeline = 0;
  for (const item of oppItemsRes.data ?? []) {
    const row = item as OppItemRow;
    if (row.expected_delivery_year != null && Number(row.expected_delivery_year) !== year) continue;
    const oppRel = row.opportunities as OppRel | OppRel[] | null;
    const opp = Array.isArray(oppRel) ? oppRel[0] : oppRel;
    if (!opp) continue;
    const stageRel = opp.opportunity_stages;
    const stage = Array.isArray(stageRel) ? stageRel[0] : stageRel;
    if (!stage || stage.is_won || stage.is_lost) continue;
    plantsPipeline += Number(row.qty_plants_est ?? 0) * (Number(opp.probability_pct ?? 0) / 100);
  }

  const sp = Array.isArray(variety.data.species) ? variety.data.species[0] : variety.data.species;
  const gp = Array.isArray(variety.data.genetic_programs)
    ? variety.data.genetic_programs[0]
    : variety.data.genetic_programs;

  return {
    varietyId: variety.data.id,
    varietyName: variety.data.name,
    speciesName: sp?.name ?? null,
    geneticProgram: gp?.name ?? null,
    royaltyPerPlant: variety.data.royalty_per_plant != null ? Number(variety.data.royalty_per_plant) : null,
    plantsCommittedYtd,
    plantsDeliveredYtd,
    plantsPipeline,
    topClients: [...byClient.values()].sort((a, b) => b.qtyPlants - a.qtyPlants).slice(0, 5),
    topCountries: [...byCountry.values()].sort((a, b) => b.qtyPlants - a.qtyPlants).slice(0, 5),
    yearlyTrend: [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([y, v]) => ({ year: y, qtyPlants: v.qty, revenueUsd: v.revenue })),
  };
}

/* -------------------------------------------------------------------------- */
/* Catalogo: tree de especies → variedades                                     */
/* -------------------------------------------------------------------------- */

export type CatalogProgramGroup = {
  programId: string | null;
  programName: string;
  varieties: Array<{ id: string; name: string }>;
};

export type CatalogNode = {
  speciesId: string;
  speciesName: string;
  totalVarieties: number;
  programs: CatalogProgramGroup[];
};

export async function getCatalogTree(): Promise<CatalogNode[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("varieties")
    .select(
      "id, name, species_id, genetic_program_id, species(id, name), genetic_programs(id, name)",
    )
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name");

  type Row = NonNullable<typeof res.data>[number];

  // Group: speciesId → programKey → varieties[]
  const acc = new Map<
    string,
    {
      speciesId: string;
      speciesName: string;
      programs: Map<string, CatalogProgramGroup>;
    }
  >();

  for (const v of res.data ?? []) {
    const row = v as Row;
    if (!row.species_id) continue;
    const sp = Array.isArray(row.species) ? row.species[0] : row.species;
    const gp = Array.isArray(row.genetic_programs)
      ? row.genetic_programs[0]
      : row.genetic_programs;

    let speciesNode = acc.get(row.species_id);
    if (!speciesNode) {
      speciesNode = {
        speciesId: row.species_id,
        speciesName: sp?.name ?? "—",
        programs: new Map(),
      };
      acc.set(row.species_id, speciesNode);
    }

    const programKey = gp?.id ?? "__sin_programa__";
    const programName = gp?.name ?? "Sin programa";
    let group = speciesNode.programs.get(programKey);
    if (!group) {
      group = {
        programId: gp?.id ?? null,
        programName,
        varieties: [],
      };
      speciesNode.programs.set(programKey, group);
    }
    group.varieties.push({ id: row.id, name: row.name });
  }

  return [...acc.values()]
    .map((s) => {
      const programs = [...s.programs.values()].sort((a, b) => {
        // "Libre" siempre primero, luego alfabético
        if (a.programName === "Libre" && b.programName !== "Libre") return -1;
        if (b.programName === "Libre" && a.programName !== "Libre") return 1;
        return a.programName.localeCompare(b.programName);
      });
      const totalVarieties = programs.reduce(
        (sum, p) => sum + p.varieties.length,
        0,
      );
      return {
        speciesId: s.speciesId,
        speciesName: s.speciesName,
        totalVarieties,
        programs,
      };
    })
    .sort((a, b) => a.speciesName.localeCompare(b.speciesName));
}

/* -------------------------------------------------------------------------- */
/* Lookups para filtros                                                        */
/* -------------------------------------------------------------------------- */

export type LookupItem = { id: string; label: string };

export async function getOrganizationsLookup(): Promise<LookupItem[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("organizations")
    .select("id, name")
    .eq("active", true)
    .is("deleted_at", null)
    .order("name");
  return (res.data ?? []).map((o) => ({ id: o.id, label: o.name }));
}

export async function getSpeciesLookup(): Promise<LookupItem[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("species")
    .select("id, name")
    .is("deleted_at", null)
    .order("name");
  return (res.data ?? []).map((s) => ({ id: s.id, label: s.name }));
}

export async function getOwnersLookup(): Promise<LookupItem[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("app_users")
    .select("id, full_name, email")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("full_name");
  return (res.data ?? []).map((u) => ({
    id: u.id,
    label: u.full_name ?? u.email ?? u.id,
  }));
}

export async function getClientsLookup(): Promise<LookupItem[]> {
  const supabase = await createClient();
  const res = await supabase
    .from("clients")
    .select("id, name")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("name")
    .limit(PAGE_SIZE);
  return (res.data ?? []).map((c) => ({ id: c.id, label: c.name }));
}

/* -------------------------------------------------------------------------- */
/* Dashboard Summary — landing page: mapa + KPIs status + KPIs año            */
/* -------------------------------------------------------------------------- */

const STATUS_FIRMADOS = ["firmado", "en_proceso", "finalizado"];
const STATUS_POR_FIRMAR = ["borrador", "por_revisar"];
const STATUS_CANCELADOS = ["cancelado"];

export type DashboardSummaryParams = {
  /**
   * Lista de meses 1-12. Si null/undefined o vacío, el mapa toma el año
   * completo. Acepta múltiples meses (ej. próximos 3 = [5,6,7]).
   */
  months?: number[] | null;
  /** Año del filtro; default = año actual UTC. */
  year?: number;
};

/**
 * Carga todo lo necesario para el Dashboard home en una sola llamada
 * server-side (evita waterfalls):
 *  - mapa con plantas comprometidas por país (filtradas por mes si se pide)
 *  - conteo de contratos por status group (firmados / por firmar / cancelados),
 *    siempre snapshot total (no del mes)
 *  - plantas comprometidas año actual + próximo (totales del año, fijos)
 */
export async function getDashboardSummary(
  params: DashboardSummaryParams = {},
): Promise<DashboardSummary> {
  const year = params.year ?? currentYear();
  const months = params.months && params.months.length > 0 ? params.months : null;
  const supabase = await createClient();

  const [mapData, statusRes, currYearRes, nextYearRes] = await Promise.all([
    // Para el mapa: TODOS los contratos comprometidos (firmados + por firmar),
    // excluyendo solo los cancelados. Los KPIs muestran el desglose por
    // status, así que el mapa muestra el universo de compromisos activos.
    getMapData({
      year,
      months,
      contractStatuses: [...STATUS_FIRMADOS, ...STATUS_POR_FIRMAR],
    }),
    supabase
      .from("contracts")
      .select("status")
      .is("deleted_at", null),
    supabase
      .from("contract_items")
      .select("qty_plants")
      .eq("delivery_year", year)
      .is("deleted_at", null),
    supabase
      .from("contract_items")
      .select("qty_plants")
      .eq("delivery_year", year + 1)
      .is("deleted_at", null),
  ]);

  const statusRows = statusRes.data ?? [];
  const statusCounts: ContractStatusCounts = {
    firmados: 0,
    porFirmar: 0,
    cancelados: 0,
  };
  for (const c of statusRows) {
    const s = c.status as string;
    if (STATUS_FIRMADOS.includes(s)) statusCounts.firmados++;
    else if (STATUS_POR_FIRMAR.includes(s)) statusCounts.porFirmar++;
    else if (STATUS_CANCELADOS.includes(s)) statusCounts.cancelados++;
  }

  const currentYearCommitments: YearCommitmentKpi = {
    year,
    plants: sum(currYearRes.data ?? [], (i) => Number(i.qty_plants)),
  };
  const nextYearCommitments: YearCommitmentKpi = {
    year: year + 1,
    plants: sum(nextYearRes.data ?? [], (i) => Number(i.qty_plants)),
  };

  return {
    year,
    months,
    mapData,
    statusCounts,
    currentYearCommitments,
    nextYearCommitments,
  };
}

/* -------------------------------------------------------------------------- */
/* Top Rankings — dashboard: top 5 por programa genético / cliente / país     */
/* -------------------------------------------------------------------------- */

/**
 * Top 5 por dimensión, basado en USD comprometido del año.
 *
 * Metodología:
 *  - Contratos del año: que tengan al menos un item con delivery_year=year,
 *    en status no cancelado.
 *  - USD por cliente / país: sum directo de contract.total_neto_usd
 *    (ya convertido a USD por la action de contratos).
 *  - USD por programa genético: split prorrateado del total_neto_usd
 *    según la fracción de qty_plants del programa en ese contrato (en
 *    items del año). Esto evita problemas de currency mixto en items.
 */
export async function getTopRankings(params: {
  year?: number;
  /** Si se pasa, filtra los items por delivery_week dentro de esos meses. */
  months?: number[] | null;
} = {}): Promise<TopRankings> {
  const year = params.year ?? currentYear();
  const supabase = await createClient();

  // Set de semanas ISO para filtro de mes (null = año completo).
  const monthWeeks = (() => {
    const list = params.months ?? null;
    if (!list || list.length === 0) return null;
    const acc = new Set<number>();
    for (const m of list) {
      if (m >= 1 && m <= 12) {
        for (const w of weeksInMonth(year, m)) acc.add(w);
      }
    }
    return acc.size > 0 ? acc : null;
  })();

  // Traemos contratos con sus items + datos de cliente/país + programas + kam.
  const { data: contracts } = await supabase
    .from("contracts")
    .select(
      `id, total_neto_usd, status, client_id, kam_id,
       client:clients!inner ( id, name, country:countries ( id, name_es ) ),
       contract_items ( qty_plants, delivery_year, delivery_week, deleted_at, genetic_program_id )`,
    )
    .is("deleted_at", null)
    .in("status", [
      "firmado",
      "en_proceso",
      "finalizado",
      "borrador",
      "por_revisar",
    ]);

  type ClientRel = {
    id: string;
    name: string;
    country: { id: string; name_es: string } | { id: string; name_es: string }[] | null;
  };
  type ItemRow = {
    qty_plants: number | string | null;
    delivery_year: number;
    delivery_week: number | null;
    deleted_at: string | null;
    genetic_program_id: string | null;
  };

  const pickOne = <T,>(v: unknown): T | null => {
    if (!v) return null;
    if (Array.isArray(v)) return (v[0] as T) ?? null;
    return v as T;
  };

  // Mapas para acumular USD por dimensión
  const byClient = new Map<string, { name: string; usd: number }>();
  const byCountry = new Map<string, { name: string; usd: number }>();
  const byProgram = new Map<string, { usd: number }>(); // name se resuelve después
  const byKam = new Map<string, { usd: number }>();    // name se resuelve después

  let grandTotal = 0;

  for (const c of contracts ?? []) {
    const items = (c.contract_items as ItemRow[] | null) ?? [];
    // Items del año (y mes si se filtra)
    const itemsInPeriod = items.filter((it) => {
      if (it.deleted_at) return false;
      if (Number(it.delivery_year) !== year) return false;
      if (monthWeeks) {
        if (it.delivery_week == null) return false;
        if (!monthWeeks.has(Number(it.delivery_week))) return false;
      }
      return true;
    });
    if (itemsInPeriod.length === 0) continue;

    const contractUsd = Number(c.total_neto_usd ?? 0);
    if (contractUsd === 0) continue;

    // Prorrateo: USD atribuido al período = total_neto_usd × (plantas en período / plantas totales del contrato).
    // Para "Año actual" sin filtro de mes, el ratio queda ~1 si todos los items son del año.
    const totalPlantsContract = items.reduce(
      (a, it) => (it.deleted_at ? a : a + Number(it.qty_plants ?? 0)),
      0,
    );
    const plantsInPeriod = itemsInPeriod.reduce(
      (a, it) => a + Number(it.qty_plants ?? 0),
      0,
    );
    const periodRatio = totalPlantsContract > 0 ? plantsInPeriod / totalPlantsContract : 0;
    const usd = contractUsd * periodRatio;
    if (usd === 0) continue;

    grandTotal += usd;

    // Cliente
    const cli = pickOne<ClientRel>(c.client);
    if (cli?.id) {
      const prev = byClient.get(cli.id);
      if (prev) prev.usd += usd;
      else byClient.set(cli.id, { name: cli.name, usd });
    }

    // País
    const country = cli ? pickOne<{ id: string; name_es: string }>(cli.country) : null;
    if (country?.id) {
      const prev = byCountry.get(country.id);
      if (prev) prev.usd += usd;
      else byCountry.set(country.id, { name: country.name_es, usd });
    }

    // Programa genético: split de la usd del período por qty_plants del programa
    if (plantsInPeriod > 0) {
      const plantsByProgram = new Map<string, number>();
      for (const it of itemsInPeriod) {
        const pgId = it.genetic_program_id ?? "__sin_programa__";
        const qty = Number(it.qty_plants ?? 0);
        plantsByProgram.set(pgId, (plantsByProgram.get(pgId) ?? 0) + qty);
      }
      for (const [pgId, plants] of plantsByProgram) {
        const share = plants / plantsInPeriod;
        const attributedUsd = usd * share;
        const prev = byProgram.get(pgId);
        if (prev) prev.usd += attributedUsd;
        else byProgram.set(pgId, { usd: attributedUsd });
      }
    }

    // KAM (owner del contrato): atribuye la usd del período entera al KAM
    // del contrato. Contratos sin KAM caen en el bucket "__sin_kam__".
    {
      const kamKey = c.kam_id ?? "__sin_kam__";
      const prev = byKam.get(kamKey);
      if (prev) prev.usd += usd;
      else byKam.set(kamKey, { usd });
    }
  }

  // Resolver nombres de programas genéticos
  const programIds = Array.from(byProgram.keys()).filter(
    (id) => id !== "__sin_programa__",
  );
  const programNames = new Map<string, string>();
  if (programIds.length > 0) {
    const { data: pgs } = await supabase
      .from("genetic_programs")
      .select("id, name")
      .in("id", programIds);
    for (const pg of pgs ?? []) programNames.set(pg.id, pg.name);
  }

  // Resolver nombres de KAMs (app_users.full_name, fallback a email)
  const kamIds = Array.from(byKam.keys()).filter((id) => id !== "__sin_kam__");
  const kamNames = new Map<string, string>();
  if (kamIds.length > 0) {
    const { data: us } = await supabase
      .from("app_users")
      .select("id, full_name, email")
      .in("id", kamIds);
    for (const u of us ?? []) {
      kamNames.set(u.id, u.full_name ?? u.email ?? "—");
    }
  }

  const buildTop = <K extends string>(
    map: Map<K, { name?: string; usd: number }>,
    nameResolver?: (key: K) => string,
  ): TopRankingItem[] => {
    return Array.from(map.entries())
      .map(([key, val]) => ({
        key: String(key),
        name: val.name ?? nameResolver?.(key) ?? "—",
        totalUsd: val.usd,
        share: grandTotal > 0 ? val.usd / grandTotal : 0,
      }))
      .filter((r) => r.totalUsd > 0)
      .sort((a, b) => b.totalUsd - a.totalUsd)
      .slice(0, 5);
  };

  return {
    year,
    totalUsd: grandTotal,
    programs: buildTop(byProgram, (id) =>
      id === "__sin_programa__"
        ? "Sin programa"
        : programNames.get(id) ?? "—",
    ),
    clients: buildTop(byClient),
    countries: buildTop(byCountry),
    kams: buildTop(byKam, (id) =>
      id === "__sin_kam__" ? "Sin KAM" : kamNames.get(id) ?? "—",
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Catalogo Overview — landing del /catalogo (sin variedad seleccionada)      */
/* -------------------------------------------------------------------------- */

/**
 * Overview del catálogo: cards de stats globales + top 10 variedades
 * del año actual. Se muestra como landing cuando no hay variety en URL.
 */
export async function getCatalogOverview(): Promise<CatalogOverview> {
  const supabase = await createClient();
  const year = currentYear();

  // Counts globales
  const [speciesRes, programsRes, varietiesRes] = await Promise.all([
    supabase.from("species").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("genetic_programs").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("varieties").select("id", { count: "exact", head: true }).is("deleted_at", null),
  ]);

  // Items del año por variedad
  const itemsRes = await supabase
    .from("contract_items")
    .select("qty_plants, delivery_year, variety_id, varieties(id, name, species(name))")
    .eq("delivery_year", year)
    .is("deleted_at", null);

  type ItemRow = NonNullable<typeof itemsRes.data>[number];
  type VarietyRel = {
    id: string;
    name: string;
    species: { name: string } | { name: string }[] | null;
  };

  type Acc = { varietyId: string; name: string; speciesName: string | null; qtyPlants: number };
  const byVariety = new Map<string, Acc>();
  let plantsCommittedYtd = 0;

  for (const item of itemsRes.data ?? []) {
    const row = item as ItemRow;
    const qty = Number(row.qty_plants ?? 0);
    plantsCommittedYtd += qty;

    const varietyRel = row.varieties as VarietyRel | VarietyRel[] | null;
    const variety = Array.isArray(varietyRel) ? varietyRel[0] : varietyRel;
    if (!variety) continue;
    const speciesRel = variety.species as { name: string } | { name: string }[] | null;
    const species = Array.isArray(speciesRel) ? speciesRel[0] : speciesRel;

    const ex = byVariety.get(variety.id);
    if (ex) ex.qtyPlants += qty;
    else
      byVariety.set(variety.id, {
        varietyId: variety.id,
        name: variety.name,
        speciesName: species?.name ?? null,
        qtyPlants: qty,
      });
  }

  const topVarietiesYtd = [...byVariety.values()]
    .sort((a, b) => b.qtyPlants - a.qtyPlants)
    .slice(0, 10);

  return {
    speciesCount: speciesRes.count ?? 0,
    programsCount: programsRes.count ?? 0,
    varietiesCount: varietiesRes.count ?? 0,
    plantsCommittedYtd,
    topVarietiesYtd,
  };
}
