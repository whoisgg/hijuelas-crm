"use client";

import * as React from "react";
import {
  Briefcase,
  Building2,
  Calendar,
  CheckSquare,
  FileText,
  LayoutDashboard,
  Mail,
  Map,
  MessageSquare,
  Paperclip,
  Phone,
  Share2,
  Sprout,
  StickyNote,
  Target,
  Trash2,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ActivityTimeline,
  AppLauncher,
  GlobalSearch,
  HighlightsPanel,
  KanbanBoard,
  ListViewToolbar,
  PathStepper,
  QuickActions,
  RecordPageShell,
  RelatedList,
  type ActivityItem,
  type AppItem,
  type KanbanColumn,
  type ListViewColumn,
  type PathStep,
  type SavedView,
  type SearchResult,
} from "@/components/design-system";

// ----- Mock data --------------------------------------------------------

const PATH_STEPS: PathStep[] = [
  { id: "1", label: "Prospección", completed: true },
  { id: "2", label: "Calificación", completed: true },
  { id: "3", label: "Propuesta", current: true, description: "Cargar PDF de cotización para avanzar." },
  { id: "4", label: "Negociación" },
  { id: "5", label: "Ganada" },
];

const ACTIVITY_ITEMS: ActivityItem[] = [
  {
    id: "a1",
    type: "call",
    title: "Llamada con Hortifrut",
    body: "Conversamos sobre necesidades de variedades blueberry 2027.",
    actor: { name: "Juan G." },
    at: new Date(Date.now() - 1000 * 60 * 30),
  },
  {
    id: "a2",
    type: "email",
    title: "Cotización enviada",
    body: "Adjunto PDF con propuesta v2.",
    actor: { name: "María P." },
    at: new Date(Date.now() - 1000 * 60 * 60 * 4),
  },
  {
    id: "a3",
    type: "task",
    title: "Confirmar fechas de entrega Q3",
    done: true,
    actor: { name: "Juan G." },
    at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2),
  },
  {
    id: "a4",
    type: "change",
    title: "Stage avanzado a Propuesta",
    actor: { name: "Sistema" },
    at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3),
  },
  {
    id: "a5",
    type: "note",
    title: "Cliente solicita descuento por volumen",
    body: "Considerar 5% si supera 100k plantas.",
    actor: { name: "Juan G." },
    at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7),
  },
];

type ContratoRow = {
  id: string;
  numero: string;
  total: string;
  estado: string;
};

const CONTRATOS: ContratoRow[] = [
  { id: "c1", numero: "CT-2026-0142", total: "USD 45.200", estado: "Activo" },
  { id: "c2", numero: "CT-2026-0118", total: "USD 12.800", estado: "Cerrado" },
  { id: "c3", numero: "CT-2025-0987", total: "USD 87.500", estado: "Activo" },
];

const SAVED_VIEWS: SavedView[] = [
  { id: "all", name: "Todos los clientes", isDefault: true },
  { id: "mine", name: "Mis clientes" },
  { id: "top10", name: "Top 10 por revenue" },
  { id: "chile", name: "Solo Chile" },
  { id: "inactive", name: "Inactivos" },
];

const COLUMNS: ListViewColumn[] = [
  { key: "cliente", label: "Cliente", visible: true },
  { key: "pais", label: "País", visible: true },
  { key: "tax", label: "Tax ID", visible: true },
  { key: "owner", label: "Owner", visible: false },
  { key: "ultAct", label: "Última actividad", visible: true },
];

