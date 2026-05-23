import Link from "next/link";
import { notFound } from "next/navigation";

import { HighlightsPanel } from "@/components/design-system/highlights-panel";
import { RecordPageShell } from "@/components/design-system/record-page-shell";
import { PathStepper, type PathStep } from "@/components/design-system/path-stepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ActivitiesTab } from "@/components/oportunidades/activities-tab";
import { DetailsTab } from "@/components/oportunidades/details-tab";
import { HistoryTab } from "@/components/oportunidades/history-tab";
import { ItemsTab } from "@/components/oportunidades/items-tab";
import {
  formatCurrency,
  formatDate,
  initialsOf,
  isOverdue,
} from "@/components/oportunidades/utils";
import { createClient } from "@/lib/supabase/server";
import {
  getOpportunity,
  listAppUsers,
  listOpportunityStages,
  listVarieties,
} from "@/lib/actions/oportunidades";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params;
  const opp = await getOpportunity(id);
  return { title: opp?.name ?? "Oportunidad" };
}

export default async function OpportunityDetailPage({ params }: PageProps) {
  const { id } = await params;

  const [opp, stages, users, varieties, supabase] = await Promise.all([
    getOpportunity(id),
    listOpportunityStages(),
    listAppUsers(),
    listVarieties(),
    createClient(),
  ]);

  if (!opp) {
    notFound();
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const currentStageOrder = opp.stage?.order_index ?? -1;
  const pathSteps: PathStep[] = stages
    .filter((s) => !s.is_lost)
    .map((s) => ({
      id: s.id,
      label: s.name,
      current: s.id === opp.stage_id,
      completed:
        currentStageOrder > s.order_index ||
        Boolean(opp.stage?.is_won && s.is_won === false),
    }));

  const overdue = isOverdue(opp.expected_close_date);
  const clientLabel =
    opp.client?.name ??
    opp.client_name_raw ??
    (opp.client_id ? "Cliente" : "Prospect");

  const badges = [];
  if (opp.stage?.is_won)
    badges.push({ label: "Ganada", variant: "success" as const });
  if (opp.stage?.is_lost)
    badges.push({ label: "Perdida", variant: "destructive" as const });
  if (overdue && !opp.stage?.is_won && !opp.stage?.is_lost)
    badges.push({ label: "Vencida", variant: "warning" as const });

  const highlights = (
    <HighlightsPanel
      title={opp.name}
      subtitle={`${clientLabel} · ${opp.organization?.name ?? "—"}`}
      avatar={{
        fallback: initialsOf(opp.name),
      }}
      badges={badges}
      highlights={[
        {
          label: "Stage",
          value: opp.stage?.name ?? "—",
          helper: `${Math.round(opp.probability_pct)}% probabilidad`,
        },
        {
          label: "Valor estimado",
          value: formatCurrency(opp.estimated_value, opp.currency),
          helper:
            opp.estimated_value_usd !== null
              ? `${formatCurrency(opp.estimated_value_usd, "USD")} USD`
              : undefined,
        },
        {
          label: "Cierre esperado",
          value: formatDate(opp.expected_close_date),
        },
        {
          label: "Owner",
          value: opp.owner?.full_name ?? opp.owner?.email ?? "—",
        },
        {
          label: "Origen",
          value: opp.source ?? "—",
        },
        {
          label: "Items",
          value: String(opp.items.length),
        },
      ]}
    />
  );

  const path = <PathStepper steps={pathSteps} />;

  const isWon = opp.stage?.is_won ?? false;

  return (
    <div className="p-6">
      <PageHeader
        title=""
        description=""
        actions={
          <>
            <Button
              variant="outline"
              render={<Link href="/oportunidades">Volver</Link>}
            />
            {!isWon && !opp.stage?.is_lost ? (
              <Button
                render={
                  <Link href={`/oportunidades/${opp.id}/convertir`}>
                    Convertir a contrato
                  </Link>
                }
              />
            ) : null}
          </>
        }
        className="mb-3"
      />

      <RecordPageShell
        highlights={highlights}
        path={path}
        tabs={[
          {
            id: "detalles",
            label: "Detalles",
            content: <DetailsTab opp={opp} stages={stages} users={users} />,
          },
          {
            id: "items",
            label: "Items tentativos",
            count: opp.items.length,
            content: <ItemsTab opp={opp} varieties={varieties} />,
          },
          {
            id: "actividades",
            label: "Actividades",
            count: opp.activities.length,
            content: (
              <ActivitiesTab
                opp={opp}
                users={users}
                currentUserId={user?.id ?? null}
              />
            ),
          },
          {
            id: "adjuntos",
            label: "Adjuntos",
            content: <AdjuntosPlaceholder />,
          },
          {
            id: "comentarios",
            label: "Comentarios",
            content: <ComentariosPlaceholder />,
          },
          {
            id: "historial",
            label: "Historial",
            count: opp.history.length,
            content: <HistoryTab history={opp.history} />,
          },
        ]}
      />
    </div>
  );
}

function AdjuntosPlaceholder() {
  return (
    <div className="space-y-2 rounded-xl border border-dashed bg-card/40 p-8 text-center">
      <Badge variant="secondary" className="mx-auto">
        Sprint 7
      </Badge>
      <h3 className="text-sm font-medium">Adjuntos</h3>
      <p className="text-xs text-muted-foreground">
        Propuestas, cotizaciones y emails relevantes (Supabase Storage).
      </p>
    </div>
  );
}

function ComentariosPlaceholder() {
  return (
    <div className="space-y-2 rounded-xl border border-dashed bg-card/40 p-8 text-center">
      <Badge variant="secondary" className="mx-auto">
        Sprint 7
      </Badge>
      <h3 className="text-sm font-medium">Comentarios</h3>
      <p className="text-xs text-muted-foreground">
        Threaded comments con menciones a otros usuarios.
      </p>
    </div>
  );
}
