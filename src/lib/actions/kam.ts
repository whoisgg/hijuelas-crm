"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type KAMSummary = {
  id: string;
  fullName: string | null;
  email: string | null;
  role: "admin" | "sales" | "finance" | "viewer";
  isActive: boolean;
  // Aggregated metrics
  activeContracts: number;
  totalContracts: number;
  plantsYtd: number;
  revenueUsdYtd: number;
};

const ACTIVE_STATUSES = ["borrador", "por_revisar", "firmado", "en_proceso"] as const;

export async function listKAMs(): Promise<KAMSummary[]> {
  const supabase = await createClient();
  const currentYear = new Date().getFullYear();

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
    .select("id, kam_id, status, total_neto_usd, signed_at, created_at, items:contract_items(qty_plants)")
    .is("deleted_at", null)
    .not("kam_id", "is", null);

  if (contractsRes.error) throw new Error(contractsRes.error.message);
  type ItemLite = { qty_plants: number | string | null };
  type ContractLite = {
    id: string;
    kam_id: string | null;
    status: string;
    total_neto_usd: number | string | null;
    signed_at: string | null;
    created_at: string;
    items: ItemLite[] | ItemLite | null;
  };

  const contracts: ContractLite[] = (contractsRes.data ?? []) as ContractLite[];

  // 3) Aggregate per KAM
  const aggByKam = new Map<
    string,
    { active: number; total: number; plants: number; usd: number }
  >();
  for (const c of contracts) {
    if (!c.kam_id) continue;
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

    // YTD = signed this year, or created this year if not signed
    const ref = c.signed_at ?? c.created_at;
    if (ref && new Date(ref).getFullYear() === currentYear) {
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
      plantsYtd: agg.plants,
      revenueUsdYtd: agg.usd,
    };
  });
}

export type KAMContractRow = {
  id: string;
  number: string;
  status: string;
  signed_at: string | null;
  created_at: string;
  totalPlants: number;
  totalUsd: number;
  clientName: string | null;
  clientCountryName: string | null;
  organizationName: string | null;
};

export async function getKAMDetail(id: string) {
  const supabase = await createClient();

  const userRes = await supabase
    .from("app_users")
    .select("id, full_name, email, role, is_active, phone, created_at")
    .eq("id", id)
    .single();
  if (userRes.error) throw new Error(userRes.error.message);

  const contractsRes = await supabase
    .from("contracts")
    .select(
      `id, number, status, signed_at, created_at, total_neto_usd,
       client:clients!contracts_client_id_fkey ( id, name, country:countries ( name_es ) ),
       organization:organizations!contracts_organization_id_fkey ( id, name ),
       items:contract_items ( id, qty_plants )`,
    )
    .eq("kam_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (contractsRes.error) throw new Error(contractsRes.error.message);

  type ContractRowRaw = {
    id: string;
    number: string;
    status: string;
    signed_at: string | null;
    created_at: string;
    total_neto_usd: number | string | null;
    client: unknown;
    organization: unknown;
    items: unknown;
  };

  type ClientRel = { id: string; name: string; country: unknown };
  type CountryRel = { name_es: string };
  type OrgRel = { id: string; name: string };
  type ItemRel = { id: string; qty_plants: number | string | null };

  const pickOne = <T,>(v: unknown): T | null => {
    if (!v) return null;
    if (Array.isArray(v)) return (v[0] as T) ?? null;
    return v as T;
  };

  const rows: KAMContractRow[] = (contractsRes.data ?? [] as ContractRowRaw[]).map((c) => {
    const raw = c as ContractRowRaw;
    const client = pickOne<ClientRel>(raw.client);
    const country = client ? pickOne<CountryRel>(client.country) : null;
    const org = pickOne<OrgRel>(raw.organization);
    const items: ItemRel[] = Array.isArray(raw.items) ? (raw.items as ItemRel[]) : [];
    const totalPlants = items.reduce((s, it) => s + Number(it.qty_plants ?? 0), 0);
    return {
      id: raw.id,
      number: raw.number,
      status: raw.status,
      signed_at: raw.signed_at,
      created_at: raw.created_at,
      totalPlants,
      totalUsd: Number(raw.total_neto_usd ?? 0),
      clientName: client?.name ?? null,
      clientCountryName: country?.name_es ?? null,
      organizationName: org?.name ?? null,
    };
  });

  return { user: userRes.data, contracts: rows };
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
