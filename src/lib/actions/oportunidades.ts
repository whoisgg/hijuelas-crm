"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/database.types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];
type ActivityType = Database["public"]["Enums"]["activity_type"];

export type OpportunityStage =
  Database["public"]["Tables"]["opportunity_stages"]["Row"];
export type OpportunityRow =
  Database["public"]["Tables"]["opportunities"]["Row"];
export type OpportunityItemRow =
  Database["public"]["Tables"]["opportunity_items"]["Row"];
export type OpportunityActivityRow =
  Database["public"]["Tables"]["opportunity_activities"]["Row"];
export type AppUserRow = Database["public"]["Tables"]["app_users"]["Row"];
export type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
export type OrganizationRow =
  Database["public"]["Tables"]["organizations"]["Row"];
export type VarietyRow = Database["public"]["Tables"]["varieties"]["Row"];

export type OpportunityWithRelations = OpportunityRow & {
  stage: OpportunityStage | null;
  owner: Pick<AppUserRow, "id" | "full_name" | "email" | "avatar_url"> | null;
  client: Pick<ClientRow, "id" | "name"> | null;
  organization: Pick<OrganizationRow, "id" | "name"> | null;
  items_count?: number;
  activities_count?: number;
};

export type OpportunityListFilters = {
  ownerId?: string | null;
  organizationId?: string | null;
  stageId?: string | null;
  minValue?: number | null;
  maxValue?: number | null;
  expectedCloseFrom?: string | null;
  expectedCloseTo?: string | null;
  search?: string | null;
};

type ListResultKanban = {
  view: "kanban";
  stages: OpportunityStage[];
  byStage: Record<string, OpportunityWithRelations[]>;
};

type ListResultList = {
  view: "list";
  rows: OpportunityWithRelations[];
  total: number;
  stages: OpportunityStage[];
};

export type ListOpportunitiesResult = ListResultKanban | ListResultList;

const OPP_SELECT = `
  id,
  name,
  client_id,
  client_name_raw,
  organization_id,
  owner_id,
  stage_id,
  currency,
  estimated_value,
  estimated_value_usd,
  expected_close_date,
  probability_pct,
  source,
  notes,
  lost_reason,
  created_at,
  updated_at,
  created_by,
  updated_by,
  deleted_at,
  stage:opportunity_stages!opportunities_stage_id_fkey(id, name, color, order_index, is_won, is_lost, probability_default, created_at, updated_at, created_by, updated_by, deleted_at),
  owner:app_users!opportunities_owner_id_fkey(id, full_name, email, avatar_url),
  client:clients!opportunities_client_id_fkey(id, name),
  organization:organizations!opportunities_organization_id_fkey(id, name)
`;

type RawOpportunityRow = OpportunityRow & {
  stage: OpportunityStage | null;
  owner: Pick<AppUserRow, "id" | "full_name" | "email" | "avatar_url"> | null;
  client: Pick<ClientRow, "id" | "name"> | null;
  organization: Pick<OrganizationRow, "id" | "name"> | null;
};

async function getCurrentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

async function logActivity(
  entityId: string,
  action: string,
  diff?: Record<string, unknown>,
): Promise<void> {
  try {
    const supabase = await createClient();
    const actorId = await getCurrentUserId();
    await supabase.from("activity_log").insert({
      entity_id: entityId,
      entity_type: "opportunities",
      action,
      actor_id: actorId,
      diff_json: (diff ?? null) as Json,
    });
  } catch {
    // Logging failure is non-fatal.
  }
}

