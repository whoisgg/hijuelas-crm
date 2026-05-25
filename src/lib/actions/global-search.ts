"use server";

import { createClient } from "@/lib/supabase/server";

export type SearchHit = {
  id: string;
  label: string;
  sublabel?: string;
  href: string;
};

export type GlobalSearchResults = {
  clientes: SearchHit[];
  contratos: SearchHit[];
  oportunidades: SearchHit[];
  variedades: SearchHit[];
};

const EMPTY: GlobalSearchResults = {
  clientes: [],
  contratos: [],
  oportunidades: [],
  variedades: [],
};

const LIMIT_PER_GROUP = 5;

export async function globalSearch(rawQuery: string): Promise<GlobalSearchResults> {
  const q = rawQuery.trim();
  if (q.length < 2) return EMPTY;

  const pattern = `%${q.replace(/[%_]/g, (m) => `\\${m}`)}%`;
  const supabase = await createClient();

  const [clientesRes, contratosRes, oppsRes, variedadesRes] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name")
      .ilike("name", pattern)
      .is("deleted_at", null)
      .order("name")
      .limit(LIMIT_PER_GROUP),
    supabase
      .from("contracts")
      .select("id, number, status, client_id")
      .ilike("number", pattern)
      .is("deleted_at", null)
      .order("number")
      .limit(LIMIT_PER_GROUP),
    supabase
      .from("opportunities")
      .select("id, name, stage")
      .ilike("name", pattern)
      .is("deleted_at", null)
      .order("name")
      .limit(LIMIT_PER_GROUP),
    supabase
      .from("varieties")
      .select("id, name")
      .ilike("name", pattern)
      .is("deleted_at", null)
      .order("name")
      .limit(LIMIT_PER_GROUP),
  ]);

  type ClienteRow = { id: string; name: string };
  type ContratoRow = {
    id: string;
    number: string;
    status: string | null;
    client_id: string | null;
  };
  type OppRow = { id: string; name: string; stage: string | null };
  type VariedadRow = { id: string; name: string };

  return {
    clientes: ((clientesRes.data ?? []) as ClienteRow[]).map((c) => ({
      id: c.id,
      label: c.name,
      href: `/clientes/${c.id}`,
    })),
    contratos: ((contratosRes.data ?? []) as ContratoRow[]).map((c) => ({
      id: c.id,
      label: c.number,
      sublabel: c.status ?? undefined,
      href: `/contratos/${c.id}`,
    })),
    oportunidades: ((oppsRes.data ?? []) as OppRow[]).map((o) => ({
      id: o.id,
      label: o.name,
      sublabel: o.stage ?? undefined,
      href: `/oportunidades/${o.id}`,
    })),
    variedades: ((variedadesRes.data ?? []) as VariedadRow[]).map((v) => ({
      id: v.id,
      label: v.name,
      href: `/catalogo?variety=${v.id}`,
    })),
  };
}
