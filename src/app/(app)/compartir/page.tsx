import { Suspense } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ShareClientTab } from "@/components/compartir/share-client-tab";
import { listClientShareLinks, listClientsForPicker } from "@/lib/actions/client-shares";

export const metadata = { title: "Compartir" };
export const dynamic = "force-dynamic";

function resolveSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

// La conexión MCP ("Conectar con Claude") vive en Administración → Datos
// maestros: es de plataforma, no solo del CRM. Acá queda lo comercial:
// compartir fichas de cliente con un link público.
export default function CompartirPage() {
  return (
    <AppShell>
      <PageHeader
        title="Compartir"
        description="Comparte fichas de cliente con un link público tokenizado."
      />
      <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
        <CompartirBody />
      </Suspense>
    </AppShell>
  );
}

async function CompartirBody() {
  const [shareLinks, clients] = await Promise.all([
    listClientShareLinks(),
    listClientsForPicker(),
  ]);

  return (
    <div className="space-y-6">
      <ShareClientTab
        shareLinks={shareLinks}
        clients={clients}
        siteUrl={resolveSiteUrl()}
      />
    </div>
  );
}
