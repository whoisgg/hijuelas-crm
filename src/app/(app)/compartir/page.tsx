import { Suspense } from "react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { CompartirContent } from "@/components/compartir/compartir-content";
import { listMcpTokens } from "@/lib/actions/mcp-tokens";
import { listClientShareLinks, listClientsForPicker } from "@/lib/actions/client-shares";

export const metadata = { title: "Compartir" };
export const dynamic = "force-dynamic";

function resolveSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    "http://localhost:3000"
  );
}

export default function CompartirPage() {
  return (
    <AppShell>
      <PageHeader
        title="Compartir"
        description="Conecta Claude al CRM vía MCP o comparte fichas de cliente con un link público."
      />
      <Suspense fallback={<Skeleton className="h-[400px] w-full" />}>
        <CompartirBody />
      </Suspense>
    </AppShell>
  );
}

async function CompartirBody() {
  const [tokens, shareLinks, clients] = await Promise.all([
    listMcpTokens(),
    listClientShareLinks(),
    listClientsForPicker(),
  ]);

  return (
    <CompartirContent
      tokens={tokens}
      shareLinks={shareLinks}
      clients={clients}
      siteUrl={resolveSiteUrl()}
    />
  );
}
