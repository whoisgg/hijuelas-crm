"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import {
  isInPeriod,
  resolveKamPeriod,
  type KamPeriodValue,
} from "@/lib/kam-period";
import { matchesKamStatuses, parseKamStatuses } from "@/lib/kam-status";
import {
  matchesContractConditions,
  parseContractConditions,
} from "@/lib/contract-condition";

export type KAMSummary = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: "admin" | "sales" | "finance" | "viewer";
  isActive: boolean;
  // Aggregated metrics — todas respetan el filtro de status
  activeContracts: number;
  totalContracts: number;
  /** Plantas dentro del período seleccionado (period.fromYear..toYear) */
  plantsInPeriod: number;
  /** Revenue USD dentro del período seleccionado */
  revenueUsdInPeriod: number;
};

const ACTIVE_STATUSES = ["borrador", "por_revisar", "firmado", "en_proceso"] as const;

export async function listKAMs(
  rawPeriod?: KamPeriodValue | string,
  rawStatuses?: string,
  rawConditions?: string,
): Promise<KAMSummary[]> {
  const supabase = await createClient();
  const period = resolveKamPeriod(rawPeriod);
  const statusFilter = parseKamStatuses(rawStatuses);
  const conditionFilter = parseContractConditions(rawConditions);

  // 1) Pull users with role 'sales' only (admins are excluded from KAM listing)
  const usersRes = await supabase
    .from("app_users")
    .select("id, full_name, email, role, is_active")
    .is("deleted_at", null)
    .eq("role", "sales")
    .order("full_name", { ascending: true });

  if (usersRes.error) throw new Error(usersRes.error.message);
  const users = usersRes.data ?? [];

  // 2) Pull contracts with kam_id + their items
  const contractsRes = await supabase
    .from("contracts")
    .select("id, kam_id, status, condition, total_neto_usd, signed_at, created_at, items:contract_items(qty_plants)")
    .is("deleted_at", null)
    .not("kam_id", "is", null);

  if (contractsRes.error) throw new Error(contractsRes.error.message);
  type ItemLite = { qty_plants: number | string | null };
  type ContractLite = {
    id: string;
    kam_id: string | null;
    status: string;
    condition: string | null;
    total_neto_usd: number | string | null;
    signed_at: string | null;
    created_at: string;
    items: ItemLite[] | ItemLite | null;
  };

  const contracts: ContractLite[] = (contractsRes.data ?? []) as ContractLite[];

  // 3) Aggregate per KAM — solo contratos cuyo status y condition pasen el filtro
  const aggByKam = new Map<
    string,
    { active: number; total: number; plants: number; usd: number }
  >();
  for (const c of contracts) {
    if (!c.kam_id) continue;
    if (!matchesKamStatuses(c.status, statusFilter)) continue;
    if (!matchesContractConditions(c.condition, conditionFilter)) continue;

    let agg = aggByKam.get(c.kam_id);
    if (!agg) {
      agg = { active: 0, total: 0, plants: 0, usd: 0 };
      aggByKam.set(c.kam_id, agg);
    }
    agg.total += 1;
    if ((ACTIVE_STATUSES as readonly string[]).includes(c.status)) agg.active += 1;

    const items: ItemLite[] = Array.isArray(c.items)
      ? c.items
      : c.items
        ? [c.items]
        : [];
    const plants = items.reduce((s, it) => s + Number(it.qty_plants ?? 0), 0);

    // Plants + USD se acumulan solo si el contrato cae en el período seleccionado.
    const ref = c.signed_at ?? c.created_at;
    if (isInPeriod(ref, period)) {
      agg.plants += plants;
      agg.usd += Number(c.total_neto_usd ?? 0);
    }
  }

  return users.map((u) => {
    const agg = aggByKam.get(u.id) ?? { active: 0, total: 0, plants: 0, usd: 0 };
    return {
      id: u.id,
      fullName: u.full_name,
      email: u.email,
      role: u.role,
      isActive: u.is_active,
      activeContracts: agg.active,
      totalContracts: agg.total,
      plantsInPeriod: agg.plants,
      revenueUsdInPeriod: agg.usd,
    };
  });
}