const APPS: AppItem[] = [
  { id: "dash", label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { id: "clientes", label: "Clientes", icon: Users, href: "/clientes" },
  { id: "contratos", label: "Contratos", icon: FileText, href: "/contratos" },
  { id: "oport", label: "Oportunidades", icon: Briefcase, href: "/oportunidades" },
  { id: "cal", label: "Calendario", icon: Calendar, href: "/calendario" },
  { id: "mapa", label: "Mapa", icon: Map, href: "/mapa" },
  { id: "catalogo", label: "Catálogo", icon: Sprout, href: "/catalogo" },
  { id: "share", label: "Compartir", icon: Share2, href: "/compartir" },
  { id: "report", label: "Reportes", icon: Target, href: "/reportes" },
];

type OportCard = { id: string; title: string; valor: string; cliente: string };

const KANBAN_INITIAL: KanbanColumn<OportCard>[] = [
  {
    id: "prospeccion",
    title: "Prospección",
    color: "oklch(0.7 0.1 250)",
    items: [
      { id: "o1", title: "Nuevo deal Hortifrut", valor: "USD 80k", cliente: "Hortifrut" },
      { id: "o2", title: "Expansión Ecuablue", valor: "USD 40k", cliente: "Ecuablue" },
    ],
  },
  {
    id: "calif",
    title: "Calificación",
    color: "oklch(0.7 0.1 100)",
    items: [
      { id: "o3", title: "Lote variedad LU-21", valor: "USD 25k", cliente: "Driscoll's" },
    ],
  },
  {
    id: "propuesta",
    title: "Propuesta",
    color: "oklch(0.7 0.15 150)",
    items: [
      { id: "o4", title: "Cierre Q3 Camposol", valor: "USD 120k", cliente: "Camposol" },
    ],
  },
  {
    id: "ganada",
    title: "Ganada",
    color: "oklch(0.65 0.18 145)",
    items: [],
  },
];

// ----- Mock search --------------------------------------------------------

async function mockSearch(query: string): Promise<SearchResult[]> {
  if (query.startsWith(">")) {
    return [
      {
        id: "cmd-new-contract",
        type: "comando",
        title: "Nuevo contrato",
        subtitle: "Crear contrato de venta",
      },
      {
        id: "cmd-new-opp",
        type: "comando",
        title: "Nueva oportunidad",
      },
    ];
  }
  const lower = query.toLowerCase();
  const base: SearchResult[] = [
    { id: "r1", type: "cliente", title: "Hortifrut S.A.", subtitle: "Chile · Tax 76.345.123-2" },
    { id: "r2", type: "cliente", title: "Ecuablue", subtitle: "Ecuador · Tax 1791234567-001" },
    { id: "r3", type: "contrato", title: "CT-2026-0142", subtitle: "Hortifrut · USD 45.200" },
    { id: "r4", type: "oportunidad", title: "Nuevo deal Hortifrut", subtitle: "Stage: Propuesta" },
    { id: "r5", type: "variedad", title: "Variedad LU-21", subtitle: "Programa Lupita" },
  ];
  return base.filter((r) =>
    `${r.title} ${r.subtitle ?? ""}`.toLowerCase().includes(lower),
  );
}

// ----- Page ----------------------------------------------------------------

export default function DesignSystemDemoPage() {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [appsOpen, setAppsOpen] = React.useState(false);
  const [activeView, setActiveView] = React.useState("all");
  const [columns, setColumns] = React.useState<ListViewColumn[]>(COLUMNS);
  const [selected, setSelected] = React.useState(0);
  const [columnsState, setColumnsState] =
    React.useState<KanbanColumn<OportCard>[]>(KANBAN_INITIAL);
  const [activities, setActivities] =
    React.useState<ActivityItem[]>(ACTIVITY_ITEMS);

  const handleColumnsChange = (
    next: { key: string; visible: boolean }[],
  ) => {
    setColumns((prev) =>
      prev.map((c) => {
        const found = next.find((n) => n.key === c.key);
        return found ? { ...c, visible: found.visible } : c;
      }),
    );
  };

  const handleItemMove = (
    itemId: string,
    fromCol: string,
    toCol: string,
  ) => {
    setColumnsState((prev) => {
      const next = prev.map((c) => ({ ...c, items: [...c.items] }));
      const from = next.find((c) => c.id === fromCol);
      const to = next.find((c) => c.id === toCol);
      if (!from || !to) return prev;
      const idx = from.items.findIndex((i) => i.id === itemId);
      if (idx === -1) return prev;
      const [item] = from.items.splice(idx, 1);
      to.items.push(item);
      return next;
    });
  };

  const handleAddActivity: NonNullable<
    React.ComponentProps<typeof ActivityTimeline>["onAdd"]
  > = (type, data) => {
    setActivities((prev) => [
      {
        id: `new-${Date.now()}`,
        type,
        title: data.title,
        body: data.body,
        actor: { name: "Tú" },
        at: new Date(),
      },
      ...prev,
    ]);
  };

  return (
    <AppShell>
      <PageHeader
        title="Design System v1"
        description="Showcase visual de los 10 componentes base del CRM. Solo para desarrollo."
        badge="Dev only"
      />

      <div className="flex flex-col gap-8">
        <DemoSection
          title="1. PathStepper"
          description="Etapas horizontales con estados completado / actual / pendiente."
        >
          <PathStepper
            steps={PATH_STEPS}
            onMarkComplete={(id) =>
              console.log(`Marcar como completado: ${id}`)
            }
            guidance="Para avanzar a Negociación, registra una llamada con el comprador y carga la cotización firmada."
          />
        </DemoSection>

        <DemoSection
          title="2. HighlightsPanel"
          description="Header sticky de Record Pages."
        >
          <HighlightsPanel
            title="Hortifrut S.A."
            subtitle="Cliente · Chile · Tax 76.345.123-2"
            avatar={{ fallback: "H" }}
            badges={[
              { label: "Activo", variant: "success" },
              { label: "VIP", variant: "warning" },
            ]}
            actions={[
              { id: "call", label: "Llamar", icon: Phone, onClick: () => {}, shortcut: "L" },
              { id: "mail", label: "Email", icon: Mail, onClick: () => {}, shortcut: "E" },
              { id: "task", label: "Tarea", icon: CheckSquare, onClick: () => {}, shortcut: "T" },
              { id: "note", label: "Nota", icon: StickyNote, onClick: () => {}, shortcut: "N" },
            ]}
            highlights={[
              { label: "Total contratos", value: "USD 145.500" },
              { label: "Saldo pendiente", value: "USD 23.100", helper: "Vence 30/Jun" },
              { label: "País", value: "Chile" },
              { label: "Owner", value: "Juan G." },
              { label: "Última actividad", value: "Hace 2 días" },
              { label: "Próx. entrega", value: "Sem 32 · 2026" },
            ]}
          />
        </DemoSection>

        <DemoSection
          title="3. ActivityTimeline"
          description="Feed cronológico con filtros y quick-add."
        >
          <div className="max-w-md rounded-lg border bg-card/30 p-3">
            <ActivityTimeline
              items={activities}
              onAdd={handleAddActivity}
              collapsible={false}
            />
          </div>
        </DemoSection>

        <DemoSection
          title="4. RelatedList"
          description="Mini-card colapsable con tabla embebida."
        >
          <div className="max-w-xl space-y-2">
            <RelatedList<ContratoRow>
              title="Contratos activos"
              icon={FileText}
              count={CONTRATOS.length}
              items={CONTRATOS}
              columns={[
                { key: "numero", label: "# Contrato" },
                { key: "total", label: "Total" },
                { key: "estado", label: "Estado" },
              ]}
              onAdd={() => console.log("add contrato")}
              onViewAll={() => console.log("view all")}
            />
            <RelatedList<ContratoRow>
              title="Adjuntos"
              icon={Paperclip}
              count={0}
              items={[]}
              columns={[
                { key: "numero", label: "Nombre" },
                { key: "total", label: "Tamaño" },
              ]}
              emptyState="Aún no hay adjuntos. Sube un archivo para empezar."
              defaultOpen={false}
            />
          </div>
        </DemoSection>

        <DemoSection
          title="5. RecordPageShell"
          description="Layout 70/30 con tabs persistidos en URL."
        >
          <div className="rounded-xl border bg-background p-3">
            <RecordPageShell
              highlights={
                <HighlightsPanel
                  title="CT-2026-0142"
                  subtitle="Contrato · Hortifrut S.A."
                  avatar={{ fallback: "CT" }}
                  badges={[{ label: "Activo", variant: "success" }]}
                  highlights={[
                    { label: "Total neto", value: "USD 45.200" },
                    { label: "Saldo", value: "USD 12.100" },
                    { label: "Inicio", value: "01/Mar/2026" },
                    { label: "Fin", value: "15/Dic/2026" },
                  ]}
                />
              }
              path={<PathStepper steps={PATH_STEPS} />}
              tabs={[
                {
                  id: "detalles",
                  label: "Detalles",
                  content: (
                    <Card>
                      <CardContent className="py-3 text-xs text-muted-foreground">
                        Acá van los campos del contrato con inline editing.
                      </CardContent>
                    </Card>
                  ),
                },
                {
                  id: "relacionados",
                  label: "Relacionados",
                  count: 4,
                  content: (
                    <RelatedList<ContratoRow>
                      title="Items"
                      icon={FileText}
                      count={CONTRATOS.length}
                      items={CONTRATOS}
                      columns={[
                        { key: "numero", label: "Variedad" },
                        { key: "total", label: "Qty" },
                        { key: "estado", label: "Status" },
                      ]}
                    />
                  ),
                },
                {
                  id: "historial",
                  label: "Historial",
                  content: (
                    <Card>
                      <CardContent className="py-3 text-xs text-muted-foreground">
                        Activity log filtrable por usuario/campo.
                      </CardContent>
                    </Card>
                  ),
                },
              ]}
              timeline={
                <ActivityTimeline
                  items={activities.slice(0, 3)}
                  collapsible={false}
                />
              }
            />
          </div>
        </DemoSection>

        <DemoSection
          title="6. ListViewToolbar"
          description="Saved views + filter + columns + group by + bulk actions."
        >
          <div className="space-y-2">
            <ListViewToolbar
              views={SAVED_VIEWS}
              activeViewId={activeView}
              onViewChange={setActiveView}
              onSaveView={(name) => console.log("save view", name)}
              columns={columns}
              onColumnsChange={handleColumnsChange}
              filterCount={2}
              onOpenFilters={() => console.log("open filters")}
              groupByOptions={[
                { key: "pais", label: "País" },
                { key: "owner", label: "Owner" },
              ]}
              onGroupBy={(k) => console.log("group by", k)}
              onExport={() => console.log("export")}
              selectedCount={selected}
              bulkActions={[
                { id: "bulk-edit", label: "Bulk edit", onClick: () => {}, icon: CheckSquare },
                { id: "bulk-mail", label: "Email", onClick: () => {}, icon: Mail },
                { id: "bulk-del", label: "Eliminar", onClick: () => {}, icon: Trash2, destructive: true },
              ]}
              onClearSelection={() => setSelected(0)}
            />
            <div className="flex gap-2 text-xs text-muted-foreground">
              <button
                onClick={() => setSelected((s) => s + 1)}
                className="rounded border px-2 py-1 hover:bg-muted"
              >
                Simular +1 seleccionado
              </button>
              <span>(Estado actual: {selected})</span>
            </div>
          </div>
        </DemoSection>

        <DemoSection
          title="7. GlobalSearch"
          description="Cmd+K palette con resultados agrupados (sólo se abre desde el botón)."
        >
          <button
            onClick={() => setSearchOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-xs text-muted-foreground hover:bg-muted"
          >
            <span>Abrir búsqueda global</span>
            <kbd className="rounded border bg-muted px-1.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>
          <GlobalSearch
            open={searchOpen}
            onOpenChange={setSearchOpen}
            onSearch={mockSearch}
            recentItems={[
              { id: "rec1", type: "cliente", title: "Hortifrut S.A.", subtitle: "Chile" },
              { id: "rec2", type: "contrato", title: "CT-2026-0142" },
            ]}
          />
        </DemoSection>

        <DemoSection
          title="8. AppLauncher"
          description="Modal 9-dot con grid 3×3 de módulos."
        >
          <button
            onClick={() => setAppsOpen(true)}
            className="inline-flex h-9 items-center gap-2 rounded-md border bg-card px-3 text-xs hover:bg-muted"
          >
            <LayoutDashboard className="h-4 w-4" />
            Abrir App Launcher
          </button>
          <AppLauncher
            open={appsOpen}
            onOpenChange={setAppsOpen}
            apps={APPS}
          />
        </DemoSection>

        <DemoSection
          title="9. QuickActions"
          description="Default (con label) y compact (icon-only)."
        >
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Default</p>
              <QuickActions
                actions={[
                  { id: "call", label: "Llamar", icon: Phone, onClick: () => {}, shortcut: "L" },
                  { id: "mail", label: "Email", icon: Mail, onClick: () => {}, shortcut: "E" },
                  { id: "task", label: "Nueva tarea", icon: CheckSquare, onClick: () => {}, shortcut: "T" },
                  { id: "note", label: "Nota", icon: StickyNote, onClick: () => {}, shortcut: "N" },
                ]}
              />
            </div>
            <div>
              <p className="mb-1 text-xs text-muted-foreground">Compact</p>
              <QuickActions
                compact
                actions={[
                  { id: "call", label: "Llamar", icon: Phone, onClick: () => {}, shortcut: "L" },
                  { id: "mail", label: "Email", icon: Mail, onClick: () => {}, shortcut: "E" },
                  { id: "task", label: "Nueva tarea", icon: CheckSquare, onClick: () => {}, shortcut: "T" },
                  { id: "note", label: "Nota", icon: StickyNote, onClick: () => {}, shortcut: "N" },
                  { id: "chat", label: "Comentar", icon: MessageSquare, onClick: () => {}, shortcut: "C" },
                  { id: "client", label: "Ver cliente", icon: Building2, onClick: () => {} },
                ]}
              />
            </div>
          </div>
        </DemoSection>

        <DemoSection
          title="10. KanbanBoard"
          description="Drag & drop entre columnas con @dnd-kit."
        >
          <div className="h-[420px] rounded-lg border bg-background/30 p-2">
            <KanbanBoard<OportCard>
              columns={columnsState}
              onItemMove={handleItemMove}
              renderCard={(item) => (
                <div className="space-y-0.5">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {item.cliente} · {item.valor}
                  </div>
                </div>
              )}
            />
          </div>
        </DemoSection>
      </div>
    </AppShell>
  );
}

// ----- Helpers -------------------------------------------------------------

function DemoSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