export async function listOpportunityStages(): Promise<OpportunityStage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("opportunity_stages")
    .select("*")
    .is("deleted_at", null)
    .order("order_index", { ascending: true });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listOpportunities(input: {
  filters?: OpportunityListFilters;
  view?: "kanban" | "list";
}): Promise<ListOpportunitiesResult> {
  const view = input.view ?? "kanban";
  const filters = input.filters ?? {};
  const supabase = await createClient();

  const stages = await listOpportunityStages();

  let query = supabase
    .from("opportunities")
    .select(OPP_SELECT)
    .is("deleted_at", null);

  if (filters.ownerId) query = query.eq("owner_id", filters.ownerId);
  if (filters.organizationId)
    query = query.eq("organization_id", filters.organizationId);
  if (filters.stageId) query = query.eq("stage_id", filters.stageId);
  if (typeof filters.minValue === "number")
    query = query.gte("estimated_value_usd", filters.minValue);
  if (typeof filters.maxValue === "number")
    query = query.lte("estimated_value_usd", filters.maxValue);
  if (filters.expectedCloseFrom)
    query = query.gte("expected_close_date", filters.expectedCloseFrom);
  if (filters.expectedCloseTo)
    query = query.lte("expected_close_date", filters.expectedCloseTo);
  if (filters.search && filters.search.trim().length > 0) {
    const term = filters.search.trim().replace(/[%]/g, "");
    query = query.ilike("name", `%${term}%`);
  }

  query = query.order("updated_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = ((data ?? []) as unknown as RawOpportunityRow[]).map(normalizeRow);

  if (view === "kanban") {
    const byStage: Record<string, OpportunityWithRelations[]> = {};
    for (const stage of stages) {
      byStage[stage.id] = [];
    }
    for (const row of rows) {
      if (row.stage_id in byStage) {
        byStage[row.stage_id].push(row);
      } else {
        byStage[row.stage_id] = [row];
      }
    }
    return { view: "kanban", stages, byStage };
  }

  return { view: "list", rows, total: rows.length, stages };
}

function normalizeRow(row: RawOpportunityRow): OpportunityWithRelations {
  return {
    ...row,
    stage: row.stage ?? null,
    owner: row.owner ?? null,
    client: row.client ?? null,
    organization: row.organization ?? null,
  };
}

export type OpportunityDetail = OpportunityWithRelations & {
  items: (OpportunityItemRow & {
    variety: Pick<VarietyRow, "id" | "name"> | null;
  })[];
  activities: (OpportunityActivityRow & {
    owner: Pick<AppUserRow, "id" | "full_name" | "email" | "avatar_url"> | null;
  })[];
  history: Database["public"]["Tables"]["activity_log"]["Row"][];
};

export async function getOpportunity(
  id: string,
): Promise<OpportunityDetail | null> {
  const supabase = await createClient();

  const { data: opp, error } = await supabase
    .from("opportunities")
    .select(OPP_SELECT)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!opp) return null;

  const [{ data: items }, { data: activities }, { data: history }] =
    await Promise.all([
      supabase
        .from("opportunity_items")
        .select(
          `*, variety:varieties!opportunity_items_variety_id_fkey(id, name)`,
        )
        .eq("opportunity_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: true }),
      supabase
        .from("opportunity_activities")
        .select(
          `*, owner:app_users!opportunity_activities_owner_id_fkey(id, full_name, email, avatar_url)`,
        )
        .eq("opportunity_id", id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false }),
      supabase
        .from("activity_log")
        .select("*")
        .eq("entity_type", "opportunities")
        .eq("entity_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  const base = normalizeRow(opp as unknown as RawOpportunityRow);
  return {
    ...base,
    items: (items ?? []) as OpportunityDetail["items"],
    activities: (activities ?? []) as OpportunityDetail["activities"],
    history: (history ?? []) as OpportunityDetail["history"],
  };
}

export type CreateOpportunityInput = {
  name: string;
  client_id?: string | null;
  client_name_raw?: string | null;
  organization_id: string;
  owner_id?: string | null;
  stage_id?: string | null;
  currency?: CurrencyCode;
  estimated_value?: number | null;
  expected_close_date?: string | null;
  probability_pct?: number | null;
  source?: string | null;
  notes?: string | null;
};

export async function createOpportunity(
  input: CreateOpportunityInput,
): Promise<{ id: string }> {
  const supabase = await createClient();

  let stageId = input.stage_id ?? null;
  let probability = input.probability_pct ?? null;

  if (!stageId) {
    const stages = await listOpportunityStages();
    const initial =
      stages.find((s) => !s.is_won && !s.is_lost) ?? stages[0] ?? null;
    if (!initial) throw new Error("No hay stages configurados.");
    stageId = initial.id;
    if (probability === null) probability = initial.probability_default;
  } else if (probability === null) {
    const { data: stage } = await supabase
      .from("opportunity_stages")
      .select("probability_default")
      .eq("id", stageId)
      .maybeSingle();
    probability = stage?.probability_default ?? 0;
  }

  const userId = await getCurrentUserId();

  const insertPayload: Database["public"]["Tables"]["opportunities"]["Insert"] =
    {
      name: input.name,
      client_id: input.client_id ?? null,
      client_name_raw: input.client_name_raw ?? null,
      organization_id: input.organization_id,
      owner_id: input.owner_id ?? userId ?? null,
      stage_id: stageId,
      currency: input.currency ?? "USD",
      estimated_value: input.estimated_value ?? null,
      expected_close_date: input.expected_close_date ?? null,
      probability_pct: probability ?? 0,
      source: input.source ?? null,
      notes: input.notes ?? null,
      created_by: userId,
      updated_by: userId,
    };

  const { data, error } = await supabase
    .from("opportunities")
    .insert(insertPayload)
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(data.id, "create", { name: input.name });
  revalidatePath("/oportunidades");
  return { id: data.id };
}

export type UpdateOpportunityPatch = Partial<
  Pick<
    OpportunityRow,
    | "name"
    | "client_id"
    | "client_name_raw"
    | "owner_id"
    | "stage_id"
    | "currency"
    | "estimated_value"
    | "expected_close_date"
    | "probability_pct"
    | "source"
    | "notes"
    | "lost_reason"
  >
>;

export async function updateOpportunity(
  id: string,
  patch: UpdateOpportunityPatch,
): Promise<void> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();

  const update: Database["public"]["Tables"]["opportunities"]["Update"] = {
    ...patch,
    updated_by: userId,
  };

  const { error } = await supabase
    .from("opportunities")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(id, "update", patch as Record<string, unknown>);
  revalidatePath("/oportunidades");
  revalidatePath(`/oportunidades/${id}`);
}

export async function deleteOpportunity(id: string): Promise<void> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();

  const { error } = await supabase
    .from("opportunities")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", id);
  if (error) throw new Error(error.message);

  // Note: no logActivity — el row de oportunidad ya está soft-deleted
  // y no la vamos a mostrar más. Si en el futuro hacemos vista de
  // "archivo" / restore, agregar acá.
  revalidatePath("/oportunidades");
}

export async function transitionOpportunityStage(
  id: string,
  toStageId: string,
  opts?: { skipProbabilityUpdate?: boolean },
): Promise<{ stage: OpportunityStage }> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();

  const { data: stage, error: stageError } = await supabase
    .from("opportunity_stages")
    .select("*")
    .eq("id", toStageId)
    .maybeSingle();
  if (stageError) throw new Error(stageError.message);
  if (!stage) throw new Error("Stage no encontrado.");

  const update: Database["public"]["Tables"]["opportunities"]["Update"] = {
    stage_id: toStageId,
    updated_by: userId,
  };
  if (!opts?.skipProbabilityUpdate) {
    update.probability_pct = stage.probability_default;
  }

  const { error } = await supabase
    .from("opportunities")
    .update(update)
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(id, "stage_change", {
    to_stage_id: toStageId,
    to_stage_name: stage.name,
  });
  revalidatePath("/oportunidades");
  revalidatePath(`/oportunidades/${id}`);
  return { stage };
}

