import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  listContracts,
  listOrganizationsForSelect,
} from "@/lib/actions/contratos";
import {
  ContratosListView,
  type ContractListRow,
} from "@/components/contratos/contratos-list-view";
import { ExportAllButton } from "@/components/contratos/export-all-button";
import { ImportContractsButton } from "@/components/contratos/import-contracts-button";
import {
  ContratosByCountryView,
  type CountryContractRow,
  type SpeciesOption,
} from "@/components/contratos/contratos-by-country-view";
import { createClient } from "@/lib/supabase/server";
import { getFxRates } from "@/lib/actions/fx-rates";
import { isCurrentUserAdmin } from "@/lib/actions/admin-users";
import type { Database } from "@/lib/database.types";

export const metadata = { title: "Ventas" };

type ContractStatus = Database["public"]["Enums"]["contract_status"];
type CurrencyCode = Database["public"]["Enums"]["currency_code"];
type ContractCondition = Database["public"]["Enums"]["condition_type"];

type CommercialDocType = Database["public"]["Enums"]["commercial_doc_type"];

type ListedContract = {
  id: string;
  number: string;
  status: ContractStatus;
  condition: ContractCondition | null;
  doc_type: CommercialDocType | null;
  currency: CurrencyCode;
  total_neto: number;
  total_iva: number;
  total_neto_usd: number;
  signed_at: string | null;
  created_at: string;
  client_id: string;
  organization_id: string;
  client: unknown;
  organization: unknown;
  items: unknown;
};

type ItemRel = {
  id: string;
  qty_plants: number | string | null;
  variety?: unknown;
};
type ClientRel = {
  id: string;
  name: string;
  country?: unknown;
};
type CountryRel = { id: string; iso2: string | null; name_es: string };
type OrgRel = { id: string; name: string; contract_prefix: string };
type VarietyRel = {
  id: string;
  name: string;
  species?: unknown;
};
type SpeciesRel = { id: string; name: string };

function pickOne<T>(v: unknown): T | null {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return v as T;
}

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "country";

  const supabase = await createClient();
  const [raw, organizations, speciesResult, fxRates] = await Promise.all([
    listContracts(),
    listOrganizationsForSelect(),
    supabase.from("species").select("id, name").is("deleted_at", null).order("name"),
    getFxRates(),
  ]);

  const species: SpeciesOption[] = (speciesResult.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
  }));

  // Build list-view rows
  const listRows: ContractListRow[] = (raw as unknown as ListedContract[]).map(
    (c) => {
      const client = pickOne<ClientRel>(c.client);
      const org = pickOne<OrgRel>(c.organization);
      const items: ItemRel[] = Array.isArray(c.items) ? (c.items as ItemRel[]) : [];
      const totalPlants = items.reduce(
        (sum, it) => sum + Number(it.qty_plants ?? 0),
        0,
      );
      return {
        id: c.id,
        number: c.number,
        status: c.status,
        docType: c.doc_type ?? "contrato",
        currency: c.currency,
        total_neto_usd: Number(c.total_neto_usd),
        signed_at: c.signed_at,
        created_at: c.created_at,
        client: client ? { id: client.id, name: client.name } : null,
        organization: org
          ? {
              id: org.id,
              name: org.name,
              contract_prefix: org.contract_prefix,
            }
          : null,
        itemsCount: items.length,
        totalPlants,
      };
    },
  );

  // Build country-view rows (richer: country + species per contract)
  const countryRows: CountryContractRow[] = (raw as unknown as ListedContract[]).map(
    (c) => {
      const client = pickOne<ClientRel>(c.client);
      const country = client ? pickOne<CountryRel>(client.country) : null;
      const org = pickOne<OrgRel>(c.organization);
      const items: ItemRel[] = Array.isArray(c.items) ? (c.items as ItemRel[]) : [];
      const totalPlants = items.reduce(
        (sum, it) => sum + Number(it.qty_plants ?? 0),
        0,
      );

      // Extract distinct species names from items
      const speciesSet = new Set<string>();
      for (const it of items) {
        const variety = pickOne<VarietyRel>(it.variety);
        if (!variety) continue;
        const sp = pickOne<SpeciesRel>(variety.species);
        if (sp?.name) speciesSet.add(sp.name);
      }

      return {
        id: c.id,
        number: c.number,
        status: c.status,
        condition: c.condition ?? "venta",
        docType: c.doc_type ?? "contrato",
        signed_at: c.signed_at,
        totalPlants,
        totalUsd: Number(c.total_neto_usd),
        speciesNames: Array.from(speciesSet),
        client: {
          id: client?.id ?? "",
          name: client?.name ?? "—",
          countryId: country?.id ?? null,
          countryIso2: country?.iso2 ?? null,
          countryName: country?.name_es ?? null,
        },
        organization: org ? { id: org.id, name: org.name } : null,
      };
    },
  );

  const isAdmin = await isCurrentUserAdmin();

  return (
    <AppShell>
      <PageHeader
        title="Ventas"
        description={
          view === "country" ? undefined : "Vista de lista plana. Filtros avanzados."
        }
        actions={
          <>
            {isAdmin ? <ImportContractsButton /> : null}
            <ExportAllButton />
          </>
        }
      />
      {view === "country" ? (
        <ContratosByCountryView
          rows={countryRows}
          species={species}
          fxRates={fxRates}
        />
      ) : (
        <ContratosListView rows={listRows} organizations={organizations} />
      )}
    </AppShell>
  );
}
