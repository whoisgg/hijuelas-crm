import { Suspense } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { OrganizationsLegalEditor } from "@/components/admin/organizations-legal-editor";
import { ContractPdfBackfill } from "@/components/admin/contract-pdf-backfill";
import { listOrganizationsLegal } from "@/lib/actions/admin-organizations";

export const metadata = { title: "Organizaciones" };
export const dynamic = "force-dynamic";

export default function AdminOrganizationsPage() {
  return (
    <AppShell>
      <PageHeader
        title="Organizaciones"
        description="Datos legales del vendedor por organización (para los contratos de firma)."
      />
      <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
        <Body />
      </Suspense>
    </AppShell>
  );
}

async function Body() {
  const organizations = await listOrganizationsLegal();
  return (
    <div className="flex flex-col gap-6">
      <OrganizationsLegalEditor organizations={organizations} />
      <ContractPdfBackfill />
    </div>
  );
}