export async function markOpportunityLost(
  id: string,
  reason: string,
): Promise<void> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();

  const stages = await listOpportunityStages();
  const lostStage = stages.find((s) => s.is_lost);
  if (!lostStage) throw new Error("Stage 'Perdida' no configurado.");

  const { error } = await supabase
    .from("opportunities")
    .update({
      stage_id: lostStage.id,
      lost_reason: reason,
      probability_pct: 0,
      updated_by: userId,
    } satisfies Database["public"]["Tables"]["opportunities"]["Update"])
    .eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity(id, "lost", { reason });
  revalidatePath("/oportunidades");
  revalidatePath(`/oportunidades/${id}`);
}

// ----- Items -----

export type CreateOpportunityItemInput = {
  variety_id: string;
  qty_plants_est: number;
  format?: string | null;
  unit_price_est?: number | null;
  currency?: CurrencyCode | null;
  expected_delivery_year?: number | null;
  expected_delivery_week?: number | null;
  notes?: string | null;
};

export async function createOpportunityItem(
  oppId: string,
  input: CreateOpportunityItemInput,
): Promise<{ id: string }> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("opportunity_items")
    .insert({
      opportunity_id: oppId,
      variety_id: input.variety_id,
      qty_plants_est: input.qty_plants_est,
      format: input.format ?? null,
      unit_price_est: input.unit_price_est ?? null,
      currency: input.currency ?? null,
      expected_delivery_year: input.expected_delivery_year ?? null,
      expected_delivery_week: input.expected_delivery_week ?? null,
      notes: input.notes ?? null,
      created_by: userId,
      updated_by: userId,
    } satisfies Database["public"]["Tables"]["opportunity_items"]["Insert"])
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(oppId, "item_add", { item_id: data.id });
  revalidatePath(`/oportunidades/${oppId}`);
  return { id: data.id };
}

