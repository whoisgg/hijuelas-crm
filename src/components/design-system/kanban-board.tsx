"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type KanbanColumn<T> = {
  id: string;
  title: string;
  color?: string;
  items: T[];
};

export type KanbanBoardProps<T extends { id: string }> = {
  columns: KanbanColumn<T>[];
  renderCard: (item: T) => React.ReactNode;
  onItemMove?: (itemId: string, fromColumn: string, toColumn: string) => void;
  className?: string;
};

type KanbanItemBase = { id: string };

/**
 * Tablero Kanban con drag & drop entre columnas usando @dnd-kit.
 * Pensado para oportunidades por stage, tareas por estado, etc.
 */
export function KanbanBoard<T extends KanbanItemBase>({
  columns,
  renderCard,
  onItemMove,
  className,
}: KanbanBoardProps<T>) {
  const [activeId, setActiveId] = React.useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const itemsByColumn = React.useMemo(() => {
    const map = new Map<string, T[]>();
    columns.forEach((c) => map.set(c.id, c.items));
    return map;
  }, [columns]);

  const findColumnIdOfItem = (itemId: string): string | undefined => {
    for (const col of columns) {
      if (col.items.some((i) => i.id === itemId)) return col.id;
    }
    return undefined;
  };

  const activeItem = React.useMemo(() => {
    if (!activeId) return null;
    for (const col of columns) {
      const found = col.items.find((i) => i.id === activeId);
      if (found) return found;
    }
    return null;
  }, [activeId, columns]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const itemId = String(active.id);
    const overId = String(over.id);
    const fromColumn = findColumnIdOfItem(itemId);
    if (!fromColumn) return;

    // overId may be a column id (when dropping on an empty zone) OR an item id
    let toColumn = columns.find((c) => c.id === overId)?.id;
    if (!toColumn) toColumn = findColumnIdOfItem(overId);
    if (!toColumn) return;

    if (fromColumn === toColumn) return;
    onItemMove?.(itemId, fromColumn, toColumn);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div
        className={cn(
          "flex h-full gap-3 overflow-x-auto pb-2",
          className,
        )}
      >
        {columns.map((col) => (
          <KanbanColumnView
            key={col.id}
            column={col}
            items={itemsByColumn.get(col.id) ?? []}
            renderCard={renderCard}
          />
        ))}
      </div>
      <DragOverlay>
        {activeItem ? (
          <div className="rotate-1 cursor-grabbing rounded-md border bg-card p-2 shadow-lg ring-2 ring-primary/40">
            {renderCard(activeItem)}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function KanbanColumnView<T extends KanbanItemBase>({
  column,
  items,
  renderCard,
}: {
  column: KanbanColumn<T>;
  items: T[];
  renderCard: (item: T) => React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col gap-2 rounded-lg border bg-muted/30 p-2 transition-colors",
        isOver && "bg-primary/5 ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-1 pb-1">
        <div className="flex items-center gap-1.5">
          {column.color ? (
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: column.color }}
              aria-hidden
            />
          ) : null}
          <h3 className="text-xs font-semibold tracking-wide uppercase">
            {column.title}
          </h3>
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px]">
            {items.length}
          </Badge>
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
            Vacío
          </div>
        ) : (
          items.map((item) => (
            <KanbanCard key={item.id} id={item.id}>
              {renderCard(item)}
            </KanbanCard>
          ))
        )}
      </div>
    </div>
  );
}

function KanbanCard({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "group flex cursor-grab gap-1 rounded-md border bg-card p-2 text-xs shadow-sm transition-shadow active:cursor-grabbing",
        "hover:shadow-md",
      )}
    >
      <GripVertical className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