export type KAMContractRow = {
  id: string;
  number: string;
  status: string;
  condition: string;
  signed_at: string | null;
  created_at: string;
  totalPlants: number;
  totalUsd: number;
  clientName: string | null;
  clientCountryIso2: string | null;
  clientCountryName: string | null;
  organizationName: string | null;
};

/** Contrato contribuyendo a un bucket (program, country). */
export type KAMGroupedContract = {
  id: string;
  number: string;
  status: string;
  condition: string;
  signed_at: string | null;
  created_at: string;
  /** Plantas del contrato dentro de este bucket (program × country). */
  plants: number;
  /** USD prorrateado al bucket por share de plantas. */
  usd: number;
  /** Plantas totales del contrato (para mostrar share). */
  contractTotalPlants: number;
  clientName: string | null;
};

export type KAMCountryGroup = {
  iso2: string;
  name: string;
  plants: number;
  usd: number;
  contractCount: number;
  contracts: KAMGroupedContract[];
};

export type KAMProgramGroup = {
  id: string;
  name: string;
  plants: number;
  usd: number;
  contractCount: number;
  byCountry: KAMCountryGroup[];
};

const UNKNOWN_PROGRAM_ID = "__no_program__";
const UNKNOWN_PROGRAM_NAME = "Sin programa";
const UNKNOWN_COUNTRY_ISO = "??";
const UNKNOWN_COUNTRY_NAME = "Sin país";

