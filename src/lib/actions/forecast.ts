"use server";

import { createClient } from "@/lib/supabase/server";

export type ForecastClientRow = {
  client_id: string;
  client_name: string;
  country_iso2: string | null;
  country_name: string | null;
  plants: number;
  billing_usd: number;
  /** Variedades distintas del cliente para ese mes (ARRAY_AGG DISTINCT
   *  desde contract_items.variety_id → varieties.name). Renderizado como
   *  burbujas en el drill-down, mismo patrón que /kam. */
  varieties: string[] | null;
};

export type ForecastMonth = {
  month: number; // 1..12
  plants: number;
  clients_count: number;
  billing_usd: number;
  pipeline_usd: number;
  pipeline_count: number;
  by_client: ForecastClientRow[];
};

export type ForecastTotals = {
  plants_total: number;
  clients_count: number;
  contracts_count: number;
  billing_usd: number;
  pipeline_usd: number;
  pipeline_count: number;
  /** Suma USD de anticipos (anticipo_1 + anticipo_2) pagados de los contratos
   *  ELEGIBLES para facturación del año (mismo subconjunto que `billing_usd`).
   *  No filtra por fecha de cobro del anticipo — si el contrato califica para
   *  facturar en p_year, todos sus anticipos pagados se cuentan acá. */
  anticipos_paid_usd: number;
  anticipos_paid_count: number;
};

export type ForecastResult = {
  filter: {
    year: number;
    from_month: number;
    country_id: string | null;
    kam_id: string | null;
    organization_id: string | null;
    status_in: string[];
    include_opportunities: boolean;
  };
  totals: ForecastTotals;
  by_month: ForecastMonth[];
};

type RpcResult<T> = { data: T | null; error: { message: string } | null };

/** Llama al RPC mcp_forecast_by_month resolviendo el caller via auth cookies. */
export async function getForecastByMonth(params: {
  year: number;
  country_id?: string | null;
  kam_id?: string | null;
  organization_id?: string | null;
  status_in?: string[];
  include_opportunities?: boolean;
  from_month?: number;
}): Promise<ForecastResult | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const args: Record<string, unknown> = {
    p_user_id: user.id,
    p_year: params.year,
    p_country_id: params.country_id ?? null,
    p_kam_id: params.kam_id ?? null,
    p_organization_id: params.organization_id ?? null,
    p_include_opportunities: params.include_opportunities ?? false,
    p_from_month: params.from_month ?? 1,
  };
  if (params.status_in && params.status_in.length > 0) {
    args.p_status_in = params.status_in;
  }

  const res = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult<ForecastResult>>)("mcp_forecast_by_month", args);

  if (res.error) throw new Error(res.error.message);
  return res.data;
}

/** Lista organizaciones activas para el filtro. */
export async function listOrganizationsForForecast(): Promise<
  { id: string; name: string; prefix: string | null }[]
> {
  const supabase = await createClient();
  const res = await supabase
    .from("organizations")
    .select("id, name, contract_prefix")
    .is("deleted_at", null)
    .eq("active", true)
    .order("name");
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    prefix: o.contract_prefix,
  }));
}

/** Países con actividad en el año dado, para alimentar el filtro. */
export async function listCountriesForForecast(): Promise<
  { id: string; name: string; iso2: string | null }[]
> {
  const supabase = await createClient();
  const res = await supabase
    .from("countries")
    .select("id, name_es, iso2")
    .is("deleted_at", null)
    .order("name_es");
  if (res.error) throw new Error(res.error.message);
  return (res.data ?? []).map((c) => ({
    id: c.id,
    name: c.name_es,
    iso2: c.iso2,
  }));
}
