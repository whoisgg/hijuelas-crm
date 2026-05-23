"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type DeliveryStatus = Database["public"]["Enums"]["delivery_status"];

export type RecordDeliveryInput = {
  contractItemId: string;
  qty: number;
  deliveredAt: string;
  remitoNumber?: string | null;
  notes?: string | null;
};

export async function recordDelivery(input: RecordDeliveryInput) {
  const supabase = await createClient();

  const { data: item, error: getErr } = await supabase
    .from("contract_items")
    .select("contract_id, qty_plants, qty_delivered")
    .eq("id", input.contractItemId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const { data: delivery, error } = await supabase
    .from("deliveries")
    .insert({
      contract_item_id: input.contractItemId,
      qty_delivered: input.qty,
      delivered_at: input.deliveredAt,
      remito_number: input.remitoNumber ?? null,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  // Recompute item totals & status.
  const { data: deliveries, error: dErr } = await supabase
    .from("deliveries")
    .select("qty_delivered")
    .eq("contract_item_id", input.contractItemId)
    .is("deleted_at", null);
  if (dErr) throw new Error(dErr.message);

  const totalDelivered = (deliveries ?? []).reduce(
    (acc, d) => acc + Number(d.qty_delivered),
    0,
  );

  let nextStatus: DeliveryStatus = "pendiente";
  if (totalDelivered > 0 && totalDelivered < Number(item.qty_plants)) {
    nextStatus = "en_proceso";
  } else if (totalDelivered >= Number(item.qty_plants)) {
    nextStatus = "finalizado";
  }

  const { error: updErr } = await supabase
    .from("contract_items")
    .update({
      qty_delivered: totalDelivered,
      status: nextStatus,
    })
    .eq("id", input.contractItemId);
  if (updErr) throw new Error(updErr.message);

  revalidatePath(`/contratos/${item.contract_id}`);
  revalidatePath("/contratos/entregas");
  return { id: delivery.id, totalDelivered, nextStatus };
}

export async function listDeliveriesForContract(contractId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliveries")
    .select(
      `id, contract_item_id, qty_delivered, delivered_at, remito_number, notes, created_at,
       item:contract_items!deliveries_contract_item_id_fkey (
         id, variety_id, qty_plants, delivery_year, delivery_week,
         variety:varieties ( id, name )
       )`,
    )
    .is("deleted_at", null)
    .eq("item.contract_id", contractId)
    .order("delivered_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).filter((d) => d.item != null);
}

export async function listUpcomingDeliveries(opts: { weeksAhead?: number } = {}) {
  const supabase = await createClient();
  const weeksAhead = opts.weeksAhead ?? 4;
  const today = new Date();
  const year = today.getFullYear();
  // Calculate ISO week number.
  const week = isoWeek(today);

  // Window upper bound (rough): same year + (week + weeksAhead).
  // For simplicity we include all items in the current year with week >= now or earlier years past-due.
  const { data, error } = await supabase
    .from("contract_items")
    .select(
      `id, contract_id, variety_id, qty_plants, qty_delivered, delivery_year, delivery_week, status,
       variety:varieties ( id, name ),
       contract:contracts!contract_items_contract_id_fkey (
         id, number, client_id,
         client:clients!contracts_client_id_fkey ( id, name )
       )`,
    )
    .is("deleted_at", null)
    .in("status", ["pendiente", "en_proceso"])
    .order("delivery_year", { ascending: true })
    .order("delivery_week", { ascending: true });
  if (error) throw new Error(error.message);

  const items = (data ?? []).filter((it) => {
    if (it.delivery_year < year) return true;
    if (it.delivery_year > year) return false;
    return it.delivery_week >= week && it.delivery_week <= week + weeksAhead;
  });
  return items;
}

function isoWeek(date: Date): number {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
}
