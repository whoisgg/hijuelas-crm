"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useRouter } from "next/navigation";
import { AlertCircle, Calendar, GripVertical, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteOpportunity,
  markOpportunityLost,
  transitionOpportunityStage,
  type OpportunityStage,
  type OpportunityWithRelations,
} from "@/lib/actions/oportunidades";

import { LostReasonDialog } from "./lost-reason-dialog";
import {
  formatCurrency,
  formatDate,
  initialsOf,
  isOverdue,
} from "./utils";
import { ConvertConfirmDialog } from "./convert-confirm-dialog";

export type KanbanBoardProps = {
  stages: OpportunityStage[];
  byStage: Record<string, OpportunityWithRelations[]>;
};

export function KanbanBoard({ stages, byStage }: KanbanBoardProps) {
  const router = useRouter();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  // Optimistic overrides keyed by oppId → target stageId. Cleared whenever
  // server data refreshes (byStage prop changes) via the prev-prop pattern.
  const [overrides, setOverrides] = React.useState<Map<string, string>>(
    () => new Map(),
  );
  const [prevByStage, setPrevByStage] = React.useState(byStage);
  if (prevByStage !== byStage) {
    setPrevByStage(byStage);
    setOverrides(new Map());
  }

  const columns = React.useMemo(() => {
    if (overrides.size === 0) return byStage;
    const out: Record<string, OpportunityWithRelations[]> = {};
    for (const stageId of Object.keys(byStage)) out[stageId] = [];
    const stageById = new Map(stages.map((s) => [s.id, s]));
    for (const stageId of Object.keys(byStage)) {
      for (const opp of byStage[stageId]) {
        const target = overrides.get(opp.id) ?? opp.stage_id;
        const targetStage = stageById.get(target);
        const updated = targetStage
          ? {
              ...opp,
              stage_id: target,
              stage: targetStage,
              probability_pct:
                target === opp.stage_id
                  ? opp.probability_pct
                  : targetStage.probability_default,
            }
          : opp;
        if (!out[target]) out[target] = [];
        out[target].push(updated);
      }
    }
    return out;
  }, [byStage, overrides, stages]);

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [lostDialog, setLostDialog] = React.useState<{
    oppId: string;
    oppName: string;
  } | null>(null);
  const [convertDialog, setConvertDialog] = React.useState<{
    oppId: string;
    oppName: string;
  } | null>(null);
  const [deleteDialog, setDeleteDialog] = React.useState<{
    oppId: string;
    oppName: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  const findOpp = (id: string): OpportunityWithRelations | null => {
    for (const stageId of Object.keys(columns)) {
      const found = columns[stageId].find((o) => o.id === id);
      if (found) return found;
    }
    return null;
  };

  const activeOpp = activeId ? findOpp(activeId) : null;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(String(e.active.id));
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const oppId = String(active.id);
    const toStageId = String(over.id);

    const opp = findOpp(oppId);
    if (!opp) return;
    if (opp.stage_id === toStageId) return;

    const targetStage = stages.find((s) => s.id === toStageId);
    if (!targetStage) return;

    if (targetStage.is_lost) {
      setLostDialog({ oppId, oppName: opp.name });
      return;
    }
    if (targetStage.is_won) {
      setConvertDialog({ oppId, oppName: opp.name });
      return;
    }

    // Optimistic override
    setOverrides((prev) => {
      const next = new Map(prev);
      next.set(oppId, toStageId);
      return next;
    });

    startTransition(async () => {
      try {
        await transitionOpportunityStage(oppId, toStageId);
        toast.success(`Movido a ${targetStage.name}`);
        router.refresh();
      } catch (err) {
        setOverrides((prev) => {
          const next = new Map(prev);
          next.delete(oppId);
          return next;
        });
        toast.error(
          err instanceof Error ? err.message : "Error al mover la oportunidad",
        );
      }
    });
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div
          className={cn(
            "flex gap-3 overflow-x-auto pb-2",
            isPending && "opacity-95",
          )}
        >
          {stages.map((stage) => (
            <KanbanColumn
              key={stage.id}
              stage={stage}
              items={columns[stage.id] ?? []}
              onEdit={(opp) => router.push(`/oportunidades/${opp.id}`)}
              onDelete={(opp) =>
                setDeleteDialog({ oppId: opp.id, oppName: opp.name })
              }
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeOpp ? (
            <div className="w-72 rotate-1">
              <KanbanCard opp={activeOpp} dragging />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {lostDialog ? (
        <LostReasonDialog
          open
          oppName={lostDialog.oppName}
          onClose={() => setLostDialog(null)}
          onConfirm={async (reason) => {
            try {
              await markOpportunityLost(lostDialog.oppId, reason);
              toast.success("Oportunidad marcada como perdida");
              setLostDialog(null);
              router.refresh();
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Error al marcar perdida",
              );
            }
          }}
        />
      ) : null}

      {convertDialog ? (
        <ConvertConfirmDialog
          open
          oppName={convertDialog.oppName}
          onClose={() => setConvertDialog(null)}
          onConfirm={() =>
            router.push(`/oportunidades/${convertDialog.oppId}/convertir`)
          }
        />
      ) : null}

      {deleteDialog ? (
        <Dialog
          open
          onOpenChange={(o) => (o ? null : setDeleteDialog(null))}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Eliminar oportunidad</DialogTitle>
              <DialogDescription>
                Se eliminará &quot;{deleteDialog.oppName}&quot;. La acción es
                reversible solo via base de datos.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialog(null)}
                disabled={isDeleting}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                disabled={isDeleting}
                onClick={async () => {
                  setIsDeleting(true);
                  try {
                    await deleteOpportunity(deleteDialog.oppId);
                    toast.success("Oportunidad eliminada");
                    setDeleteDialog(null);
                    router.refresh();
                  } catch (err) {
                    toast.error(
                      err instanceof Error
                        ? err.message
                        : "Error al eliminar",
                    );
                  } finally {
                    setIsDeleting(false);
                  }
                }}
              >
                {isDeleting ? "Eliminando…" : "Eliminar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}

function KanbanColumn({
  stage,
  items,
  onEdit,
  onDelete,
}: {
  stage: OpportunityStage;
  items: OpportunityWithRelations[];
  onEdit: (opp: OpportunityWithRelations) => void;
  onDelete: (opp: OpportunityWithRelations) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: stage.id });
  const totalValue = items.reduce(
    (acc, i) => acc + (i.estimated_value_usd ?? 0),
    0,
  );

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-xl border bg-card/40 transition-colors",
        isOver && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: stage.color ?? "#94a3b8" }}
            aria-hidden
          />
          <span className="text-sm font-medium">{stage.name}</span>
          <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">
            {items.length}
          </Badge>
        </div>
        <span className="text-[10px] text-muted-foreground">
          {formatCurrency(totalValue, "USD")}
        </span>
      </div>

      <div className="flex max-h-[calc(100vh-16rem)] flex-col gap-2 overflow-y-auto p-2">
        {items.length === 0 ? (
          <div className="rounded-md border border-dashed py-6 text-center text-[11px] text-muted-foreground">
            Sin oportunidades
          </div>
        ) : (
          items.map((opp) => (
            <DraggableCard
              key={opp.id}
              opp={opp}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  opp,
  onEdit,
  onDelete,
}: {
  opp: OpportunityWithRelations;
  onEdit: (opp: OpportunityWithRelations) => void;
  onDelete: (opp: OpportunityWithRelations) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: opp.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn("touch-none", isDragging && "opacity-30")}
    >
      <KanbanCard opp={opp} onEdit={onEdit} onDelete={onDelete} />
    </div>
  );
}

export function KanbanCard({
  opp,
  dragging,
  onEdit,
  onDelete,
}: {
  opp: OpportunityWithRelations;
  dragging?: boolean;
  onEdit?: (opp: OpportunityWithRelations) => void;
  onDelete?: (opp: OpportunityWithRelations) => void;
}) {
  const overdue = isOverdue(opp.expected_close_date);
  const clientLabel =
    opp.client?.name ??
    opp.client_name_raw ??
    (opp.client_id ? "Cliente" : "Prospect");

  return (
    <a
      href={`/oportunidades/${opp.id}`}
      onClick={(e) => {
        if (dragging) e.preventDefault();
      }}
      className={cn(
        "group relative flex cursor-grab flex-col gap-1.5 rounded-md border bg-card p-2.5 text-xs transition-colors hover:border-primary/40 hover:bg-muted/40 active:cursor-grabbing",
        dragging && "shadow-lg",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-0.5">
          <div className="truncate text-sm font-medium leading-tight">
            {opp.name}
          </div>
          <div className="truncate text-[11px] text-muted-foreground">
            {clientLabel}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {onEdit ? (
            <button
              type="button"
              aria-label="Editar oportunidad"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit(opp);
              }}
              className="rounded p-0.5 text-muted-foreground/70 hover:bg-muted hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              aria-label="Eliminar oportunidad"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete(opp);
              }}
              className="rounded p-0.5 text-muted-foreground/70 hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          ) : null}
          <GripVertical className="h-3 w-3 text-muted-foreground/50" />
        </div>
      </div>

      <div className="flex items-center justify-between gap-1">
        <span className="font-medium">
          {formatCurrency(opp.estimated_value, opp.currency)}
        </span>
        <Badge
          variant="secondary"
          className="h-4 px-1.5 text-[10px] font-medium"
        >
          {Math.round(opp.probability_pct)}%
        </Badge>
      </div>

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>{formatDate(opp.expected_close_date)}</span>
          {overdue ? (
            <Badge
              variant="destructive"
              className="ml-1 h-4 px-1 text-[9px]"
            >
              <AlertCircle className="h-2.5 w-2.5" />
              vencida
            </Badge>
          ) : null}
        </div>
        <Avatar
          size="sm"
          className="size-5"
          aria-label={opp.owner?.full_name ?? "Sin owner"}
        >
          {opp.owner?.avatar_url ? (
            <AvatarImage
              src={opp.owner.avatar_url}
              alt={opp.owner.full_name ?? ""}
            />
          ) : null}
          <AvatarFallback className="text-[9px]">
            {initialsOf(opp.owner?.full_name ?? opp.owner?.email ?? "")}
          </AvatarFallback>
        </Avatar>
      </div>
    </a>
  );
}
