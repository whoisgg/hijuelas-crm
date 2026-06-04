"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/actions/admin-users";
import {
  generateContractPdf,
  type ContractPdfData,
  type ContractPdfItem,
  type ContractPdfPayment,
} from "@/lib/contract-pdf";
import { sellerProfileFromOrg } from "@/lib/contract-templates/frambuesa-legal";

const BUCKET = "attachments";
// Marca que distingue el PDF generado del contrato de otros adjuntos.
const GENERATED_DIR = "generated";

/** Construye los datos del PDF del contrato (lenient: no exige email del comprador). */
async function buildPdfData(
  contractId: string,
): Promise<{ data: ContractPdfData; number: string } | { error: string }> {
  const supabase = await createClient();
  const { data: contract, error } = await supabase
    .from("contracts")
    .select(
      `id, number, status, currency, total_neto, total_iva, total_neto_usd, signed_at,
       client:clients!contracts_client_id_fkey ( id, name, legal_name, tax_id, giro, region ),
       organization:organizations!contracts_organization_id_fkey ( id, name, legal_name, tax_id,
         legal_representative_name, legal_representative_id, legal_domicile,
         bank_name, bank_account, notice_name, notice_email, signer_email ),
       items:contract_items ( qty_plants, unit_price, currency, delivery_year, delivery_week,
         variety:varieties ( name, species:species ( name ) ) ),
       payments ( type, amount, currency, due_date )`,
    )
    .eq("id", contractId)
    .is("deleted_at", null)
    .single();
  if (error) return { error: error.message };

  type Raw = {
    number: string;
    currency: string;
    total_neto: number | string;
    total_iva: number | string;
    total_neto_usd: number | string;
    signed_at: string | null;
    client: {
      id: string;
      name: string | null;
      legal_name: string | null;
      tax_id: string | null;
      giro: string | null;
      region: string | null;
    } | null;
    organization: Record<string, string | null> | null;
    items: {
      qty_plants: number | string;
      unit_price: number | string;
      currency: string;
      delivery_year: number | null;
      delivery_week: number | null;
      variety: { name: string | null; species: { name: string | null } | null } | null;
    }[];
    payments: { type: string; amount: number | string; currency: string; due_date: string | null }[];
  };
  const c = contract as unknown as Raw;
  if (!c.client) return { error: "Contrato sin cliente." };
  if (!c.items?.length) return { error: "Contrato sin ítems." };

  // Comprador: contacto (cualquiera) + dirección — todo opcional.
  const clientId = c.client.id;
  const [contactRes, addrRes] = await Promise.all([
    supabase
      .from("client_contacts")
      .select("name, email, is_primary")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .order("is_primary", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("client_addresses")
      .select("line1, line2, region")
      .eq("client_id", clientId)
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle(),
  ]);
  const contact = contactRes.data as { name: string | null; email: string | null } | null;
  const addr = addrRes.data as { line1: string | null; line2: string | null; region: string | null } | null;
  const domicile =
    [addr?.line1, addr?.line2, addr?.region].filter(Boolean).join(", ") || c.client.region;

  const seller = sellerProfileFromOrg(c.organization ?? {});

  const items: ContractPdfItem[] = c.items.map((it) => ({
    species_name: it.variety?.species?.name ?? null,
    variety_name: it.variety?.name ?? null,
    qty_plants: Number(it.qty_plants),
    unit_price: Number(it.unit_price),
    currency: it.currency,
    delivery_year: it.delivery_year,
    delivery_week: it.delivery_week,
  }));
  const payments: ContractPdfPayment[] = (c.payments ?? [])
    .slice()
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .map((p, i) => ({
      label: `${i + 1}ª cuota${p.type ? ` (${p.type})` : ""}`,
      dueDate: p.due_date,
      amount: Number(p.amount),
      currency: p.currency,
    }));

  const placeAndDate = `Santiago, ${new Date(c.signed_at ?? Date.now()).toLocaleDateString(
    "es-CL",
    { day: "2-digit", month: "long", year: "numeric" },
  )}`;

  const data: ContractPdfData = {
    number: c.number,
    placeAndDate,
    seller,
    buyer: {
      legalName: c.client.legal_name ?? c.client.name ?? "Comprador",
      taxId: c.client.tax_id,
      giro: c.client.giro,
      domicile,
      representativeName: contact?.name ?? null,
      representativeId: null,
      noticeEmail: contact?.email ?? null,
    },
    plantingLocation: null,
    currency: c.currency,
    totalNeto: Number(c.total_neto),
    totalIva: Number(c.total_iva),
    totalNetoUsd: Number(c.total_neto_usd),
    items,
    payments,
  };
  return { data, number: c.number };
}

/** Genera el PDF del contrato y lo adjunta (idempotente). */
export async function generateAndAttachContractPdf(
  contractId: string,
  opts: { force?: boolean } = {},
): Promise<{ ok: boolean; skipped?: boolean; message?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "No autenticado." };

  // Idempotencia: ¿ya tiene un PDF generado?
  if (!opts.force) {
    const { data: existing } = await supabase
      .from("attachments")
      .select("id, path")
      .eq("entity_type", "contract")
      .eq("entity_id", contractId)
      .is("deleted_at", null)
      .like("path", `%/${GENERATED_DIR}/%`)
      .limit(1);
    if (existing && existing.length > 0) return { ok: true, skipped: true };
  }

  const built = await buildPdfData(contractId);
  if ("error" in built) return { ok: false, message: built.error };

  const pdf = await generateContractPdf(built.data);
  const filename = `Contrato ${built.number}.pdf`;
  const path = `contract/${contractId}/${GENERATED_DIR}/${Date.now()}-${randomUUID().slice(0, 8)}.pdf`;

  const up = await supabase.storage
    .from(BUCKET)
    .upload(path, Buffer.from(pdf), { contentType: "application/pdf", upsert: false });
  if (up.error) return { ok: false, message: up.error.message };

  const ins = await supabase.from("attachments").insert({
    entity_type: "contract",
    entity_id: contractId,
    path,
    filename,
    mime_type: "application/pdf",
    size_bytes: pdf.byteLength,
    uploaded_by: user.id,
  });
  if (ins.error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, message: ins.error.message };
  }

  revalidatePath(`/contratos/${contractId}`);
  return { ok: true };
}

