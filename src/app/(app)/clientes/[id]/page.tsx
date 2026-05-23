import { notFound } from "next/navigation";

import { AppShell } from "@/components/layout/app-shell";
import { getClient, listCountries } from "@/lib/actions/clientes";
import { ClienteDetailView } from "@/components/clientes/cliente-detail-view";

type RouteParams = Promise<{ id: string }>;

export async function generateMetadata({
  params,
}: {
  params: RouteParams;
}) {
  const { id } = await params;
  const detail = await getClient(id);
  return {
    title: detail?.client.name ?? "Cliente",
  };
}

export default async function ClienteDetailPage({
  params,
}: {
  params: RouteParams;
}) {
  const { id } = await params;
  const [detail, countries] = await Promise.all([
    getClient(id),
    listCountries(),
  ]);

  if (!detail) notFound();

  return (
    <AppShell>
      <ClienteDetailView detail={detail} countries={countries} />
    </AppShell>
  );
}
