"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { getFxRates } from "@/lib/actions/fx-rates";
import type { Database, Json } from "@/lib/database.types";
import type { ExportCompromisosRow } from "@/lib/export/compromisos";
import { docTypeMeta } from "@/lib/contract-doc-type";

type ContractStatus = Database["public"]["Enums"]["contract_status"];
type CurrencyCode = Database["public"]["Enums"]["currency_code"];
type ConditionType = Database["public"]["Enums"]["condition_type"];
type SaleType = Database["public"]["Enums"]["sale_type"];
type CommercialDocType = Database["public"]["Enums"]["commercial_doc_type"];
type MaterialType = Database["public"]["Enums"]["material_type"];
type AmendmentType = Database["public"]["Enums"]["amendment_type"];
type PaymentType = Database["public"]["Enums"]["payment_type"];

export type ContractListFilters = {
  status?: ContractStatus | null;
  organizationId?: string | null;
  clientId?: string | null;
  year?: number | null;
  currency?: CurrencyCode | null;
  search?: string | null;
};

export type ContractItemInput = {
  varietyId: string;
  qtyPlants: number;
  unitPrice: number;
  currency: CurrencyCode;
  deliveryYear: number;
  deliveryWeek: number;
  format?: string | null;
  materialType?: MaterialType | null;
  geneticProgramId?: string | null;
  notes?: string | null;
};

export type CreateContractInput = {
  clientId: string;
  organizationId: string;
  currency: CurrencyCode;
  incoterm?: string | null;
  condition?: ConditionType;
  saleType?: SaleType | null;
  docType?: CommercialDocType;
  /** Cliente al que se despacha si difiere del que paga (clientId). */
  shipToClientId?: string | null;
  signedAt?: string | null;
  fxRateToUsd?: number | null;
  notes?: string | null;
  items: ContractItemInput[];
  anticipo1Amount: number;
  anticipo2Amount: number;
  saldoAmount: number;
  anticipo1DueDate?: string | null;
  anticipo2DueDate?: string | null;
  saldoDueDate?: string | null;
};

// Transiciones permitidas. Cada estado lista a dónde puede ir — incluye el
// paso hacia ADELANTE (avanzar en el flujo), el paso hacia ATRÁS (corregir un
// avance prematuro) y cancelar. Los estados terminales (finalizado/cancelado)
// pueden volver atrás para deshacer un cierre/cancelación equivocada.
const ALLOWED_TRANSITIONS: Record<ContractStatus, ContractStatus[]> = {
  borrador: ["firmado", "cancelado"],
  // por_revisar se descontinuó pero se permite la salida directa a firmado
  // para datos legacy que aún no migraron.
  por_revisar: ["firmado", "borrador", "cancelado"],
  firmado: ["en_proceso", "borrador", "cancelado"],
  en_proceso: ["finalizado", "firmado", "cancelado"],
  finalizado: ["en_proceso"],
  cancelado: ["borrador"],
};