export type BackfillResult = {
  processed: number;
  attached: number;
  skipped: number;
  failed: { number: string; reason: string }[];
  remaining: number;
};

/**
 * Procesa un lote de contratos sin PDF generado. Admin only. El cliente lo llama
 * en loop hasta remaining=0 (evita timeouts del serverless).
 */
export async function backfillContractPdfsBatch(
  batchSize = 12,
): Promise<{ ok: boolean; message?: string; result?: BackfillResult }> {
  if (!(await isCurrentUserAdmin())) return { ok: false, message: "Solo admin." };
  const supabase = await createClient();

  // ids que ya tienen PDF generado
  const { data: done } = await supabase
    .from("attachments")
    .select("entity_id")
    .eq("entity_type", "contract")
    .is("deleted_at", null)
    .like("path", `%/${GENERATED_DIR}/%`);
  const doneSet = new Set((done ?? []).map((d) => (d as { entity_id: string }).entity_id));

  const { data: contracts, error } = await supabase
    .from("contracts")
    .select("id, number")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (error) return { ok: false, message: error.message };

  const pending = (contracts ?? []).filter(
    (c) => !doneSet.has((c as { id: string }).id),
  ) as { id: string; number: string }[];

  const batch = pending.slice(0, batchSize);
  const result: BackfillResult = {
    processed: 0,
    attached: 0,
    skipped: 0,
    failed: [],
    remaining: pending.length,
  };

  for (const ct of batch) {
    result.processed += 1;
    try {
      const r = await generateAndAttachContractPdf(ct.id);
      if (r.ok && r.skipped) result.skipped += 1;
      else if (r.ok) result.attached += 1;
      else result.failed.push({ number: ct.number, reason: r.message ?? "error" });
    } catch (e) {
      result.failed.push({
        number: ct.number,
        reason: e instanceof Error ? e.message : "error",
      });
    }
  }
  result.remaining = pending.length - result.attached - result.skipped;
  return { ok: true, result };
}
