"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Activity,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  GitBranch,
  Mail,
  Phone,
  Plus,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ActivityType =
  | "call"
  | "email"
  | "meeting"
  | "task"
  | "note"
  | "change";

export type ActivityItem = {
  id: string;
  type: ActivityType;
  title: string;
  body?: string;
  actor?: { name: string; avatarUrl?: string };
  at: Date;
  done?: boolean;
};

export type ActivityTimelineProps = {
  items: ActivityItem[];
  onAdd?: (type: ActivityType, data: { title: string; body?: string }) => void;
  collapsible?: boolean;
  className?: string;
};

type FilterKey = "all" | ActivityType;

const TYPE_META: Record<
  ActivityType,
  { label: string; icon: LucideIcon; color: string }
> = {
  call: { label: "Llamada", icon: Phone, color: "text-blue-600 dark:text-blue-400" },
  email: { label: "Email", icon: Mail, color: "text-violet-600 dark:text-violet-400" },
  meeting: { label: "Reunión", icon: Users, color: "text-amber-600 dark:text-amber-400" },
  task: { label: "Tarea", icon: CheckSquare, color: "text-emerald-600 dark:text-emerald-400" },
  note: { label: "Nota", icon: StickyNote, color: "text-orange-600 dark:text-orange-400" },
  change: { label: "Cambio", icon: GitBranch, color: "text-muted-foreground" },
};

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todo" },
  { key: "call", label: "Llamadas" },
  { key: "email", label: "Emails" },
  { key: "task", label: "Tareas" },
  { key: "note", label: "Notas" },
  { key: "change", label: "Cambios" },
];

const QUICK_ADD_TYPES: ActivityType[] = ["call", "email", "task", "note"];

/**
 * Feed cronológico descendente con filtros, quick-add inline y modo colapsado
 * a icon-only.
 */
export function ActivityTimeline({
  items,
  onAdd,
  collapsible = true,
  className,
}: ActivityTimelineProps) {
  const [filter, setFilter] = React.useState<FilterKey>("all");
  const [collapsed, setCollapsed] = React.useState(false);

  const sortedItems = React.useMemo(
    () => [...items].sort((a, b) => b.at.getTime() - a.at.getTime()),
    [items],
  );
  const filteredItems = sortedItems.filter(
    (it) => filter === "all" || it.type === filter,
  );

  if (collapsible && collapsed) {
    return (
      <div
        className={cn(
          "flex w-12 flex-col items-center gap-1 border-l bg-card/30 py-2",
          className,
        )}
      >
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCollapsed(false)}
          aria-label="Expandir actividad"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {FILTERS.filter((f) => f.key !== "all").map((f) => {
          const meta = TYPE_META[f.key as ActivityType];
          const Icon = meta.icon;
          return (
            <Button
              key={f.key}
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setFilter(f.key);
                setCollapsed(false);
              }}
              aria-label={f.label}
              className={meta.color}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex w-full flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <Activity className="h-4 w-4 text-primary" />
          <span>Actividad</span>
        </div>
        {collapsible ? (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setCollapsed(true)}
            aria-label="Colapsar actividad"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : null}
      </div>

      {onAdd ? <QuickAddForm onAdd={onAdd} /> : null}

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
              filter === f.key
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-muted",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ol className="flex flex-col gap-2">
        {filteredItems.length === 0 ? (
          <li className="rounded-md border border-dashed py-6 text-center text-xs text-muted-foreground">
            Sin actividad en este filtro.
          </li>
        ) : (
          filteredItems.map((item) => (
            <ActivityRow key={item.id} item={item} />
          ))
        )}
      </ol>
    </div>
  );
}

function QuickAddForm({
  onAdd,
}: {
  onAdd: NonNullable<ActivityTimelineProps["onAdd"]>;
}) {
  const [addType, setAddType] = React.useState<ActivityType>("note");
  const [draftTitle, setDraftTitle] = React.useState("");
  const [draftBody, setDraftBody] = React.useState("");
  const [showBody, setShowBody] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draftTitle.trim()) return;
    onAdd(addType, {
      title: draftTitle.trim(),
      body: draftBody.trim() || undefined,
    });
    setDraftTitle("");
    setDraftBody("");
    setShowBody(false);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-2 rounded-lg border bg-background p-2"
    >
      <div className="flex flex-wrap gap-1">
        {QUICK_ADD_TYPES.map((t) => {
          const meta = TYPE_META[t];
          const Icon = meta.icon;
          const active = addType === t;
          return (
            <button
              type="button"
              key={t}
              onClick={() => setAddType(t)}
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors",
                active
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className="h-3 w-3" />
              {meta.label}
            </button>
          );
        })}
      </div>
      <Input
        value={draftTitle}
        onChange={(e) => setDraftTitle(e.target.value)}
        placeholder={`Nueva ${TYPE_META[addType].label.toLowerCase()}...`}
        className="h-8 text-sm"
      />
      {showBody ? (
        <Textarea
          value={draftBody}
          onChange={(e) => setDraftBody(e.target.value)}
          placeholder="Detalle (opcional)"
          rows={2}
          className="text-sm"
        />
      ) : null}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setShowBody((v) => !v)}
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {showBody ? "Ocultar detalle" : "Agregar detalle"}
        </button>
        <Button size="xs" type="submit" disabled={!draftTitle.trim()}>
          <Plus className="h-3 w-3" />
          Agregar
        </Button>
      </div>
    </form>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const meta = TYPE_META[item.type];
  const Icon = meta.icon;

  return (
    <li className="flex gap-3 rounded-md border bg-background p-2.5 transition-colors hover:bg-muted/40">
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted",
          meta.color,
        )}
      >
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "min-w-0 truncate text-sm font-medium",
              item.done && "text-muted-foreground line-through",
            )}
          >
            {item.title}
          </div>
          <time
            className="shrink-0 text-[11px] text-muted-foreground"
            dateTime={item.at.toISOString()}
          >
            {formatDistanceToNow(item.at, { addSuffix: true, locale: es })}
          </time>
        </div>
        {item.body ? (
          <p className="line-clamp-2 text-xs text-muted-foreground">
            {item.body}
          </p>
        ) : null}
        {item.actor ? (
          <div className="flex items-center gap-1.5 pt-0.5 text-[11px] text-muted-foreground">
            <Avatar size="sm" className="size-4">
              {item.actor.avatarUrl ? (
                <AvatarImage src={item.actor.avatarUrl} alt={item.actor.name} />
              ) : null}
              <AvatarFallback className="text-[9px]">
                {item.actor.name.charAt(0).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span>{item.actor.name}</span>
          </div>
        ) : null}
      </div>
    </li>
  );
}