export async function listContracts(filters: ContractListFilters = {}) {
  const supabase = await createClient();
  let q = supabase
    .from("contracts")
    .select(
      `id, number, status, condition, doc_type, currency, total_neto, total_iva, total_neto_usd, signed_at, created_at, client_id, organization_id, ship_to_client_id,
       client:clients!contracts_client_id_fkey ( id, name, country:countries ( id, iso2, name_es ) ),
       organization:organizations!contracts_organization_id_fkey ( id, name, contract_prefix ),
       items:contract_items ( id, qty_plants, variety:varieties ( id, name, species:species ( id, name ) ) )`,
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (filters.status) q = q.eq("status", filters.status);
  if (filters.organizationId) q = q.eq("organization_id", filters.organizationId);
  if (filters.clientId) q = q.eq("client_id", filters.clientId);
  if (filters.currency) q = q.eq("currency", filters.currency);
  if (filters.year) {
    const from = `${filters.year}-01-01`;
    const to = `${filters.year + 1}-01-01`;
    q = q.gte("created_at", from).lt("created_at", to);
  }
  if (filters.search && filters.search.trim().length > 0) {
    q = q.ilike("number", `%${filters.search.trim()}%`);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

// ---------------------------------------------------------------------------
// Export "Todo" — replica la planilla original BBDD ventas (hoja "Compromisos").
// Devuelve una fila por contract_item con las 41 columnas originales, listo
// para volcar a .xlsx en el cliente. Campos no almacenados en el modelo nuevo
// (País origen, Centro de costo, Punto contacto) salen vacíos.
// Financieros: Total Neto se calcula por item (qty * valor planta); los
// anticipos/saldo son a nivel contrato y se repiten en cada fila del contrato
// (igual que en la planilla original denormalizada).
// ---------------------------------------------------------------------------

const MONTHS_ES_FULL = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

function prettyEnum(v: string | null | undefined): string {
  if (!v) return "";
  const s = v.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// El importador legacy empaquetó metadata en `notes` con el formato
// "source:excel_import | Venta 2024 | Centro de costo: Frutales".
// Acá lo desempaquetamos: recuperamos el Centro de costo a su columna y
// dejamos el Comentario limpio (sin metadata interna ni tokens redundantes).
function parseNotes(notes: string | null | undefined): {
  centroDeCosto: string;
  comentario: string;
} {
  if (!notes) return { centroDeCosto: "", comentario: "" };
  let centroDeCosto = "";
  const comentarioParts: string[] = [];
  for (const raw of notes.split("|")) {
    const part = raw.trim();
    if (!part) continue;
    const cc = part.match(/^centro de costo:\s*(.+)$/i);
    if (cc) { centroDeCosto = cc[1].trim(); continue; }
    if (/^source[:_]/i.test(part)) continue; // source:excel_import / source_sheet:...
    if (/^incoterm note:/i.test(part)) continue;
    // Token redundante "Venta 2024" / "Muestra 2025" (condición + año)
    if (/^(venta|muestra|reposici[oó]n)\s+\d{4}$/i.test(part)) continue;
    comentarioParts.push(part);
  }
  return { centroDeCosto, comentario: comentarioParts.join(" | ") };
}

type RawContactExport = {
  name: string | null;
  email: string | null;
  phone: string | null;
  is_primary: boolean | null;
  deleted_at: string | null;
};
type RawItemExport = {
  qty_plants: number | null;
  qty_delivered: number | null;
  unit_price: number | null;
  currency: string | null;
  format: string | null;
  material_type: string | null;
  delivery_year: number | null;
  delivery_week: number | null;
  delivery_month: number | null;
  status: string | null;
  notes: string | null;
  deleted_at: string | null;
  variety: {
    name: string | null;
    species: { name: string | null } | null;
    genetic_program: { name: string | null } | null;
  } | null;
};
type RawPaymentExport = {
  type: PaymentType | null;
  amount: number | null;
  iva: number | null;
  status: string | null;
};
type RawContractExport = {
  number: string | null;
  status: string | null;
  condition: string | null;
  doc_type: string | null;
  sale_type: string | null;
  incoterm: string | null;
  notes: string | null;
  ship_to_client: { name: string | null } | null;
  client: {
    name: string | null;
    tax_id: string | null;
    giro: string | null;
    region: string | null;
    country: { name_es: string | null } | null;
    contacts: RawContactExport[] | null;
  } | null;
  organization: { name: string | null } | null;
  items: RawItemExport[] | null;
  payments: RawPaymentExport[] | null;
};

export async function exportAllContractItems(): Promise<ExportCompromisosRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("contracts")
    .select(
      `number, status, condition, doc_type, sale_type, incoterm, notes,
       ship_to_client:clients!contracts_ship_to_client_id_fkey ( name ),
       client:clients!contracts_client_id_fkey (
         name, tax_id, giro, region,
         country:countries ( name_es ),
         contacts:client_contacts ( name, email, phone, is_primary, deleted_at )
       ),
       organization:organizations!contracts_organization_id_fkey ( name ),
       items:contract_items (
         qty_plants, qty_delivered, unit_price, currency, format, material_type,
         delivery_year, delivery_week, delivery_month, status, notes, deleted_at,
         variety:varieties ( name, species:species ( name ), genetic_program:genetic_programs ( name ) )
       ),
       payments ( type, amount, iva, status )`,
    )
    .is("deleted_at", null)
    .order("number", { ascending: true });

  if (error) throw new Error(error.message);

  const contracts = (data ?? []) as unknown as RawContractExport[];
  const rows: ExportCompromisosRow[] = [];

  for (const c of contracts) {
    const client = c.client;
    const contacts = (client?.contacts ?? []).filter((ct) => !ct.deleted_at);
    const contact = contacts.find((ct) => ct.is_primary) ?? contacts[0] ?? null;

    const payments = c.payments ?? [];
    const pay = (t: PaymentType) => payments.find((p) => p.type === t) ?? null;
    const a1 = pay("anticipo_1");
    const a2 = pay("anticipo_2");
    const saldo = pay("saldo");

    const { centroDeCosto, comentario } = parseNotes(c.notes);

    const items = (c.items ?? []).filter((it) => !it.deleted_at);
    // Un contrato sin items igual sale como una fila (para no perder contratos).
    const itemList: (RawItemExport | null)[] = items.length > 0 ? items : [null];

    for (const it of itemList) {
      const qty = it?.qty_plants ?? null;
      const price = it?.unit_price ?? null;
      const totalNeto =
        qty != null && price != null ? Math.round(qty * price * 100) / 100 : null;
      const month = it?.delivery_month ?? null;

      rows.push({
        "País origen": "",
        "País Destino": client?.country?.name_es ?? "",
        "Región": client?.region ?? "",
        "Empresa vendedora": c.organization?.name ?? "",
        "Cliente": client?.name ?? "",
        "# Contrato": c.number ?? "",
        "Situación Contrato": prettyEnum(c.status),
        "Situación Anticipo 1": prettyEnum(a1?.status),
        "Situación Anticipo 2": prettyEnum(a2?.status),
        "Condición": prettyEnum(c.condition),
        "Tipo de venta": prettyEnum(c.sale_type),
        "Tipo Documento": docTypeMeta(c.doc_type).label,
        "Cliente Despacho": c.ship_to_client?.name ?? "",
        "Centro de costo": centroDeCosto,
        "Especie": it?.variety?.species?.name ?? "",
        "Variedad": it?.variety?.name ?? "",
        "Tipo de material": prettyEnum(it?.material_type),
        "Situación entrega": prettyEnum(it?.status),
        "Programa genético": it?.variety?.genetic_program?.name ?? "",
        "Formato": it?.format ?? "",
        "Moneda": it?.currency ?? "",
        "Incoterm": c.incoterm ?? "",
        "Rut": client?.tax_id ?? "",
        "Giro": client?.giro ?? "",
        "Comentario": comentario || it?.notes || "",
        "Contacto": contact?.name ?? "",
        "Teléfono de contacto": contact?.phone ?? "",
        "Mail": contact?.email ?? "",
        "Punto contacto": "",
        "# plantas": qty,
        "# entregada": it?.qty_delivered ?? null,
        "Valor planta": price,
        "Año entrega": it?.delivery_year ?? null,
        "Mes entrega": month != null && month >= 1 && month <= 12 ? MONTHS_ES_FULL[month - 1] : "",
        "Wk entrega": it?.delivery_week ?? null,
        "Total Neto": totalNeto,
        "Total IVA": null,
        "Anticipo 1": a1?.amount ?? null,
        "IVA anticipo 1": a1?.iva ?? null,
        "Anticipo 2": a2?.amount ?? null,
        "IVA anticipo 2": a2?.iva ?? null,
        "Saldo": saldo?.amount ?? null,
        "IVA saldo": saldo?.iva ?? null,
      });
    }
  }

  return rows;
}

export async function getContract(id: string) {
  const supabase = await createClient();
  const { data: contract, error } = await supabase
    .from("contracts")
    .select(
      `*,
       client:clients!contracts_client_id_fkey ( id, name, tax_id, country_id ),
       ship_to_client:clients!contracts_ship_to_client_id_fkey ( id, name ),
       organization:organizations!contracts_organization_id_fkey ( id, name, contract_prefix, default_currency ),
       items:contract_items (
         id, variety_id, qty_plants, qty_delivered, unit_price, currency, delivery_year, delivery_week,
         format, material_type, genetic_program_id, status, notes,
         variety:varieties ( id, name, species_id, genetic_program_id )
       ),
       payments ( id, type, amount, iva, currency, status, due_date, paid_at, reference ),
       amendments:contract_amendments ( id, type, reason, diff_json, applied_at, created_by, created_at ),
       versions:contract_versions ( id, version_n, snapshot_json, pdf_url, frozen_at, created_at )`,
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (error) throw new Error(error.message);
  return contract;
}

/**
 * Edita campos de cabecera que no afectan totales ni flujo de estados:
 * tipo de documento y cliente de despacho (ship-to).
 */
export async function updateContractHeader(
  contractId: string,
  patch: Partial<{
    docType: CommercialDocType;
    shipToClientId: string | null;
  }>,
) {
  const supabase = await createClient();
  const update: Record<string, unknown> = {};
  if (patch.docType !== undefined) update.doc_type = patch.docType;
  if (patch.shipToClientId !== undefined)
    update.ship_to_client_id = patch.shipToClientId;
  if (Object.keys(update).length === 0) return;

  const { error } = await supabase
    .from("contracts")
    .update(update)
    .eq("id", contractId);
  if (error) throw new Error(error.message);

  revalidatePath(`/contratos/${contractId}`);
  revalidatePath("/contratos");
}

/**
 * Soft-delete de un contrato — marca deleted_at. Lo oculta de las listas y
 * agregaciones (toda la app filtra por `.is("deleted_at", null)`).
 */
export async function deleteContract(contractId: string) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("contracts")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", contractId);
  if (error) throw new Error(error.message);

  revalidatePath("/contratos");
  revalidatePath(`/contratos/${contractId}`);
  return { ok: true };
}

export async function recalculateContractTotals(contractId: string) {
  const supabase = await createClient();

  const { data: items, error: itemsErr } = await supabase
    .from("contract_items")
    .select("qty_plants, unit_price, currency")
    .eq("contract_id", contractId)
    .is("deleted_at", null);
  if (itemsErr) throw new Error(itemsErr.message);

  const { data: contract, error: contractErr } = await supabase
    .from("contracts")
    .select("currency, fx_rate_to_usd")
    .eq("id", contractId)
    .single();
  if (contractErr) throw new Error(contractErr.message);

  // Trae FX rates del sistema (mode por currency). Fallback al fx del contrato
  // para CLP / EUR si no hay datos suficientes.
  const fxRates = await getFxRates();
  const contractFx = Number(contract.fx_rate_to_usd ?? 0);
  const clpPerUsd =
    fxRates.clpPerUsd > 0
      ? fxRates.clpPerUsd
      : contract.currency === "CLP" && contractFx > 0
        ? contractFx
        : 950;
  const eurPerUsd =
    fxRates.eurPerUsd > 0
      ? fxRates.eurPerUsd
      : contract.currency === "EUR" && contractFx > 0
        ? contractFx
        : 0.92;

  // Convierte un monto en moneda X a USD.
  const toUsd = (amount: number, currency: string): number => {
    switch (currency) {
      case "USD":
        return amount;
      case "CLP":
        return clpPerUsd > 0 ? amount / clpPerUsd : 0;
      case "EUR":
        return eurPerUsd > 0 ? amount / eurPerUsd : 0;
      default:
        return amount; // fallback: asume USD
    }
  };

  // 1) Sumamos cada item en USD según su PROPIA currency.
  let totalNetoUsd = 0;
  for (const it of items ?? []) {
    const v = Number(it.qty_plants) * Number(it.unit_price);
    totalNetoUsd += toUsd(v, it.currency);
  }

  // 2) total_neto en la currency del contrato (convierte USD → currency).
  let totalNeto: number;
  switch (contract.currency) {
    case "USD":
      totalNeto = totalNetoUsd;
      break;
    case "CLP":
      totalNeto = totalNetoUsd * clpPerUsd;
      break;
    case "EUR":
      totalNeto = totalNetoUsd * eurPerUsd;
      break;
    default:
      totalNeto = totalNetoUsd;
  }

  // 3) IVA solo aplica si la currency del contrato es CLP.
  const ivaRate = contract.currency === "CLP" ? 0.19 : 0;
  const totalIva = totalNeto * ivaRate;

  const { error: updErr } = await supabase
    .from("contracts")
    .update({
      total_neto: totalNeto,
      total_iva: totalIva,
      total_neto_usd: totalNetoUsd,
    })
    .eq("id", contractId);
  if (updErr) throw new Error(updErr.message);

  return { totalNeto, totalIva, totalNetoUsd };
}

async function generateContractNumber(
  organizationId: string,
  year: number,
): Promise<string> {
  const supabase = await createClient();
  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .select("contract_prefix")
    .eq("id", organizationId)
    .single();
  if (orgErr) throw new Error(orgErr.message);

  const prefix = org.contract_prefix;
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year + 1}-01-01`;

  const { data: rows, error } = await supabase
    .from("contracts")
    .select("number")
    .eq("organization_id", organizationId)
    .gte("created_at", yearStart)
    .lt("created_at", yearEnd)
    .like("number", `${prefix}-${year}-%`);
  if (error) throw new Error(error.message);

  let maxN = 0;
  for (const r of rows ?? []) {
    const parts = r.number.split("-");
    const n = parseInt(parts[parts.length - 1] ?? "0", 10);
    if (!isNaN(n) && n > maxN) maxN = n;
  }
  const next = String(maxN + 1).padStart(4, "0");
  return `${prefix}-${year}-${next}`;
}

export async function previewContractNumber(organizationId: string) {
  const year = new Date().getFullYear();
  return generateContractNumber(organizationId, year);
}

export async function createContract(input: CreateContractInput) {
  const supabase = await createClient();
  const year = input.signedAt
    ? new Date(input.signedAt).getFullYear()
    : new Date().getFullYear();

  const number = await generateContractNumber(input.organizationId, year);

  const { data: contract, error: cErr } = await supabase
    .from("contracts")
    .insert({
      number,
      client_id: input.clientId,
      organization_id: input.organizationId,
      currency: input.currency,
      condition: input.condition ?? "venta",
      doc_type: input.docType ?? "contrato",
      ship_to_client_id: input.shipToClientId ?? null,
      incoterm: input.incoterm ?? null,
      sale_type: input.saleType ?? null,
      signed_at: input.signedAt ?? null,
      fx_rate_to_usd: input.fxRateToUsd ?? null,
      notes: input.notes ?? null,
      // Venta spot no pasa por firma: nace directo en ejecución.
      status: (input.docType === "venta_spot"
        ? "en_proceso"
        : "borrador") as ContractStatus,
    })
    .select("id")
    .single();
  if (cErr) throw new Error(cErr.message);

  if (input.items.length > 0) {
    const rows = input.items.map((it) => ({
      contract_id: contract.id,
      variety_id: it.varietyId,
      qty_plants: it.qtyPlants,
      unit_price: it.unitPrice,
      currency: it.currency,
      delivery_year: it.deliveryYear,
      delivery_week: it.deliveryWeek,
      format: it.format ?? null,
      material_type: it.materialType ?? null,
      genetic_program_id: it.geneticProgramId ?? null,
      notes: it.notes ?? null,
    }));
    const { error: itErr } = await supabase
      .from("contract_items")
      .insert(rows);
    if (itErr) throw new Error(itErr.message);
  }

  const paymentsToInsert: Array<{
    contract_id: string;
    type: PaymentType;
    amount: number;
    currency: CurrencyCode;
    due_date: string | null;
  }> = [
    {
      contract_id: contract.id,
      type: "anticipo_1",
      amount: input.anticipo1Amount,
      currency: input.currency,
      due_date: input.anticipo1DueDate ?? null,
    },
    {
      contract_id: contract.id,
      type: "anticipo_2",
      amount: input.anticipo2Amount,
      currency: input.currency,
      due_date: input.anticipo2DueDate ?? null,
    },
    {
      contract_id: contract.id,
      type: "saldo",
      amount: input.saldoAmount,
      currency: input.currency,
      due_date: input.saldoDueDate ?? null,
    },
  ];
  const { error: pErr } = await supabase
    .from("payments")
    .insert(paymentsToInsert);
  if (pErr) throw new Error(pErr.message);

  await recalculateContractTotals(contract.id);

  revalidatePath("/contratos");
  return { id: contract.id, number };
}

export async function updateContractItem(
  itemId: string,
  patch: Partial<{
    qty_plants: number;
    unit_price: number;
    delivery_year: number;
    delivery_week: number;
    format: string | null;
    material_type: MaterialType | null;
    notes: string | null;
    currency: CurrencyCode;
  }>,
) {
  const supabase = await createClient();
  const { data: item, error: getErr } = await supabase
    .from("contract_items")
    .select("contract_id")
    .eq("id", itemId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const { error } = await supabase
    .from("contract_items")
    .update(patch)
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  await recalculateContractTotals(item.contract_id);
  revalidatePath(`/contratos/${item.contract_id}`);
  revalidatePath("/calendario");
  revalidatePath("/contratos");
  return { ok: true };
}

/**
 * Soft-delete de un contract_item (entrega). Recalcula totales del contrato
 * padre y revalida calendario/contratos para que la UI se refresque.
 */
export async function deleteContractItem(itemId: string) {
  const supabase = await createClient();
  const { data: item, error: getErr } = await supabase
    .from("contract_items")
    .select("contract_id")
    .eq("id", itemId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const { error } = await supabase
    .from("contract_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  await recalculateContractTotals(item.contract_id);
  revalidatePath(`/contratos/${item.contract_id}`);
  revalidatePath("/calendario");
  revalidatePath("/contratos");
  return { ok: true };
}

export async function addContractItem(
  contractId: string,
  data: ContractItemInput,
  reason: string,
) {
  const supabase = await createClient();
  const { data: inserted, error } = await supabase
    .from("contract_items")
    .insert({
      contract_id: contractId,
      variety_id: data.varietyId,
      qty_plants: data.qtyPlants,
      unit_price: data.unitPrice,
      currency: data.currency,
      delivery_year: data.deliveryYear,
      delivery_week: data.deliveryWeek,
      format: data.format ?? null,
      material_type: data.materialType ?? null,
      genetic_program_id: data.geneticProgramId ?? null,
      notes: data.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const diff: Json = {
    action: "add_item",
    item_id: inserted.id,
    after: data as unknown as Json,
  };
  const { error: amErr } = await supabase.from("contract_amendments").insert({
    contract_id: contractId,
    type: "add" as AmendmentType,
    reason,
    diff_json: diff,
  });
  if (amErr) throw new Error(amErr.message);

  await recalculateContractTotals(contractId);
  revalidatePath(`/contratos/${contractId}`);
  return { id: inserted.id };
}

export async function withdrawContractItem(itemId: string, reason: string) {
  const supabase = await createClient();
  const { data: item, error: getErr } = await supabase
    .from("contract_items")
    .select("contract_id, qty_plants, unit_price")
    .eq("id", itemId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const { error: updErr } = await supabase
    .from("contract_items")
    .update({
      qty_plants: 0,
      status: "eliminado",
    })
    .eq("id", itemId);
  if (updErr) throw new Error(updErr.message);

  const diff: Json = {
    action: "withdraw_item",
    item_id: itemId,
    before: { qty_plants: Number(item.qty_plants), unit_price: Number(item.unit_price) },
    after: { qty_plants: 0, status: "eliminado" },
  };
  const { error: amErr } = await supabase.from("contract_amendments").insert({
    contract_id: item.contract_id,
    type: "withdraw" as AmendmentType,
    reason,
    diff_json: diff,
  });
  if (amErr) throw new Error(amErr.message);

  await recalculateContractTotals(item.contract_id);
  revalidatePath(`/contratos/${item.contract_id}`);
  return { ok: true };
}

export async function modifyContractItem(
  itemId: string,
  patch: Partial<{
    qty_plants: number;
    unit_price: number;
    delivery_year: number;
    delivery_week: number;
  }>,
  reason: string,
) {
  const supabase = await createClient();
  const { data: item, error: getErr } = await supabase
    .from("contract_items")
    .select(
      "contract_id, qty_plants, unit_price, delivery_year, delivery_week",
    )
    .eq("id", itemId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const { error: updErr } = await supabase
    .from("contract_items")
    .update(patch)
    .eq("id", itemId);
  if (updErr) throw new Error(updErr.message);

  const diff: Json = {
    action: "modify_item",
    item_id: itemId,
    before: {
      qty_plants: Number(item.qty_plants),
      unit_price: Number(item.unit_price),
      delivery_year: item.delivery_year,
      delivery_week: item.delivery_week,
    },
    after: patch as unknown as Json,
  };
  const { error: amErr } = await supabase.from("contract_amendments").insert({
    contract_id: item.contract_id,
    type: "modify" as AmendmentType,
    reason,
    diff_json: diff,
  });
  if (amErr) throw new Error(amErr.message);

  await recalculateContractTotals(item.contract_id);
  revalidatePath(`/contratos/${item.contract_id}`);
  return { ok: true };
}

export async function freezeContractVersion(contractId: string) {
  const supabase = await createClient();
  const { data: contract, error } = await supabase
    .from("contracts")
    .select(
      `*,
       items:contract_items ( * ),
       payments ( * )`,
    )
    .eq("id", contractId)
    .single();
  if (error) throw new Error(error.message);

  const { data: existing } = await supabase
    .from("contract_versions")
    .select("version_n")
    .eq("contract_id", contractId)
    .order("version_n", { ascending: false })
    .limit(1);

  const nextVersion = (existing?.[0]?.version_n ?? 0) + 1;

  const { error: vErr } = await supabase.from("contract_versions").insert({
    contract_id: contractId,
    version_n: nextVersion,
    snapshot_json: contract as unknown as Json,
  });
  if (vErr) throw new Error(vErr.message);

  return { versionN: nextVersion };
}

export async function transitionContractStatus(
  contractId: string,
  toStatus: ContractStatus,
) {
  const supabase = await createClient();
  const { data: current, error: getErr } = await supabase
    .from("contracts")
    .select("status")
    .eq("id", contractId)
    .single();
  if (getErr) throw new Error(getErr.message);

  const currentStatus = current.status as ContractStatus;
  const allowed = ALLOWED_TRANSITIONS[currentStatus];
  if (!allowed.includes(toStatus)) {
    throw new Error(
      `Transición no permitida: ${currentStatus} → ${toStatus}`,
    );
  }

  // ¿Es una firma "por primera vez"? Solo cuando venimos de un estado previo
  // a firmado (borrador/por_revisar). Volver a firmado desde en_proceso es un
  // retroceso y NO debe re-sellar la fecha ni congelar una versión nueva.
  const isInitialSigning =
    toStatus === "firmado" &&
    (currentStatus === "borrador" || currentStatus === "por_revisar");

  const updates: { status: ContractStatus; signed_at?: string | null } = {
    status: toStatus,
  };
  if (isInitialSigning) {
    updates.signed_at = new Date().toISOString();
  } else if (toStatus === "borrador") {
    // Al volver a borrador el contrato deja de estar firmado.
    updates.signed_at = null;
  }

  const { error } = await supabase
    .from("contracts")
    .update(updates)
    .eq("id", contractId);
  if (error) throw new Error(error.message);

  if (isInitialSigning) {
    await freezeContractVersion(contractId);
  }

  revalidatePath(`/contratos/${contractId}`);
  revalidatePath("/contratos");
  return { ok: true, status: toStatus };
}

// Catalog helpers used by the wizard / amendments modal.

export async function listOrganizationsForSelect() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, contract_prefix, default_currency")
    .is("deleted_at", null)
    .eq("active", true)
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listClientsForSelect(search?: string) {
  const supabase = await createClient();
  let q = supabase
    .from("clients")
    .select("id, name, tax_id")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name")
    .limit(20);
  if (search && search.trim().length > 0) {
    q = q.ilike("name", `%${search.trim()}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listVarietiesForSelect(search?: string) {
  const supabase = await createClient();
  let q = supabase
    .from("varieties")
    .select("id, name, species_id, genetic_program_id, royalty_per_plant")
    .is("deleted_at", null)
    .eq("is_active", true)
    .order("name")
    .limit(30);
  if (search && search.trim().length > 0) {
    q = q.ilike("name", `%${search.trim()}%`);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}
