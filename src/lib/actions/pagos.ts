"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/database.types";

type PaymentStatus = Database["public"]["Enums"]["payment_status"];
type PaymentType = Database["public"]["Enums"]["payment_type"];
type CurrencyCode = Database["public"]["Enums"]["currency_code"];

export async function createPayment(input: {
  contractId: string;
  type: PaymentType;
  amount: number;
  currency: CurrencyCode;
  dueDate: string | null;
  iva?: number;
}) {
  const supabase = await createClient();
  const { error } = await supabase.from("payments").insert({
    contract_id: input.contractId,
    type: input.type,
    amount: input.amount,
    currency: input.currency,
    due_date: input.dueDate,
    iva: input.iva ?? 0,
    status: "pendiente" as PaymentStatus,
  });
  if (error) throw new Error(error.message);

  revalidatePath(`/contratos/${input.contractId}`);
  revalidatePath("/contratos/pagos");
  return { ok: true };
}

export async function deletePayment(paymentId: string) {
  const supabase = await createClient();
  const { data: payment, error: getErr } = await supabase
    .from("payments")
    .select("contract_id")
    .eq("id", paymentId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const { error } = await supabase
    .from("payments")
    .delete()
    .eq("id", paymentId);
  if (error) throw new Error(error.message);

  revalidatePath(`/contratos/${payment.contract_id}`);
  revalidatePath("/contratos/pagos");
  return { ok: true };
}

export async function markPaymentPaid(
  paymentId: string,
  opts: { paidAt?: string | null; reference?: string | null } = {},
) {
  const supabase = await createClient();
  const paidAt = opts.paidAt ?? new Date().toISOString();

  const { data: payment, error: getErr } = await supabase
    .from("payments")
    .select("contract_id")
    .eq("id", paymentId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const { error } = await supabase
    .from("payments")
    .update({
      status: "pagado" as PaymentStatus,
      paid_at: paidAt,
      reference: opts.reference ?? null,
    })
    .eq("id", paymentId);
  if (error) throw new Error(error.message);

  revalidatePath(`/contratos/${payment.contract_id}`);
  revalidatePath("/contratos/pagos");
  return { ok: true };
}

export async function updatePaymentAmount(
  paymentId: string,
  amount: number,
  dueDate?: string | null,
) {
  const supabase = await createClient();
  const { data: payment, error: getErr } = await supabase
    .from("payments")
    .select("contract_id")
    .eq("id", paymentId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const patch: { amount: number; due_date?: string | null } = { amount };
  if (dueDate !== undefined) patch.due_date = dueDate;

  const { error } = await supabase
    .from("payments")
    .update(patch)
    .eq("id", paymentId);
  if (error) throw new Error(error.message);

  revalidatePath(`/contratos/${payment.contract_id}`);
  return { ok: true };
}

export async function listPendingPayments(
  opts: { overdue?: boolean } = {},
) {
  const supabase = await createClient();
  let q = supabase
    .from("payments")
    .select(
      `id, type, amount, iva, currency, status, due_date, paid_at, reference, contract_id,
       contract:contracts!payments_contract_id_fkey (
         id, number, client_id,
         client:clients!contracts_client_id_fkey ( id, name )
       )`,
    )
    .is("deleted_at", null)
    .eq("status", "pendiente")
    .order("due_date", { ascending: true, nullsFirst: false });

  if (opts.overdue) {
    const today = new Date().toISOString().slice(0, 10);
    q = q.lt("due_date", today);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}
