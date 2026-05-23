"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

export type FxRates = {
  clpPerUsd: number;
  eurPerUsd: number;
};

/**
 * Returns current FX rates derived from existing contracts.
 * Takes the most common (mode) fx_rate_to_usd per currency.
 */
export async function getFxRates(): Promise<FxRates> {
  const supabase = await createClient();

  const { data } = await supabase
    .from("contracts")
    .select("currency, fx_rate_to_usd")
    .is("deleted_at", null)
    .not("fx_rate_to_usd", "is", null);

  const sample = data ?? [];

  // Count occurrences per currency+rate
  const counts = new Map<string, number>();
  for (const r of sample) {
    if (!r.fx_rate_to_usd) continue;
    const key = `${r.currency}::${r.fx_rate_to_usd}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const getMode = (currency: string, fallback: number): number => {
    let best: { rate: number; count: number } | null = null;
    for (const [key, n] of counts.entries()) {
      if (!key.startsWith(`${currency}::`)) continue;
      const rate = Number(key.slice(currency.length + 2));
      if (!best || n > best.count) best = { rate, count: n };
    }
    return best?.rate ?? fallback;
  };

  return {
    clpPerUsd: getMode("CLP", 950),
    eurPerUsd: getMode("EUR", 0.92),
  };
}

/**
 * Updates fx_rate_to_usd for ALL contracts of the given currencies and
 * recomputes total_neto_usd. USD contracts always have fx=1.
 */
export async function updateFxRates(rates: FxRates) {
  const supabase = await createClient();

  if (rates.clpPerUsd <= 0 || rates.eurPerUsd <= 0) {
    throw new Error("Las tasas deben ser positivas");
  }

  // Update CLP
  const clpRes = await supabase
    .from("contracts")
    .update({ fx_rate_to_usd: rates.clpPerUsd })
    .eq("currency", "CLP");
  if (clpRes.error) throw new Error(clpRes.error.message);

  // Update EUR
  const eurRes = await supabase
    .from("contracts")
    .update({ fx_rate_to_usd: rates.eurPerUsd })
    .eq("currency", "EUR");
  if (eurRes.error) throw new Error(eurRes.error.message);

  // USD = 1 always
  const usdRes = await supabase
    .from("contracts")
    .update({ fx_rate_to_usd: 1.0 })
    .eq("currency", "USD");
  if (usdRes.error) throw new Error(usdRes.error.message);

  // Now recompute total_neto and total_neto_usd via a raw SQL execute.
  // Supabase JS client doesn't support multi-statement updates with joins,
  // so we use the Postgres rpc/function pattern via .rpc() — but we don't
  // have an RPC defined. Instead, use a workaround: fetch contracts +
  // aggregated items, then issue individual updates. For ~400 contracts
  // this is acceptable.

  // Step 1: get aggregated items per contract
  const { data: contracts } = await supabase
    .from("contracts")
    .select("id, currency, fx_rate_to_usd")
    .is("deleted_at", null);

  if (!contracts || contracts.length === 0) {
    revalidatePath("/contratos");
    return { updated: 0 };
  }

  const { data: items } = await supabase
    .from("contract_items")
    .select("contract_id, qty_plants, unit_price")
    .is("deleted_at", null);

  const totalsByContract = new Map<string, number>();
  for (const it of items ?? []) {
    if (!it.contract_id) continue;
    const v = Number(it.qty_plants ?? 0) * Number(it.unit_price ?? 0);
    totalsByContract.set(
      it.contract_id,
      (totalsByContract.get(it.contract_id) ?? 0) + v,
    );
  }

  // Step 2: update in batches (we need to update in parallel)
  let updated = 0;
  const tasks: Promise<unknown>[] = [];
  for (const c of contracts) {
    const totalNeto = totalsByContract.get(c.id) ?? 0;
    const fx = Number(c.fx_rate_to_usd ?? 1);
    const totalIva = c.currency === "CLP" ? totalNeto * 0.19 : 0;
    const totalNetoUsd =
      c.currency === "USD" ? totalNeto : fx > 0 ? totalNeto / fx : 0;

    tasks.push(
      (async () => {
        await supabase
          .from("contracts")
          .update({
            total_neto: totalNeto,
            total_iva: totalIva,
            total_neto_usd: totalNetoUsd,
          })
          .eq("id", c.id);
      })(),
    );
    updated += 1;

    // Batch every 50 to avoid huge concurrent open requests
    if (tasks.length >= 50) {
      await Promise.all(tasks);
      tasks.length = 0;
    }
  }
  if (tasks.length > 0) await Promise.all(tasks);

  revalidatePath("/contratos");
  return { updated };
}
