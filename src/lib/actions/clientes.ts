"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/database.types";
import {
  DEFAULT_PAGE_SIZE,
  createAddressSchema,
  createClientSchema,
  createContactSchema,
  updateClientSchema,
  type ActionResult,
  type ClientDetail,
  type ClientListItem,
  type CountryOption,
  type CreateAddressInput,
  type CreateClientInput,
  type CreateContactInput,
  type ListClientsResult,
  type OwnerOption,
  type UpdateClientInput,
} from "@/lib/actions/clientes-types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  return error.code === "23505" || /duplicate key/i.test(error.message ?? "");
}

/** Algunas relaciones llegan como objeto único pero el codegen las tipa como
 * array. Normalizamos siempre al primer elemento. */
function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

async function logActivity(
  supabase: Awaited<ReturnType<typeof createClient>>,
  params: {
    entityType: string;
    entityId: string;
    action: string;
    diff?: Record<string, unknown>;
    actorId?: string | null;
  },
) {
  // Best-effort: don't throw si el insert falla (p.ej. RLS lo bloquea).
  try {
    await supabase.from("activity_log").insert({
      entity_type: params.entityType,
      entity_id: params.entityId,
      action: params.action,
      actor_id: params.actorId ?? null,
      diff_json: (params.diff ?? null) as Json | null,
    });
  } catch {
    // ignore
  }
}

function diffRecords<T extends Record<string, unknown>>(
  before: T,
  patch: Partial<T>,
): Record<string, { before: unknown; after: unknown }> {
  const diff: Record<string, { before: unknown; after: unknown }> = {};
  for (const k of Object.keys(patch)) {
    const a = before[k];
    const b = patch[k];
    if (a !== b) diff[k] = { before: a, after: b };
  }
  return diff;
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------

/**
 * Returns ALL clients with country + active contracts count (for the by-country view).
 * No pagination — used for client-side aggregation in the country grid.
 */
export async function listAllClientsForCountryView(): Promise<
  Array<{
    id: string;
    name: string;
    countryId: string | null;
    countryIso2: string | null;
    countryName: string | null;
    isActive: boolean;
    activeContracts: number;
  }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select(
      `id, name, is_active,
       country:countries ( id, iso2, name_es )`,
    )
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);

  const ids = (data ?? []).map((c) => c.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: contracts } = await supabase
      .from("contracts")
      .select("client_id, status")
      .is("deleted_at", null)
      .in("client_id", ids)
      .in("status", ["firmado", "en_proceso", "borrador", "por_revisar"]);
    for (const c of contracts ?? []) {
      if (!c.client_id) continue;
      counts.set(c.client_id, (counts.get(c.client_id) ?? 0) + 1);
    }
  }

  type CountryRel = { id: string; iso2: string | null; name_es: string };
  const pickOne = <T,>(v: unknown): T | null => {
    if (!v) return null;
    if (Array.isArray(v)) return (v[0] as T) ?? null;
    return v as T;
  };

  return (data ?? []).map((c) => {
    const country = pickOne<CountryRel>(c.country);
    return {
      id: c.id,
      name: c.name,
      countryId: country?.id ?? null,
      countryIso2: country?.iso2 ?? null,
      countryName: country?.name_es ?? null,
      isActive: c.is_active ?? true,
      activeContracts: counts.get(c.id) ?? 0,
    };
  });
}

