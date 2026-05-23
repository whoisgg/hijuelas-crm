// Design System v1 — Hijuelas CRM
// Componentes reutilizables inspirados en Salesforce Lightning, construidos
// sobre shadcn/ui + Tailwind v4. Consulta
// `Hijuelas CRM - UI UX Inspiracion Salesforce.md` para el spec completo.

export { PathStepper } from "./path-stepper";
export type { PathStep, PathStepperProps } from "./path-stepper";

export { HighlightsPanel } from "./highlights-panel";
export type {
  Highlight,
  HighlightsBadge,
  HighlightsPanelProps,
  QuickAction as HighlightsQuickAction,
} from "./highlights-panel";

export { ActivityTimeline } from "./activity-timeline";
export type {
  ActivityItem,
  ActivityTimelineProps,
  ActivityType,
} from "./activity-timeline";

export { RelatedList } from "./related-list";
export type { RelatedListColumn, RelatedListProps } from "./related-list";

export { RecordPageShell } from "./record-page-shell";
export type { RecordPageShellProps, RecordPageTab } from "./record-page-shell";

export { ListViewToolbar } from "./list-view-toolbar";
export type {
  BulkAction,
  GroupByOption,
  ListViewColumn,
  ListViewToolbarProps,
  SavedView,
} from "./list-view-toolbar";

export { GlobalSearch } from "./global-search";
export type {
  GlobalSearchProps,
  SearchResult,
  SearchResultType,
} from "./global-search";

export { AppLauncher } from "./app-launcher";
export type { AppItem, AppLauncherProps } from "./app-launcher";

export { QuickActions } from "./quick-actions";
export type { QuickAction, QuickActionsProps } from "./quick-actions";

export { KanbanBoard } from "./kanban-board";
export type { KanbanBoardProps, KanbanColumn } from "./kanban-board";
