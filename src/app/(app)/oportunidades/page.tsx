import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { KanbanBoard } from "@/components/oportunidades/kanban-board";
import { OpportunityListView } from "@/components/oportunidades/list-view";
import { ViewToggle } from "@/components/oportunidades/view-toggle";
import {
  listAppUsers,
  listOpportunities,
} from "@/lib/actions/oportunidades";

export const metadata = { title: "Oportunidades" };

type PageProps = {
  searchParams: Promise<{ view?: string }>;
};

export default async function OportunidadesPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const view: "kanban" | "list" = params.view === "list" ? "list" : "kanban";

  const [result, users] = await Promise.all([
    listOpportunities({ view }),
    listAppUsers(),
  ]);

  return (
    <div className="p-6">
      <PageHeader
        title="Oportunidades"
        description="Pipeline comercial pre-contrato — drag & drop, actividades, conversión a contrato."
        actions={
          <>
            <ViewToggle view={view} />
            <Button render={<Link href="/oportunidades/nueva" />}>
              <Plus className="h-3.5 w-3.5" />
              Nueva oportunidad
            </Button>
          </>
        }
      />

      {view === "kanban" && result.view === "kanban" ? (
        <KanbanBoard stages={result.stages} byStage={result.byStage} />
      ) : null}

      {view === "list" && result.view === "list" ? (
        <OpportunityListView
          rows={result.rows}
          stages={result.stages}
          users={users}
        />
      ) : null}
    </div>
  );
}
