"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { isCurrentUserAdmin } from "@/lib/actions/admin-users";
import { recalculateContractTotals } from "@/lib/actions/contratos";
import type { Database } from "@/lib/database.types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];
type ConditionType = Database["public"]["Enums"]["condition_type"];
type SaleType = Database["public"]["Enums"]["sale_type"];
type CommercialDocType = Database["public"]["Enums"]["commercial_doc_type"];
type MaterialType = Database["public"]["Enums"]["material_type"];

// Una fila cruda parseada del Excel (claves = encabezados de la hoja "Compromisos").
export type ImportRawRow = Record<string, string | number | boolean | null | undefined>;

export type ImportRowError = { row: number; reason: string };

export type ImportPreview = {
  totalRows: number;
  contractsNew: number;
  contractsExisting: number;
  clientsNew: number;
  itemsNew: number;
  rowErrors: ImportRowError[];
  newClientNames: string[];
  newContractNumbers: string[];
};

export type ImportResult = {
  ok: boolean;
  contractsCreated: number;
  clientsCreated: number;
  itemsCreated: number;
  errors: ImportRowError[];
};

// --------------------------------------------------------------------------
// Helpers de normalización
// --------------------------------------------------------------------------

function norm(s: unknown): string {
  if (s == null) return "";
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/\s/g, "");
  // "1.234,56" → "1234.56" ; "1234,56" → "1234.56"
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function int(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

function normTaxId(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  return s.replace(/[.\s]/g, "").toUpperCase();
}

function mapCurrency(v: unknown): CurrencyCode {
  const n = norm(v);
  if (n.includes("clp") || n.includes("peso")) return "CLP";
  if (n.includes("eur")) return "EUR";
  return "USD";
}

function mapCondition(v: unknown): ConditionType {
  const n = norm(v);
  if (n.startsWith("repos")) return "reposicion";
  if (n.startsWith("muestra")) return "muestra";
  return "venta";
}

function mapSaleType(v: unknown): SaleType | null {
  const n = norm(v);
  if (n.startsWith("export")) return "exportacion";
  if (n.startsWith("nacional")) return "nacional";
  return null;
}

function mapDocType(v: unknown): CommercialDocType {
  const n = norm(v);
  if (n.includes("orden") || n === "oc") return "orden_compra";
  if (n.includes("spot")) return "venta_spot";
  return "contrato";
}

function mapMaterial(v: unknown): MaterialType | null {
  const n = norm(v);
  if (!n) return null;
  if (n.includes("vitro")) return "vitro";
  if (n.includes("raiz") || n.includes("cubierta")) return "raiz_cubierta";
  return "otros";
}

// Lee una celda probando varios nombres de encabezado posibles.
function cell(row: ImportRawRow, ...keys: string[]): unknown {
  for (const k of keys) {
    if (k in row && row[k] != null && row[k] !== "") return row[k];
  }
  return null;
}

// --------------------------------------------------------------------------
// Plan de importación (compartido entre dry-run y commit)
// --------------------------------------------------------------------------

type PlannedItem = {
  varietyId: string;
  geneticProgramId: string | null;
  qtyPlants: number;
  qtyDelivered: number;
  unitPrice: number;
  currency: CurrencyCode;
  deliveryYear: number;
  deliveryWeek: number;
  format: string | null;
  materialType: MaterialType | null;
  notes: string | null;
};

type PlannedClientNew = {
  key: string;
  name: string;
  taxId: string | null;
  giro: string | null;
  region: string | null;
  countryId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
};

type PlannedContract = {
  number: string;
  clientKey: string; // "id:<uuid>" o "new:<key>"
  organizationId: string;
  currency: CurrencyCode;
  condition: ConditionType;
  docType: CommercialDocType;
  saleType: SaleType | null;
  incoterm: string | null;
  notes: string | null;
  anticipo1: number;
  anticipo2: number;
  saldo: number;
  items: PlannedItem[];
};

type Plan = {
  contracts: PlannedContract[];
  newClients: Map<string, PlannedClientNew>;
  errors: ImportRowError[];
  existingSkipped: number;
};

async function buildPlan(rows: ImportRawRow[]): Promise<Plan> {
  const supabase = await createClient();

  // ---- Cargar catálogos de referencia --------------------------------------
  const [orgsRes, countriesRes, speciesRes, varietiesRes, programsRes, clientsRes, contractsRes] =
    await Promise.all([
      supabase.from("organizations").select("id, name, contract_prefix").is("deleted_at", null),
      supabase.from("countries").select("id, name_es"),
      supabase.from("species").select("id, name"),
      supabase.from("varieties").select("id, name, species_id, genetic_program_id").is("deleted_at", null),
      supabase.from("genetic_programs").select("id, name").is("deleted_at", null),
      supabase.from("clients").select("id, name, tax_id").is("deleted_at", null),
      supabase.from("contracts").select("number").is("deleted_at", null),
    ]);

  const orgByName = new Map<string, string>();
  const orgByPrefix = new Map<string, string>();
  for (const o of orgsRes.data ?? []) {
    orgByName.set(norm(o.name), o.id);
    if (o.contract_prefix) orgByPrefix.set(norm(o.contract_prefix), o.id);
  }
  const countryByName = new Map<string, string>();
  for (const c of countriesRes.data ?? []) countryByName.set(norm(c.name_es), c.id);
  const speciesByName = new Map<string, string>();
  for (const s of speciesRes.data ?? []) speciesByName.set(norm(s.name), s.id);
  const varietyByKey = new Map<string, { id: string; gp: string | null }>();
  for (const v of varietiesRes.data ?? [])
    varietyByKey.set(`${v.species_id}::${norm(v.name)}`, { id: v.id, gp: v.genetic_program_id });
  const programByName = new Map<string, string>();
  for (const p of programsRes.data ?? []) programByName.set(norm(p.name), p.id);
  const clientByTax = new Map<string, string>();
  const clientByName = new Map<string, string>();
  for (const c of clientsRes.data ?? []) {
    if (c.tax_id) clientByTax.set(normTaxId(c.tax_id)!, c.id);
    clientByName.set(norm(c.name), c.id);
  }
  const existingNumbers = new Set<string>();
  for (const c of contractsRes.data ?? []) existingNumbers.add(norm(c.number));

  const newClients = new Map<string, PlannedClientNew>();
  const contractsByNumber = new Map<string, PlannedContract>();
  const errors: ImportRowError[] = [];
  let existingSkipped = 0;
  const autoSeq = new Map<string, number>(); // prefix-year → contador batch

  rows.forEach((row, i) => {
    const rowNum = i + 2; // +2: fila 1 = encabezados en el Excel
    const clienteRaw = str(cell(row, "Cliente"));
    const empresaRaw = str(cell(row, "Empresa vendedora"));
    const especieRaw = str(cell(row, "Especie"));
    const variedadRaw = str(cell(row, "Variedad"));
    const qtyPlants = int(cell(row, "# plantas", "# Plantas", "Plantas"));

    if (!clienteRaw) { errors.push({ row: rowNum, reason: "Falta Cliente" }); return; }
    if (!empresaRaw) { errors.push({ row: rowNum, reason: "Falta Empresa vendedora" }); return; }
    if (!especieRaw || !variedadRaw) { errors.push({ row: rowNum, reason: "Falta Especie o Variedad" }); return; }
    if (qtyPlants == null || qtyPlants <= 0) { errors.push({ row: rowNum, reason: "# plantas inválido" }); return; }

    // Organización
    const orgId = orgByName.get(norm(empresaRaw)) ?? orgByPrefix.get(norm(empresaRaw));
    if (!orgId) { errors.push({ row: rowNum, reason: `Organización desconocida: "${empresaRaw}"` }); return; }

    // Especie + Variedad
    const speciesId = speciesByName.get(norm(especieRaw));
    if (!speciesId) { errors.push({ row: rowNum, reason: `Especie desconocida: "${especieRaw}"` }); return; }
    const variety = varietyByKey.get(`${speciesId}::${norm(variedadRaw)}`);
    if (!variety) { errors.push({ row: rowNum, reason: `Variedad desconocida: "${variedadRaw}" (${especieRaw})` }); return; }

    // Programa genético (opcional → resuelve por nombre, fallback al de la variedad)
    const progRaw = str(cell(row, "Programa genético", "Programa Genético"));
    const geneticProgramId = (progRaw ? programByName.get(norm(progRaw)) : null) ?? variety.gp ?? null;

    // Cliente (dedup por RUT, luego por nombre; si no, nuevo)
    const taxId = normTaxId(cell(row, "Rut", "RUT"));
    let clientKey: string;
    const existingClientId =
      (taxId ? clientByTax.get(taxId) : undefined) ?? clientByName.get(norm(clienteRaw));
    if (existingClientId) {
      clientKey = `id:${existingClientId}`;
    } else {
      const newKey = `new:${taxId ?? norm(clienteRaw)}`;
      clientKey = newKey;
      if (!newClients.has(newKey)) {
        const countryRaw = str(cell(row, "País Destino", "Pais Destino", "País destino"));
        newClients.set(newKey, {
          key: newKey,
          name: clienteRaw,
          taxId: str(cell(row, "Rut", "RUT")),
          giro: str(cell(row, "Giro")),
          region: str(cell(row, "Región", "Region")),
          countryId: countryRaw ? countryByName.get(norm(countryRaw)) ?? null : null,
          contactName: str(cell(row, "Contacto")),
          contactEmail: str(cell(row, "Mail", "Email", "Correo")),
          contactPhone: str(cell(row, "Teléfono de contacto", "Telefono de contacto", "Teléfono")),
        });
      }
    }

    const currency = mapCurrency(cell(row, "Moneda"));
    const deliveryYear = int(cell(row, "Año entrega", "Ano entrega")) ?? new Date().getFullYear();
    const deliveryWeek = int(cell(row, "Wk entrega", "Semana entrega")) ?? 1;
    const unitPrice = num(cell(row, "Valor planta", "Valor Planta")) ?? 0;

    // Número de contrato: si viene, se usa tal cual; si no, se autogenera.
    let number = str(cell(row, "# Contrato", "#Contrato", "Contrato"));
    if (!number) {
      const prefixId = orgId;
      const seqKey = `${prefixId}-${deliveryYear}`;
      const nextSeq = (autoSeq.get(seqKey) ?? 9000) + 1;
      autoSeq.set(seqKey, nextSeq);
      // nombre temporal único por batch (se reemplaza por numeración real en commit)
      number = `__AUTO__${seqKey}-${nextSeq}`;
    }

    // Skip si el número ya existe en la BD (solo-nuevos)
    if (!number.startsWith("__AUTO__") && existingNumbers.has(norm(number))) {
      existingSkipped += 1;
      return;
    }

    const item: PlannedItem = {
      varietyId: variety.id,
      geneticProgramId,
      qtyPlants,
      qtyDelivered: int(cell(row, "# entregada", "# Entregada", "Entregada")) ?? 0,
      unitPrice,
      currency,
      deliveryYear,
      deliveryWeek,
      format: str(cell(row, "Formato")),
      materialType: mapMaterial(cell(row, "Tipo de material", "Tipo de Material")),
      notes: str(cell(row, "Comentario")),
    };

    const existing = contractsByNumber.get(number);
    if (existing) {
      existing.items.push(item);
    } else {
      contractsByNumber.set(number, {
        number,
        clientKey,
        organizationId: orgId,
        currency,
        condition: mapCondition(cell(row, "Condición", "Condicion")),
        docType: mapDocType(
          cell(row, "Tipo documento", "Tipo Documento", "Tipo de documento"),
        ),
        saleType: mapSaleType(cell(row, "Tipo de venta")),
        incoterm: str(cell(row, "Incoterm")),
        notes: str(cell(row, "Comentario")),
        anticipo1: num(cell(row, "Anticipo 1")) ?? 0,
        anticipo2: num(cell(row, "Anticipo 2")) ?? 0,
        saldo: num(cell(row, "Saldo")) ?? 0,
        items: [item],
      });
    }
  });

  return {
    contracts: [...contractsByNumber.values()],
    newClients,
    errors,
    existingSkipped,
  };
}

// --------------------------------------------------------------------------
// Dry-run (preview)
// --------------------------------------------------------------------------

export async function importContractsDryRun(rows: ImportRawRow[]): Promise<ImportPreview> {
  if (!(await isCurrentUserAdmin())) throw new Error("Solo administradores pueden importar.");

  const plan = await buildPlan(rows);
  const itemsNew = plan.contracts.reduce((acc, c) => acc + c.items.length, 0);

  return {
    totalRows: rows.length,
    contractsNew: plan.contracts.length,
    contractsExisting: plan.existingSkipped,
    clientsNew: plan.newClients.size,
    itemsNew,
    rowErrors: plan.errors.slice(0, 200),
    newClientNames: [...plan.newClients.values()].map((c) => c.name).slice(0, 100),
    newContractNumbers: plan.contracts
      .map((c) => (c.number.startsWith("__AUTO__") ? "(auto)" : c.number))
      .slice(0, 100),
  };
}

// --------------------------------------------------------------------------
// Commit (escribe en la BD — solo contratos nuevos)
// --------------------------------------------------------------------------

async function generateNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
  organizationId: string,
  year: number,
  prefixCache: Map<string, string>,
  seqCache: Map<string, number>,
): Promise<string> {
  let prefix: string | undefined = prefixCache.get(organizationId);
  if (!prefix) {
    const { data: org } = await supabase
      .from("organizations").select("contract_prefix").eq("id", organizationId).single();
    const resolved: string = org?.contract_prefix ?? "GEN";
    prefix = resolved;
    prefixCache.set(organizationId, resolved);
  }
  const key = `${prefix}-${year}`;
  let seq = seqCache.get(key);
  if (seq == null) {
    const { data: rows } = await supabase
      .from("contracts").select("number")
      .eq("organization_id", organizationId)
      .like("number", `${prefix}-${year}-%`);
    let maxN = 0;
    for (const r of rows ?? []) {
      const n = parseInt(r.number.split("-").pop() ?? "0", 10);
      if (!isNaN(n) && n > maxN) maxN = n;
    }
    seq = maxN;
  }
  seq += 1;
  seqCache.set(key, seq);
  return `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
}

export async function importContractsCommit(rows: ImportRawRow[]): Promise<ImportResult> {
  if (!(await isCurrentUserAdmin())) throw new Error("Solo administradores pueden importar.");

  const supabase = await createClient();
  const plan = await buildPlan(rows);

  // 1) Crear clientes nuevos → mapear key → id
  const clientIdByKey = new Map<string, string>();
  let clientsCreated = 0;
  for (const c of plan.newClients.values()) {
    const { data: created, error } = await supabase
      .from("clients")
      .insert({
        name: c.name,
        tax_id: c.taxId,
        giro: c.giro,
        region: c.region,
        country_id: c.countryId,
        source: "import",
      })
      .select("id")
      .single();
    if (error || !created) {
      plan.errors.push({ row: 0, reason: `No se pudo crear cliente "${c.name}": ${error?.message}` });
      continue;
    }
    clientIdByKey.set(c.key, created.id);
    clientsCreated += 1;
    if (c.contactName || c.contactEmail || c.contactPhone) {
      await supabase.from("client_contacts").insert({
        client_id: created.id,
        name: c.contactName ?? c.name,
        email: c.contactEmail,
        phone: c.contactPhone,
        is_primary: true,
      });
    }
  }

  // 2) Crear contratos + items + payments
  const prefixCache = new Map<string, string>();
  const seqCache = new Map<string, number>();
  let contractsCreated = 0;
  let itemsCreated = 0;

  for (const ct of plan.contracts) {
    const clientId = ct.clientKey.startsWith("id:")
      ? ct.clientKey.slice(3)
      : clientIdByKey.get(ct.clientKey);
    if (!clientId) {
      plan.errors.push({ row: 0, reason: `Contrato ${ct.number}: cliente no resuelto` });
      continue;
    }

    const year = ct.items[0]?.deliveryYear ?? new Date().getFullYear();
    const number = ct.number.startsWith("__AUTO__")
      ? await generateNumber(supabase, ct.organizationId, year, prefixCache, seqCache)
      : ct.number;

    const { data: contract, error: cErr } = await supabase
      .from("contracts")
      .insert({
        number,
        client_id: clientId,
        organization_id: ct.organizationId,
        currency: ct.currency,
        condition: ct.condition,
        doc_type: ct.docType,
        sale_type: ct.saleType,
        incoterm: ct.incoterm,
        notes: ct.notes,
        // Venta spot no pasa por firma: nace directo en ejecución.
        status: ct.docType === "venta_spot" ? "en_proceso" : "borrador",
      })
      .select("id")
      .single();
    if (cErr || !contract) {
      plan.errors.push({ row: 0, reason: `No se pudo crear contrato ${number}: ${cErr?.message}` });
      continue;
    }

    const itemRows = ct.items.map((it) => ({
      contract_id: contract.id,
      variety_id: it.varietyId,
      genetic_program_id: it.geneticProgramId,
      qty_plants: it.qtyPlants,
      qty_delivered: it.qtyDelivered,
      unit_price: it.unitPrice,
      currency: it.currency,
      delivery_year: it.deliveryYear,
      delivery_week: it.deliveryWeek,
      format: it.format,
      material_type: it.materialType,
      notes: it.notes,
    }));
    const { error: itErr } = await supabase.from("contract_items").insert(itemRows);
    if (itErr) {
      plan.errors.push({ row: 0, reason: `Items de ${number}: ${itErr.message}` });
    } else {
      itemsCreated += itemRows.length;
    }

    await supabase.from("payments").insert([
      { contract_id: contract.id, type: "anticipo_1", amount: ct.anticipo1, currency: ct.currency },
      { contract_id: contract.id, type: "anticipo_2", amount: ct.anticipo2, currency: ct.currency },
      { contract_id: contract.id, type: "saldo", amount: ct.saldo, currency: ct.currency },
    ]);

    await recalculateContractTotals(contract.id);
    contractsCreated += 1;
  }

  revalidatePath("/contratos");
  return {
    ok: true,
    contractsCreated,
    clientsCreated,
    itemsCreated,
    errors: plan.errors.slice(0, 200),
  };
}