export async function updateOpportunityItem(
  id: string,
  patch: Partial<
    Pick<
      OpportunityItemRow,
      | "variety_id"
      | "qty_plants_est"
      | "format"
      | "unit_price_est"
      | "currency"
      | "expected_delivery_year"
      | "expected_delivery_week"
      | "notes"
    >
  >,
): Promise<void> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("opportunity_items")
    .update({ ...patch, updated_by: userId })
    .eq("id", id)
    .select("opportunity_id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(data.opportunity_id, "item_update", { item_id: id });
  revalidatePath(`/oportunidades/${data.opportunity_id}`);
}

export async function deleteOpportunityItem(id: string): Promise<void> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("opportunity_items")
    .update({
      deleted_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", id)
    .select("opportunity_id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(data.opportunity_id, "item_delete", { item_id: id });
  revalidatePath(`/oportunidades/${data.opportunity_id}`);
}

// ----- Activities -----

export type CreateActivityInput = {
  type: ActivityType;
  subject: string;
  body?: string | null;
  due_at?: string | null;
  owner_id?: string | null;
};

export async function createActivity(
  oppId: string,
  input: CreateActivityInput,
): Promise<{ id: string }> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();

  const { data, error } = await supabase
    .from("opportunity_activities")
    .insert({
      opportunity_id: oppId,
      type: input.type,
      subject: input.subject,
      body: input.body ?? null,
      due_at: input.due_at ?? null,
      owner_id: input.owner_id ?? userId,
      created_by: userId,
      updated_by: userId,
    } satisfies Database["public"]["Tables"]["opportunity_activities"]["Insert"])
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity(oppId, "activity_add", {
    activity_id: data.id,
    type: input.type,
    subject: input.subject,
  });
  revalidatePath(`/oportunidades/${oppId}`);
  return { id: data.id };
}

export async function updateActivity(
  id: string,
  patch: Partial<
    Pick<
      OpportunityActivityRow,
      "subject" | "body" | "due_at" | "owner_id" | "type" | "done_at"
    >
  >,
): Promise<void> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("opportunity_activities")
    .update({ ...patch, updated_by: userId })
    .eq("id", id)
    .select("opportunity_id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(data.opportunity_id, "activity_update", {
    activity_id: id,
  });
  revalidatePath(`/oportunidades/${data.opportunity_id}`);
}

export async function markActivityDone(
  id: string,
  done: boolean,
): Promise<void> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();
  const { data, error } = await supabase
    .from("opportunity_activities")
    .update({
      done_at: done ? new Date().toISOString() : null,
      updated_by: userId,
    })
    .eq("id", id)
    .select("opportunity_id")
    .single();
  if (error) throw new Error(error.message);
  await logActivity(data.opportunity_id, "activity_done", {
    activity_id: id,
    done,
  });
  revalidatePath(`/oportunidades/${data.opportunity_id}`);
}

// ----- Convert to contract -----

export type ConvertContractItemInput = {
  variety_id: string;
  qty_plants: number;
  unit_price: number;
  currency: CurrencyCode;
  format?: string | null;
  delivery_year: number;
  delivery_week: number;
};

export type ConvertContractPaymentInput = {
  type: Database["public"]["Enums"]["payment_type"];
  amount: number;
  currency: CurrencyCode;
  due_date?: string | null;
};

export type ConvertOpportunityInput = {
  client_id: string;
  contract_number: string;
  currency: CurrencyCode;
  incoterm?: string | null;
  signed_at?: string | null;
  notes?: string | null;
  items: ConvertContractItemInput[];
  payments: ConvertContractPaymentInput[];
};

