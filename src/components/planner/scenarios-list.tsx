"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { FlaskConical, GripVertical, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createScenario,
  deleteScenario,
  updateScenarioStatus,
} from "@/lib/actions/planner-scenarios";

/**
 * Kanban de escenarios — misma lógica que el tablero de oportunidades del
 * CRM: columnas por estado, cards arrastrables con override optimista.
 */

export type ScenarioRow = {
  id: number;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  created_by_name: string | null;
  lots_count: number;
};

const COLUMNS = [
  { key: "borrador", label: "Borrador" },
  { key: "evaluacion", label: "En evaluación" },
  { key: "aprobado", label: "Aprobado" },
  { key: "descartado", label: "Descartado" },
] as const;

export function ScenariosList({ scenarios }: { scenarios: ScenarioRow[] }) {
  const router = useRouter();
  const [creating, setCreating] = React.useState(false);
  const [activeId, setActiveId] = React.useState<number | null>(null);
  // Overrides optimistas id → estado; se limpian cuando llega data fresca
  // (patrón "derive state from previous render" de React).
  const [overrides, setOverrides] = React.useState<Record<number, string>>({});
  const [prevScenarios, setPrevScenarios] = React.useState(scenarios);
  if (prevScenarios !== scenarios) {
    setPrevScenarios(scenarios);
    if (Object.keys(overrides).length) setOverrides({});
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const statusOf = (s: ScenarioRow) => overrides[s.id] ?? s.status;

  const handleDragStart = (e: DragStartEvent) => {
    setActiveId(Number(e.active.id));
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const scenarioId = Number(e.active.id);
    const target = e.over?.id ? String(e.over.id) : null;
    if (!target) return;
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario || statusOf(scenario) === target) return;

    setOverrides((prev) => ({ ...prev, [scenarioId]: target }));
    const res = await updateScenarioStatus(scenarioId, target);
    if (res.ok) {
      router.refresh();
    } else {
      setOverrides((prev) => {
        const next = { ...prev };
        delete next[scenarioId];
        return next;
      });
      toast.error(res.error ?? "No se pudo mover.");
    }
  };

  const remove = async (s: ScenarioRow) => {
    if (!window.confirm(`¿Eliminar el escenario "${s.name}"?`)) return;
    const res = await deleteScenario(s.id);
    if (res.ok) {
      toast.success("Escenario eliminado.");
      router.refresh();
    } else {
      toast.error(res.error ?? "No se pudo eliminar.");
    }
  };

  const active = activeId ? scenarios.find((s) => s.id === activeId) : null;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-4 w-4" /> Nuevo escenario
        </Button>
      </div>

      <DndContext
        id="scenarios-kanban"
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-3 md:grid-cols-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.key}
              id={col.key}
              label={col.label}
              scenarios={scenarios.filter((s) => statusOf(s) === col.key)}
              onDelete={remove}
            />
          ))}
        </div>
        <DragOverlay dropAnimation={null}>
          {active ? <ScenarioCard scenario={active} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {creating ? <CreateScenarioDialog onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

function KanbanColumn({
  id,
  label,
  scenarios,
  onDelete,
}: {
  id: string;
  label: string;
  scenarios: ScenarioRow[];
  onDelete: (s: ScenarioRow) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-40 flex-col gap-2 rounded-lg border bg-muted/30 p-2 transition-colors",
        isOver && "border-primary/50 bg-primary/5",
      )}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {scenarios.length}
        </span>
      </div>
      {scenarios.map((s) => (
        <DraggableCard key={s.id} scenario={s} onDelete={onDelete} />
      ))}
    </div>
  );
}

function DraggableCard({
  scenario,
  onDelete,
}: {
  scenario: ScenarioRow;
  onDelete: (s: ScenarioRow) => void;
}) {
  const { setNodeRef, attributes, listeners, isDragging } = useDraggable({
    id: scenario.id,
  });
  return (
    <div ref={setNodeRef} className={cn(isDragging && "opacity-40")}>
      <ScenarioCard
        scenario={scenario}
        onDelete={onDelete}
        dragHandle={
          <button
            type="button"
            {...attributes}
            {...listeners}
            aria-label="Arrastrar"
            className="cursor-grab touch-none rounded p-0.5 text-muted-foreground/60 hover:bg-muted"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        }
      />
    </div>
  );
}

function ScenarioCard({
  scenario,
  onDelete,
  dragHandle,
  dragging,
}: {
  scenario: ScenarioRow;
  onDelete?: (s: ScenarioRow) => void;
  dragHandle?: React.ReactNode;
  dragging?: boolean;
}) {
  return (
    <div
      className={cn(
        "group rounded-md border bg-card p-2.5 text-sm shadow-sm",
        dragging && "rotate-2 shadow-lg",
      )}
    >
      <div className="flex items-start gap-1">
        {dragHandle}
        <Link
          href={`/planner/simulador/${scenario.id}`}
          className="flex-1 font-medium leading-tight hover:text-primary"
        >
          <FlaskConical className="mr-1 inline h-3.5 w-3.5 text-primary" />
          {scenario.name}
        </Link>
        {onDelete ? (
          <button
            type="button"
            aria-label="Eliminar"
            onClick={() => onDelete(scenario)}
            className="rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {scenario.description ? (
        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
          {scenario.description}
        </p>
      ) : null}
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {scenario.lots_count.toLocaleString("es-CL")} lotes ·{" "}
        {new Date(scenario.created_at).toLocaleDateString("es-CL", {
          day: "2-digit",
          month: "short",
        })}
        {scenario.created_by_name ? ` · ${scenario.created_by_name}` : ""}
      </p>
    </div>
  );
}

function CreateScenarioDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = await createScenario(name, description.trim() || null);
      if (res.ok && res.id) {
        toast.success("Escenario creado con la copia del plan vigente.");
        onClose();
        router.push(`/planner/simulador/${res.id}`);
      } else {
        toast.error(res.error ?? "No se pudo crear.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo escenario</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sc-name">Nombre</Label>
            <Input
              id="sc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: TunelTek atrasado a agosto"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sc-desc">Descripción (opcional)</Label>
            <Input
              id="sc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Qué pregunta responde este escenario"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Se copia el plan vigente como punto de partida y entra al tablero
            como borrador.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={saving || name.trim().length < 3}>
              {saving ? "Creando…" : "Crear escenario"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