export async function listClients(
  params: {
    search?: string;
    countryId?: string | null;
    ownerId?: string | null;
    isActive?: boolean | null;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<ListClientsResult> {
  const supabase = await createClient();
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.max(
    1,
    Math.min(200, params.pageSize ?? DEFAULT_PAGE_SIZE),
  );
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("clients")
    .select(
      `
        id, name, legal_name, tax_id, giro, region, notes, is_active, source,
        created_at, updated_at,
        country:countries ( id, name_es, iso2 ),
        owner:app_users!clients_account_owner_id_fkey ( id, full_name, email )
      `,
      { count: "exact" },
    )
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .range(from, to);

  const search = params.search?.trim();
  if (search) {
    const pattern = `%${search}%`;
    query = query.or(
      `name.ilike.${pattern},legal_name.ilike.${pattern},tax_id.ilike.${pattern}`,
    );
  }
  if (params.countryId) query = query.eq("country_id", params.countryId);
  if (params.ownerId) query = query.eq("account_owner_id", params.ownerId);
  if (typeof params.isActive === "boolean") {
    query = query.eq("is_active", params.isActive);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[listClients]", error);
    return { data: [], total: 0, page, pageSize };
  }

  const ids = (data ?? []).map((row) => row.id);

  const activeContractsByClient: Record<string, number> = {};
  const lastActivityByClient: Record<string, string> = {};

  if (ids.length > 0) {
    const { data: contracts } = await supabase
      .from("contracts")
      .select("client_id, status")
      .is("deleted_at", null)
      .in("client_id", ids)
      .in("status", ["firmado", "en_proceso"]);

    for (const c of contracts ?? []) {
      if (!c.client_id) continue;
      activeContractsByClient[c.client_id] =
        (activeContractsByClient[c.client_id] ?? 0) + 1;
    }

    const { data: activity } = await supabase
      .from("activity_log")
      .select("entity_id, created_at")
      .eq("entity_type", "clients")
      .in("entity_id", ids)
      .order("created_at", { ascending: false });

    for (const a of activity ?? []) {
      if (!lastActivityByClient[a.entity_id]) {
        lastActivityByClient[a.entity_id] = a.created_at;
      }
    }
  }

  const items: ClientListItem[] = (data ?? []).map((row) => {
    const country = pickOne(row.country);
    const owner = pickOne(row.owner);
    return {
      id: row.id,
      name: row.name,
      legal_name: row.legal_name,
      tax_id: row.tax_id,
      giro: row.giro,
      region: row.region,
      notes: row.notes,
      is_active: row.is_active,
      source: row.source,
      created_at: row.created_at,
      updated_at: row.updated_at,
      country: country
        ? { id: country.id, name_es: country.name_es, iso2: country.iso2 }
        : null,
      owner: owner
        ? { id: owner.id, full_name: owner.full_name, email: owner.email }
        : null,
      active_contracts: activeContractsByClient[row.id] ?? 0,
      last_activity_at: lastActivityByClient[row.id] ?? null,
    };
  });

  return { data: items, total: count ?? items.length, page, pageSize };
}

// ---------------------------------------------------------------------------
// Get one
// ---------------------------------------------------------------------------

export async function getClient(id: string): Promise<ClientDetail | null> {
  const supabase = await createClient();

  const { data: client, error } = await supabase
    .from("clients")
    .select(
      `
        *,
        country:countries ( id, name_es, iso2 ),
        owner:app_users!clients_account_owner_id_fkey ( id, full_name, email )
      `,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[getClient]", error);
    return null;
  }
  if (!client) return null;

  const [
    { data: contacts },
    { data: addresses },
    { data: contracts },
    { data: opportunities },
    { data: activity },
    { count: contractsCount },
    { count: opportunitiesCount },
    { count: contactsCount },
    { count: addressesCount },
  ] = await Promise.all([
    supabase
      .from("client_contacts")
      .select("*")
      .eq("client_id", id)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .order("name", { ascending: true }),
    supabase
      .from("client_addresses")
      .select("*, country:countries ( id, name_es, iso2 )")
      .eq("client_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: true }),
    supabase
      .from("contracts")
      .select(
        "id, number, status, total_neto, total_neto_usd, currency, signed_at, created_at",
      )
      .eq("client_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("opportunities")
      .select(
        "id, name, stage_id, estimated_value, estimated_value_usd, expected_close_date, probability_pct, currency, created_at",
      )
      .eq("client_id", id)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_log")
      .select("*")
      .eq("entity_type", "clients")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("contracts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id)
      .is("deleted_at", null),
    supabase
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id)
      .is("deleted_at", null),
    supabase
      .from("client_contacts")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id)
      .is("deleted_at", null),
    supabase
      .from("client_addresses")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id)
      .is("deleted_at", null),
  ]);

  const clientCountry = pickOne(client.country);
  const clientOwner = pickOne(client.owner);

  // Normalizar addresses (country viene como array por el codegen)
  const normalizedAddresses = (addresses ?? []).map((addr) => {
    const country = pickOne(addr.country);
    return {
      ...addr,
      country: country
        ? { id: country.id, name_es: country.name_es, iso2: country.iso2 }
        : null,
    };
  });

  return {
    client: {
      ...client,
      country: clientCountry
        ? {
            id: clientCountry.id,
            name_es: clientCountry.name_es,
            iso2: clientCountry.iso2,
          }
        : null,
      owner: clientOwner
        ? {
            id: clientOwner.id,
            full_name: clientOwner.full_name,
            email: clientOwner.email,
          }
        : null,
    },
    counts: {
      contracts: contractsCount ?? 0,
      opportunities: opportunitiesCount ?? 0,
      contacts: contactsCount ?? 0,
      addresses: addressesCount ?? 0,
    },
    contacts: contacts ?? [],
    addresses: normalizedAddresses,
    contracts: contracts ?? [],
    opportunities: opportunities ?? [],
    activity: activity ?? [],
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createClientAction(
  raw: CreateClientInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createClientSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Datos inválidos",
      field: first?.path[0]?.toString(),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const insertPayload: Database["public"]["Tables"]["clients"]["Insert"] = {
    name: parsed.data.name,
    legal_name: parsed.data.legal_name ?? null,
    tax_id: parsed.data.tax_id ?? null,
    giro: parsed.data.giro ?? null,
    country_id: parsed.data.country_id ?? null,
    region: parsed.data.region ?? null,
    notes: parsed.data.notes ?? null,
    created_by: user?.id ?? null,
    updated_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from("clients")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "Ya existe un cliente con ese tax_id.",
        field: "tax_id",
      };
    }
    console.error("[createClientAction]", error);
    return { ok: false, error: error.message };
  }

  await logActivity(supabase, {
    entityType: "clients",
    entityId: data.id,
    action: "created",
    diff: { after: insertPayload },
    actorId: user?.id ?? null,
  });

  revalidatePath("/clientes");
  return { ok: true, data: { id: data.id } };
}

/**
 * Form-action wrapper: lee FormData, valida y redirige al detalle.
 * Pensado para usarse con `<form action={createClientFormAction}>`.
 */
export async function createClientFormAction(formData: FormData): Promise<void> {
  const raw: CreateClientInput = {
    name: String(formData.get("name") ?? ""),
    legal_name: formData.get("legal_name")?.toString() ?? null,
    tax_id: formData.get("tax_id")?.toString() ?? null,
    giro: formData.get("giro")?.toString() ?? null,
    country_id: formData.get("country_id")?.toString() || null,
    region: formData.get("region")?.toString() ?? null,
    notes: formData.get("notes")?.toString() ?? null,
  };
  const result = await createClientAction(raw);
  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error });
    if (result.field) params.set("field", result.field);
    redirect(`/clientes/nuevo?${params.toString()}`);
  }
  redirect(`/clientes/${result.data.id}`);
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateClientAction(
  id: string,
  raw: UpdateClientInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = updateClientSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Datos inválidos",
      field: first?.path[0]?.toString(),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: before } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!before) return { ok: false, error: "Cliente no encontrado" };

  const patch: Database["public"]["Tables"]["clients"]["Update"] = {
    name: parsed.data.name,
    legal_name: parsed.data.legal_name ?? null,
    tax_id: parsed.data.tax_id ?? null,
    giro: parsed.data.giro ?? null,
    country_id: parsed.data.country_id ?? null,
    region: parsed.data.region ?? null,
    notes: parsed.data.notes ?? null,
    account_owner_id: parsed.data.account_owner_id ?? null,
    ...(typeof parsed.data.is_active === "boolean"
      ? { is_active: parsed.data.is_active }
      : {}),
    updated_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("clients").update(patch).eq("id", id);
  if (error) {
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        error: "Ya existe un cliente con ese tax_id.",
        field: "tax_id",
      };
    }
    console.error("[updateClientAction]", error);
    return { ok: false, error: error.message };
  }

  const diff = diffRecords(before as Record<string, unknown>, patch);
  if (Object.keys(diff).length > 0) {
    await logActivity(supabase, {
      entityType: "clients",
      entityId: id,
      action: "updated",
      diff,
      actorId: user?.id ?? null,
    });
  }

  revalidatePath(`/clientes/${id}`);
  revalidatePath("/clientes");
  return { ok: true, data: { id } };
}

