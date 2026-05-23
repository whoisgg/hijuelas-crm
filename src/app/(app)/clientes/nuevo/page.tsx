import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { listCountries } from "@/lib/actions/clientes";
import { NuevoClienteForm } from "@/components/clientes/nuevo-cliente-form";

export const metadata = { title: "Nuevo cliente" };

type SearchParams = Promise<{ error?: string; field?: string }>;

export default async function NuevoClientePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const countries = await listCountries();
  return (
    <AppShell>
      <PageHeader
        title="Nuevo cliente"
        description="Creá un cliente para empezar a registrar contratos y oportunidades."
      />
      <NuevoClienteForm
        countries={countries}
        initialError={sp.error}
        initialErrorField={sp.field}
      />
    </AppShell>
  );
}