export async function convertOpportunityToContract(
  oppId: string,
  input: ConvertOpportunityInput,
): Promise<{ contractId: string }> {
  const supabase = await createClient();
  const userId = await getCurrentUserId();

  const { data: opp, error: oppError } = await supabase
    .from("opportunities")
    .select("id, organization_id, name")
    .eq("id", oppId)
    .maybeSingle();
  if (oppError) throw new Error(oppError.message);
  if (!opp) throw new Error("Oportunidad no encontrada.");

  const totalNeto = input.items.reduce(
    (acc, i) => acc + i.qty_plants * i.unit_price,
    0,
  );

  const { data: contract, error: contractError } = await supabase
    .from("contracts")
    .insert({
      client_id: input.client_id,
      organization_id: opp.organization_id,
      number: input.contract_number,
      currency: input.currency,
      incoterm: input.incoterm ?? null,
      signed_at: input.signed_at ?? null,
      notes: input.notes ?? null,
      source_opportunity_id: opp.id,
      status: "borrador",
      total_neto: totalNeto,
      total_iva: 0,
      total_neto_usd: input.currency === "USD" ? totalNeto : 0,
      created_by: userId,
      updated_by: userId,
    } satisfies Database["public"]["Tables"]["contracts"]["Insert"])
    .select("id")
    .single();
  if (contractError) throw new Error(contractError.message);

  if (input.items.length > 0) {
    const itemsPayload: Database["public"]["Tables"]["contract_items"]["Insert"][] =
      input.items.map((it) => ({
        contract_id: contract.id,
        variety_id: it.variety_id,
        qty_plants: it.qty_plants,
        unit_price: it.unit_price,
        currency: it.currency,
        format: it.format ?? null,
        delivery_year: it.delivery_year,
        delivery_week: it.delivery_week,
        created_by: userId,
        updated_by: userId,
      }));
    const { error: itemsError } = await supabase
      .from("contract_items")
      .insert(itemsPayload);
    if (itemsError) {
      await supabase.from("contracts").delete().eq("id", contract.id);
      throw new Error(itemsError.message);
    }
  }

  if (input.payments.length > 0) {
    const paymentsPayload: Database["public"]["Tables"]["payments"]["Insert"][] =
      input.payments.map((p) => ({
        contract_id: contract.id,
        type: p.type,
        amount: p.amount,
        currency: p.currency,
        due_date: p.due_date ?? null,
        status: "pendiente",
        created_by: userId,
        updated_by: userId,
      }));
    const { error: paymentsError } = await supabase
      .from("payments")
      .insert(paymentsPayload);
    if (paymentsError) {
      await supabase.from("contract_items").delete().eq("contract_id", contract.id);
      await supabase.from("contracts").delete().eq("id", contract.id);
      throw new Error(paymentsError.message);
    }
  }

  const stages = await listOpportunityStages();
  const wonStage = stages.find((s) => s.is_won);
  if (wonStage) {
    await supabase
      .from("opportunities")
      .update({
        stage_id: wonStage.id,
        probability_pct: 100,
        client_id: input.client_id,
        updated_by: userId,
      } satisfies Database["public"]["Tables"]["opportunities"]["Update"])
      .eq("id", oppId);
  }

  await logActivity(oppId, "converted", {
    contract_id: contract.id,
    contract_number: input.contract_number,
  });

  revalidatePath("/oportunidades");
  revalidatePath(`/oportunidades/${oppId}`);
  revalidatePath("/contratos");
  return { contractId: contract.id };
}

// ----- Helpers for forms -----

export async function listOrganizations(): Promise<
  Pick<OrganizationRow, "id" | "name" | "default_currency">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, default_currency")
    .is("deleted_at", null)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listAppUsers(): Promise<
  Pick<AppUserRow, "id" | "full_name" | "email" | "avatar_url">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("app_users")
    .select("id, full_name, email, avatar_url")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("full_name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function searchClients(
  term: string,
): Promise<Pick<ClientRow, "id" | "name" | "country_id">[]> {
  const supabase = await createClient();
  const q = term.trim();
  if (q.length === 0) return [];
  const { data, error } = await supabase
    .from("clients")
    .select("id, name, country_id")
    .is("deleted_at", null)
    .ilike("name", `%${q}%`)
    .limit(15);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listVarieties(): Promise<
  Pick<VarietyRow, "id" | "name" | "species_id">[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("varieties")
    .select("id, name, species_id")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name")
    .limit(500);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createOpportunityAndRedirect(
  input: CreateOpportunityInput,
): Promise<void> {
  const { id } = await createOpportunity(input);
  redirect(`/oportunidades/${id}`);
}