// ---------------------------------------------------------------------------
// Soft delete
// ---------------------------------------------------------------------------

export async function softDeleteClientAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("clients")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: user?.id ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("[softDeleteClientAction]", error);
    return { ok: false, error: error.message };
  }

  await logActivity(supabase, {
    entityType: "clients",
    entityId: id,
    action: "archived",
    actorId: user?.id ?? null,
  });

  revalidatePath("/clientes");
  return { ok: true, data: { id } };
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

export async function createContactAction(
  clientId: string,
  raw: CreateContactInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createContactSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Datos inválidos",
      field: first?.path[0]?.toString(),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (parsed.data.is_primary) {
    await supabase
      .from("client_contacts")
      .update({ is_primary: false })
      .eq("client_id", clientId)
      .eq("is_primary", true);
  }

  const insertPayload: Database["public"]["Tables"]["client_contacts"]["Insert"] = {
    client_id: clientId,
    name: parsed.data.name,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    role: parsed.data.role ?? null,
    notes: parsed.data.notes ?? null,
    is_primary: parsed.data.is_primary ?? false,
    created_by: user?.id ?? null,
    updated_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from("client_contacts")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    console.error("[createContactAction]", error);
    return { ok: false, error: error.message };
  }

  await logActivity(supabase, {
    entityType: "clients",
    entityId: clientId,
    action: "contact_added",
    diff: { contact_id: data.id, after: insertPayload },
    actorId: user?.id ?? null,
  });

  revalidatePath(`/clientes/${clientId}`);
  return { ok: true, data: { id: data.id } };
}

