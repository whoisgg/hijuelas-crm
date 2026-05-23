"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  Inbox,
  Plus,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export type RelatedListColumn<T> = {
  key: keyof T;
  label: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
};

export type RelatedListProps<T> = {
  title: string;
  count: number;
  icon?: LucideIcon;
  items: T[];
  columns: RelatedListColumn<T>[];
  onAdd?: () => void;
  onViewAll?: () => void;
  emptyState?: string;
  defaultOpen?: boolean;
  /** Para casos en que `T` no tiene `id`, especifica cómo obtener la key. */
  getRowKey?: (item: T, index: number) => string;
  className?: string;
};

/**
 * Mini-card colapsable con tabla embebida. Pensada para related lists en
 * Record Pages (e.g. contratos del cliente, items de un contrato, etc).
 */
export function RelatedList<T>({
  title,
  count,
  icon: Icon,
  items,
  columns,
  onAdd,
  onViewAll,
  emptyState = "Aún no hay registros.",
  defaultOpen = true,
  getRowKey,
  className,
}: RelatedListProps<T>) {
  const [open, setOpen] = React.useState(defaultOpen);

  const resolveKey = (item: T, idx: number): string => {
    if (getRowKey) return getRowKey(item, idx);
    if (
      item !== null &&
      typeof item === "object" &&
      "id" in item &&
      (typeof (item as { id: unknown }).id === "string" ||
        typeof (item as { id: unknown }).id === "number")
    ) {
      return String((item as { id: string | number }).id);
    }
    return String(idx);
  };

  const renderCell = (item: T, col: RelatedListColumn<T>): React.ReactNode => {
    if (col.render) return col.render(item);
    const raw = item[col.key];
    if (raw === null || raw === undefined) return "—";
    if (
      typeof raw === "string" ||
      typeof raw === "number" ||
      typeof raw === "boolean"
    ) {
      return String(raw);
    }
    return raw as React.ReactNode;
  };

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-xl border bg-card", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/40"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          {open ? (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          )}
          {Icon ? <Icon className="h-4 w-4 text-primary" /> : null}
          <span className="text-sm font-medium">{title}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
            {count}
          </Badge>
        </div>
      </button>

      {open ? (
        <>
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 border-t px-4 py-8 text-center">
              <Inbox className="h-6 w-6 text-muted-foreground/60" />
              <p className="text-xs text-muted-foreground">{emptyState}</p>
            </div>
          ) : (
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    {columns.map((col) => (
                      <TableHead
                        key={String(col.key)}
                        className={cn("h-8 text-xs", col.className)}
                      >
                        {col.label}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item, idx) => (
                    <TableRow key={resolveKey(item, idx)}>
                      {columns.map((col) => (
                        <TableCell
                          key={String(col.key)}
                          className={cn("py-1.5 text-xs", col.className)}
                        >
                          {renderCell(item, col)}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {(onAdd || onViewAll) && (
            <div className="flex items-center justify-between border-t bg-muted/20 px-3 py-1.5">
              {onAdd ? (
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={onAdd}
                  className="text-xs"
                >
                  <Plus className="h-3 w-3" />
                  Agregar
                </Button>
              ) : (
                <span />
              )}
              {onViewAll ? (
                <Button
                  variant="link"
                  size="xs"
                  onClick={onViewAll}
                  className="text-xs"
                >
                  Ver todos
                </Button>
              ) : null}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
