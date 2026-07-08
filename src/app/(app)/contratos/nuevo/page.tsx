import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  listClientsForSelect,
  listOrganizationsForSelect,
  listVarietiesForSelect,
} from "@/lib/actions/contratos";
import { docusignReady } from "@/lib/actions/signatures";
import { ContratoWizard } from "@/components/contratos/contrato-wizard";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export const metadata = { title: "Nueva venta" };

export default async function NuevoContratoPage() {
  const [clients, organizations, varieties, dsReady] = await Promise.all([
    listClientsForSelect(),
    listOrganizationsForSelect(),
    listVarietiesForSelect(),
    docusignReady(),
  ]);

  return (
    <AppShell>
      <PageHeader
        title="Nueva venta"
        description="Wizard de 4 pasos: cliente, organización, items y detalles."
        actions={
          <Button variant="outline" render={<Link href="/contratos" />}>
            <ChevronLeft className="h-4 w-4" />
            Volver a contratos
          </Button>
        }
      />
      <ContratoWizard
        clients={clients}
        organizations={organizations}
        varieties={varieties}
        docusignReady={dsReady}
      />
    </AppShell>
  );
}