export async function setPrimaryContactAction(
  clientId: string,
  contactId: string,
): Promise<ActionResult<{ id: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error: e1 } = await supabase
    .from("client_contacts")
    .update({ is_primary: false })
    .eq("client_id", clientId);
  if (e1) {
    console.error("[setPrimaryContactAction]", e1);
    return { ok: false, error: e1.message };
  }

  const { error: e2 } = await supabase
    .from("client_contacts")
    .update({ is_primary: true, updated_by: user?.id ?? null })
    .eq("id", contactId)
    .eq("client_id", clientId);
  if (e2) {
    console.error("[setPrimaryContactAction]", e2);
    return { ok: false, error: e2.message };
  }

  await logActivity(supabase, {
    entityType: "clients",
    entityId: clientId,
    action: "contact_set_primary",
    diff: { contact_id: contactId },
    actorId: user?.id ?? null,
  });

  revalidatePath(`/clientes/${clientId}`);
  return { ok: true, data: { id: contactId } };
}

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

export async function createAddressAction(
  clientId: string,
  raw: CreateAddressInput,
): Promise<ActionResult<{ id: string }>> {
  const parsed = createAddressSchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return {
      ok: false,
      error: first?.message ?? "Datos inválidos",
      field: first?.path[0]?.toString(),
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const insertPayload: Database["public"]["Tables"]["client_addresses"]["Insert"] = {
    client_id: clientId,
    type: parsed.data.type ?? null,
    line1: parsed.data.line1 ?? null,
    line2: parsed.data.line2 ?? null,
    region: parsed.data.region ?? null,
    postal_code: parsed.data.postal_code ?? null,
    country_id: parsed.data.country_id ?? null,
    created_by: user?.id ?? null,
    updated_by: user?.id ?? null,
  };

  const { data, error } = await supabase
    .from("client_addresses")
    .insert(insertPayload)
    .select("id")
    .single();

  if (error) {
    console.error("[createAddressAction]", error);
    return { ok: false, error: error.message };
  }

  await logActivity(supabase, {
    entityType: "clients",
    entityId: clientId,
    action: "address_added",
    diff: { address_id: data.id, after: insertPayload },
    actorId: user?.id ?? null,
  });

  revalidatePath(`/clientes/${clientId}`);
  return { ok: true, data: { id: data.id } };
}

// ---------------------------------------------------------------------------
// Reference data (countries, owners)
// ---------------------------------------------------------------------------

export async function listCountries(): Promise<CountryOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("countries")
    .select("id, name_es, iso2")
    .is("deleted_at", null)
    .order("name_es", { ascending: true });
  if (error) {
    console.error("[listCountries]", error);
    return [];
  }
  return data ?? [];
}

