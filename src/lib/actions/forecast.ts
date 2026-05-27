"use server";

import { createClient } from "@/lib/supabase/server";

export type ForecastClientRow = {
  client_id: string;
  client_name: string;
  country_iso2: string | null;
  country_name: string | null;
  plants: number;
  billing_usd: number;
};

export type ForecastMonth = {
  month: number; // 1..12
  plants: number;
  clients_count: number;
  billing_usd: number;
  by_client: ForecastClientRow[];
};

export type ForecastTotals = {
  plants_total: number;
  clients_count: number;
  contracts_count: number;
  billing_usd: number;
};

export type ForecastResult = {
  filter: {
    year: number;
    country_id: string | null;
    kam_id: string | null;
    status_filter: string;
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
  status_filter?: string | null;
}): Promise<ForecastResult | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const res = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<RpcResult<ForecastResult>>)("mcp_forecast_by_month", {
    p_user_id: user.id,
    p_year: params.year,
    p_country_id: params.country_id ?? null,
    p_kam_id: params.kam_id ?? null,
    p_status_filter: params.status_filter ?? null,
  });

  if (res.error) throw new Error(res.error.message);
  return res.data;
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
