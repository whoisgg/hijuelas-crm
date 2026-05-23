"use client";

import * as React from "react";
import {
  ChevronDown,
  Columns3,
  Download,
  Filter,
  Group,
  MoreHorizontal,
  Plus,
  Star,
  X,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type SavedView = {
  id: string;
  name: string;
  isDefault?: boolean;
};

export type ListViewColumn = { key: string; label: string; visible: boolean };

export type GroupByOption = { key: string; label: string };

export type BulkAction = {
  id: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  destructive?: boolean;
};

export type ListViewToolbarProps = {
  views: SavedView[];
  activeViewId: string;
  onViewChange: (id: string) => void;
  onSaveView?: (name: string) => void;
  columns: ListViewColumn[];
  onColumnsChange: (cols: { key: string; visible: boolean }[]) => void;
  filterCount: number;
  onOpenFilters: () => void;
  onGroupBy?: (key: string | null) => void;
  groupByOptions?: GroupByOption[];
  activeGroupBy?: string | null;
  onExport?: () => void;
  selectedCount?: number;
  bulkActions?: BulkAction[];
  onClearSelection?: () => void;
  className?: string;
};

const PINNED_LIMIT = 4;

/**
 * Toolbar de List Views (Salesforce-style): tabs de vistas guardadas + botones
 * de Filters / Columns / Group by / Export, con barra de bulk actions cuando
 * hay filas seleccionadas.
 */
export function ListViewToolbar({
  views,
  activeViewId,
  onViewChange,
  onSaveView,
  columns,
  onColumnsChange,
  filterCount,
  onOpenFilters,
  onGroupBy,
  groupByOptions,
  activeGroupBy,
  onExport,
  selectedCount = 0,
  bulkActions,
  onClearSelection,
  className,
}: ListViewToolbarProps) {
  const [newViewName, setNewViewName] = React.useState("");

  const pinned = views.slice(0, PINNED_LIMIT);
  const rest = views.slice(PINNED_LIMIT);

  const toggleColumn = (key: string, visible: boolean) => {
    onColumnsChange(
      columns.map((c) => (c.key === key ? { ...c, visible } : c)),
    );
  };

  const activeGroup = groupByOptions?.find((g) => g.key === activeGroupBy);

  return (
    <div className={cn("flex flex-col gap-2 border-b pb-2", className)}>
      <div className="flex flex-wrap items-center gap-1">
        {pinned.map((v) => (
          <ViewTab
            key={v.id}
            view={v}
            active={v.id === activeViewId}
            onClick={() => onViewChange(v.id)}
          />
        ))}
        {rest.length > 0 ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm">
                  Más vistas
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              {rest.map((v) => (
                <DropdownMenuItem
                  key={v.id}
                  onClick={() => onViewChange(v.id)}
                >
                  {v.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {onSaveView ? (
          <Popover>
            <PopoverTrigger
              render={
                <Button variant="ghost" size="sm">
                  <Plus className="h-3.5 w-3.5" />
                  Nueva vista
                </Button>
              }
            />
            <PopoverContent align="start" className="w-64">
              <div className="space-y-2">
                <p className="text-xs font-medium">Nombre de la vista</p>
                <Input
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  placeholder="Mis clientes Q3"
                  className="h-8 text-sm"
                />
                <Button
                  size="xs"
                  className="w-full"
                  disabled={!newViewName.trim()}
                  onClick={() => {
                    onSaveView(newViewName.trim());
                    setNewViewName("");
                  }}
                >
                  Guardar
                </Button>
              </div>
            </PopoverContent>
          </Popover>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button variant="outline" size="sm" onClick={onOpenFilters}>
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {filterCount > 0 ? (
            <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
              {filterCount}
            </Badge>
          ) : null}
        </Button>

        <Popover>
          <PopoverTrigger
            render={
              <Button variant="outline" size="sm">
                <Columns3 className="h-3.5 w-3.5" />
                Columnas
              </Button>
            }
          />
          <PopoverContent align="start" className="w-56">
            <p className="px-1 text-xs font-medium text-muted-foreground">
              Columnas visibles
            </p>
            <div className="max-h-64 space-y-1 overflow-y-auto pt-1">
              {columns.map((col) => (
                <label
                  key={col.key}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={col.visible}
                    onChange={(e) => toggleColumn(col.key, e.target.checked)}
                    className="size-3.5 accent-primary"
                  />
                  <span>{col.label}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        {onGroupBy && groupByOptions ? (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="sm">
                  <Group className="h-3.5 w-3.5" />
                  {activeGroup ? `Agrupado: ${activeGroup.label}` : "Agrupar"}
                </Button>
              }
            />
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>Agrupar por</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {groupByOptions.map((opt) => (
                <DropdownMenuItem
                  key={opt.key}
                  onClick={() => onGroupBy(opt.key)}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
              {activeGroupBy ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onGroupBy(null)}>
                    Quitar agrupación
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}

        {onExport ? (
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="h-3.5 w-3.5" />
            Exportar
          </Button>
        ) : null}
      </div>

      {selectedCount > 0 ? (
        <BulkActionBar
          selectedCount={selectedCount}
          bulkActions={bulkActions}
          onClearSelection={onClearSelection}
        />
      ) : null}
    </div>
  );
}

function BulkActionBar({
  selectedCount,
  bulkActions,
  onClearSelection,
}: Pick<ListViewToolbarProps, "bulkActions" | "onClearSelection"> & {
  selectedCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-1.5">
      <span className="text-xs font-medium text-primary">
        {selectedCount} seleccionado{selectedCount === 1 ? "" : "s"}
      </span>
      <div className="flex flex-1 flex-wrap items-center gap-1">
        {bulkActions?.map((action) => {
          const Icon = action.icon ?? MoreHorizontal;
          return (
            <Button
              key={action.id}
              variant={action.destructive ? "destructive" : "ghost"}
              size="xs"
              onClick={action.onClick}
            >
              <Icon className="h-3 w-3" />
              {action.label}
            </Button>
          );
        })}
      </div>
      {onClearSelection ? (
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={onClearSelection}
          aria-label="Limpiar selección"
        >
          <X className="h-3 w-3" />
        </Button>
      ) : null}
    </div>
  );
}

function ViewTab({ view, active, onClick }: { view: SavedView; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md border px-2.5 text-xs font-medium transition-colors",
        active
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-transparent text-muted-foreground hover:bg-muted",
      )}
    >
      {view.isDefault ? <Star className="h-3 w-3 fill-current opacity-70" /> : null}
      {view.name}
    </button>
  );
}