/**
 * Lista liviana (id, name) para selects — ej. "despachar a" en entregas.
 */
export async function listClientsForSelect(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .select("id, name")
    .is("deleted_at", null)
    .order("name", { ascending: true });
  if (error) {
    console.error("[listClientsForSelect]", error);
    return [];
  }
  return data ?? [];
}

/* -------------------------------------------------------------------------- */
/* Leaderboard — vista clientes por valor                                     */
/* -------------------------------------------------------------------------- */

export type ClientLeaderRow = {
  id: string;
  name: string;
  isActive: boolean;
  country: { iso2: string | null; name: string } | null;
  kam: { id: string; name: string } | null;
  activeContracts: number;       // count of contratos no cancelados
  totalUsd: number;              // suma total_neto_usd de esos contratos
  totalPlants: number;           // suma qty_plants de items de esos contratos
};

/**
 * Lista completa de clientes con métricas agregadas — usada en el
 * leaderboard del /clientes (ordenado por totalUsd desc en el cliente).
 * Sin paginación: ~150 clientes, all-in-one es OK.
 */
export async function listClientsLeaderboard(): Promise<ClientLeaderRow[]> {
  const supabase = await createClient();

  // 1) Clientes con país + KAM
  const { data: rows, error } = await supabase
    .from("clients")
    .select(
      `id, name, is_active,
       country:countries ( iso2, name_es ),
       owner:app_users!clients_account_owner_id_fkey ( id, full_name, email )`,
    )
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);

  const ids = (rows ?? []).map((c) => c.id);
  type Agg = { contracts: number; usd: number; plants: number };
  const aggByClient = new Map<string, Agg>();

  if (ids.length > 0) {
    // 2) Contratos activos (excluye cancelados) + sus items para plants
    const { data: contracts } = await supabase
      .from("contracts")
      .select("id, client_id, total_neto_usd, contract_items(qty_plants, deleted_at)")
      .is("deleted_at", null)
      .in("client_id", ids)
      .in("status", ["firmado", "en_proceso", "finalizado", "borrador", "por_revisar"]);

    type ItemRow = { qty_plants: number | string | null; deleted_at: string | null };
    for (const c of contracts ?? []) {
      if (!c.client_id) continue;
      let agg = aggByClient.get(c.client_id);
      if (!agg) {
        agg = { contracts: 0, usd: 0, plants: 0 };
        aggByClient.set(c.client_id, agg);
      }
      agg.contracts += 1;
      agg.usd += Number(c.total_neto_usd ?? 0);
      const items = (c.contract_items as ItemRow[] | null) ?? [];
      for (const it of items) {
        if (it.deleted_at) continue;
        agg.plants += Number(it.qty_plants ?? 0);
      }
    }
  }

  type CountryRel = { iso2: string | null; name_es: string };
  type OwnerRel = { id: string; full_name: string | null; email: string | null };
  const pickOne = <T,>(v: unknown): T | null => {
    if (!v) return null;
    if (Array.isArray(v)) return (v[0] as T) ?? null;
    return v as T;
  };

  return (rows ?? []).map((c) => {
    const country = pickOne<CountryRel>(c.country);
    const owner = pickOne<OwnerRel>(c.owner);
    const agg = aggByClient.get(c.id) ?? { contracts: 0, usd: 0, plants: 0 };
    return {
      id: c.id,
      name: c.name,
      isActive: c.is_active ?? true,
      country: country ? { iso2: country.iso2, name: country.name_es } : null,
      kam: owner
        ? { id: owner.id, name: owner.full_name ?? owner.email ?? "—" }
        : null,
      activeContracts: agg.contracts,
      totalUsd: agg.usd,
      totalPlants: agg.plants,
    };
  });
}

export async function listOwners(): Promise<OwnerOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, full_name, email")
    .is("deleted_at", null)
    .eq("is_active", true)
    .in("role", ["admin", "sales"])
    .order("full_name", { ascending: true });
  if (error) {
    console.error("[listOwners]", error);
    return [];
  }
  return data ?? [];
}
