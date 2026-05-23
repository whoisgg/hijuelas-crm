import { Suspense } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  listClients,
  listCountries,
  listOwners,
  listAllClientsForCountryView,
} from "@/lib/actions/clientes";
import { DEFAULT_PAGE_SIZE } from "@/lib/actions/clientes-types";
import { ClientesListView } from "@/components/clientes/clientes-list-view";
import { ClientesByCountryView } from "@/components/clientes/clientes-by-country-view";
import { ClientesListSkeleton } from "@/components/clientes/clientes-skeletons";

export const metadata = { title: "Clientes" };

type SearchParams = Promise<{
  view?: string;
  q?: string;
  country?: string;
  owner?: string;
  active?: string;
  page?: string;
}>;

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const view = sp.view === "list" ? "list" : "country";

  const search = sp.q ?? "";
  const countryId = sp.country ?? "";
  const ownerId = sp.owner ?? "";
  const activeRaw = sp.active;
  const initialIsActive: "all" | "true" | "false" =
    activeRaw === "true" || activeRaw === "false" ? activeRaw : "all";
  const page = Number.parseInt(sp.page ?? "1", 10) || 1;

  return (
    <AppShell>
      <PageHeader
        title="Clientes"
        description={
          view === "country"
            ? "Vista por país. Drill-down a clientes."
            : "Lista plana con filtros avanzados."
        }
      />
      <Suspense fallback={<ClientesListSkeleton />}>
        {view === "country" ? (
          <ClientesCountryBody />
        ) : (
          <ClientesListBody
            search={search}
            countryId={countryId}
            ownerId={ownerId}
            isActive={initialIsActive}
            page={page}
          />
        )}
      </Suspense>
    </AppShell>
  );
}

async function ClientesCountryBody() {
  const rows = await listAllClientsForCountryView();
  return <ClientesByCountryView rows={rows} />;
}

async function ClientesListBody({
  search,
  countryId,
  ownerId,
  isActive,
  page,
}: {
  search: string;
  countryId: string;
  ownerId: string;
  isActive: "all" | "true" | "false";
  page: number;
}) {
  const [{ data, total, page: returnedPage, pageSize }, countries, owners] =
    await Promise.all([
      listClients({
        search,
        countryId: countryId || null,
        ownerId: ownerId || null,
        isActive:
          isActive === "all" ? null : isActive === "true" ? true : false,
        page,
        pageSize: DEFAULT_PAGE_SIZE,
      }),
      listCountries(),
      listOwners(),
    ]);

  return (
    <ClientesListView
      data={data}
      total={total}
      page={returnedPage}
      pageSize={pageSize}
      countries={countries}
      owners={owners}
      initialSearch={search}
      initialCountryId={countryId}
      initialOwnerId={ownerId}
      initialIsActive={isActive}
    />
  );
}