export async function getKAMDetail(
  id: string,
  rawStatuses?: string,
  rawConditions?: string,
) {
  const supabase = await createClient();
  const statusFilter = parseKamStatuses(rawStatuses);
  const conditionFilter = parseContractConditions(rawConditions);

  const userRes = await supabase
    .from("app_users")
    .select("id, full_name, email, role, is_active, phone, created_at")
    .eq("id", id)
    .single();
  if (userRes.error) throw new Error(userRes.error.message);

  const contractsRes = await supabase
    .from("contracts")
    .select(
      `id, number, status, condition, signed_at, created_at, total_neto_usd,
       client:clients!contracts_client_id_fkey (
         id, name,
         country:countries ( iso2, name_es )
       ),
       organization:organizations!contracts_organization_id_fkey ( id, name ),
       items:contract_items (
         id, qty_plants, genetic_program_id,
         program:genetic_programs ( id, name )
       )`,
    )
    .eq("kam_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (contractsRes.error) throw new Error(contractsRes.error.message);

  type ContractRowRaw = {
    id: string;
    number: string;
    status: string;
    condition: string | null;
    signed_at: string | null;
    created_at: string;
    total_neto_usd: number | string | null;
    client: unknown;
    organization: unknown;
    items: unknown;
  };

  type ClientRel = { id: string; name: string; country: unknown };
  type CountryRel = { iso2: string | null; name_es: string };
  type OrgRel = { id: string; name: string };
  type ProgramRel = { id: string; name: string };
  type ItemRel = {
    id: string;
    qty_plants: number | string | null;
    genetic_program_id: string | null;
    program: unknown;
  };

  const pickOne = <T,>(v: unknown): T | null => {
    if (!v) return null;
    if (Array.isArray(v)) return (v[0] as T) ?? null;
    return v as T;
  };

  // Flatten contracts → KAMContractRow[] (mantiene la forma legacy)
  // y al mismo tiempo construye el árbol agrupado por programa → país.
  const rawContracts: ContractRowRaw[] = (contractsRes.data ?? []) as ContractRowRaw[];

  const flatRows: KAMContractRow[] = [];
  const programMap = new Map<string, KAMProgramGroup>();

  for (const raw of rawContracts) {
    if (!matchesKamStatuses(raw.status, statusFilter)) continue;
    if (!matchesContractConditions(raw.condition, conditionFilter)) continue;

    const client = pickOne<ClientRel>(raw.client);
    const country = client ? pickOne<CountryRel>(client.country) : null;
    const org = pickOne<OrgRel>(raw.organization);
    const items: ItemRel[] = Array.isArray(raw.items) ? (raw.items as ItemRel[]) : [];
    const totalPlants = items.reduce(
      (s, it) => s + Number(it.qty_plants ?? 0),
      0,
    );
    const totalUsd = Number(raw.total_neto_usd ?? 0);

    flatRows.push({
      id: raw.id,
      number: raw.number,
      status: raw.status,
      condition: raw.condition ?? "venta",
      signed_at: raw.signed_at,
      created_at: raw.created_at,
      totalPlants,
      totalUsd,
      clientName: client?.name ?? null,
      clientCountryIso2: country?.iso2 ?? null,
      clientCountryName: country?.name_es ?? null,
      organizationName: org?.name ?? null,
    });

    // Agrupar plantas por (program × país) y prorratear USD.
    const countryIso = country?.iso2 ?? UNKNOWN_COUNTRY_ISO;
    const countryName = country?.name_es ?? UNKNOWN_COUNTRY_NAME;

    // Plantas por programa dentro de este contrato
    const plantsByProgram = new Map<
      string,
      { programId: string; programName: string; plants: number }
    >();
    for (const it of items) {
      const plants = Number(it.qty_plants ?? 0);
      const program = pickOne<ProgramRel>(it.program);
      const programId = program?.id ?? it.genetic_program_id ?? UNKNOWN_PROGRAM_ID;
      const programName = program?.name ?? UNKNOWN_PROGRAM_NAME;
      const cur = plantsByProgram.get(programId) ?? {
        programId,
        programName,
        plants: 0,
      };
      cur.plants += plants;
      plantsByProgram.set(programId, cur);
    }

    for (const [, bucket] of plantsByProgram) {
      const share = totalPlants > 0 ? bucket.plants / totalPlants : 0;
      const usdShare = totalUsd * share;

      let pg = programMap.get(bucket.programId);
      if (!pg) {
        pg = {
          id: bucket.programId,
          name: bucket.programName,
          plants: 0,
          usd: 0,
          contractCount: 0,
          byCountry: [],
        };
        programMap.set(bucket.programId, pg);
      }
      pg.plants += bucket.plants;
      pg.usd += usdShare;

      // Find or create country sub-group
      let cg = pg.byCountry.find((c) => c.iso2 === countryIso);
      if (!cg) {
        cg = {
          iso2: countryIso,
          name: countryName,
          plants: 0,
          usd: 0,
          contractCount: 0,
          contracts: [],
        };
        pg.byCountry.push(cg);
      }
      cg.plants += bucket.plants;
      cg.usd += usdShare;
      cg.contracts.push({
        id: raw.id,
        number: raw.number,
        status: raw.status,
        condition: raw.condition ?? "venta",
        signed_at: raw.signed_at,
        created_at: raw.created_at,
        plants: bucket.plants,
        usd: usdShare,
        contractTotalPlants: totalPlants,
        clientName: client?.name ?? null,
      });
    }
  }

  // Compute unique contract counts at every node + sort por USD descendente.
  // Sort consistente en todos los niveles: el programa/país/contrato con
  // mayor revenue va primero.
  for (const pg of programMap.values()) {
    const seenInProgram = new Set<string>();
    for (const cg of pg.byCountry) {
      const seenInCountry = new Set<string>();
      for (const c of cg.contracts) {
        seenInCountry.add(c.id);
        seenInProgram.add(c.id);
      }
      cg.contractCount = seenInCountry.size;
      cg.contracts.sort((a, b) => b.usd - a.usd);
    }
    pg.contractCount = seenInProgram.size;
    pg.byCountry.sort((a, b) => b.usd - a.usd);
  }

  const groups = Array.from(programMap.values()).sort(
    (a, b) => b.usd - a.usd,
  );

  return {
    user: userRes.data,
    contracts: flatRows,
    groups,
  };
}

export async function assignKamToContract(contractId: string, kamId: string | null) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contracts")
    .update({ kam_id: kamId })
    .eq("id", contractId);
  if (error) throw new Error(error.message);
  revalidatePath(`/contratos/${contractId}`);
  revalidatePath(`/kam`);
  if (kamId) revalidatePath(`/kam/${kamId}`);
}

export async function listKAMsForSelect() {
  const supabase = await createClient();
  const res = await supabase
    .from("app_users")
    .select("id, full_name, email, role")
    .is("deleted_at", null)
    .eq("is_active", true)
    .in("role", ["admin", "sales"])
    .order("full_name", { ascending: true });
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []).map((u) => ({
    id: u.id,
    label: u.full_name ?? u.email ?? "Sin nombre",
    role: u.role,
  }));
}
