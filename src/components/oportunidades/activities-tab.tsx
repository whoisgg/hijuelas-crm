"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  CheckSquare,
  Mail,
  MessageSquare,
  Phone,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  createActivity,
  markActivityDone,
  type AppUserRow,
  type OpportunityDetail,
} from "@/lib/actions/oportunidades";
import type { Database } from "@/lib/database.types";

import { initialsOf } from "./utils";

type ActivityType = Database["public"]["Enums"]["activity_type"];

type ActivityRow = OpportunityDetail["activities"][number];

const TYPE_META: Record<
  ActivityType,
  { label: string; icon: LucideIcon; color: string }
> = {
  call: { label: "Llamada", icon: Phone, color: "text-blue-600 dark:text-blue-400" },
  email: { label: "Email", icon: Mail, color: "text-violet-600 dark:text-violet-400" },
  meeting: {
    label: "Reunión",
    icon: Users,
    color: "text-amber-600 dark:text-amber-400",
  },
  task: {
    label: "Tarea",
    icon: CheckSquare,
    color: "text-emerald-600 dark:text-emerald-400",
  },
  note: {
    label: "Nota",
    icon: StickyNote,
    color: "text-orange-600 dark:text-orange-400",
  },
};

const ALL_TYPES: ActivityType[] = ["call", "email", "meeting", "task", "note"];

type Props = {
  opp: OpportunityDetail;
  users: Pick<AppUserRow, "id" | "full_name" | "email" | "avatar_url">[];
  currentUserId: string | null;
};

export function ActivitiesTab({ opp, users, currentUserId }: Props) {
  const grouped = React.useMemo(() => {
    const acc: Record<ActivityType, ActivityRow[]> = {
      call: [],
      email: [],
      meeting: [],
      task: [],
      note: [],
    };
    for (const a of opp.activities) acc[a.type].push(a);
    return acc;
  }, [opp.activities]);

  return (
    <div className="space-y-3">
      <QuickAddActivity
        oppId={opp.id}
        users={users}
        currentUserId={currentUserId}
      />

      <div className="grid gap-3 lg:grid-cols-2">
        {ALL_TYPES.map((t) => (
          <ActivityGroup key={t} type={t} items={grouped[t]} />
        ))}
      </div>

      {opp.activities.length === 0 ? (
        <div className="rounded-md border border-dashed p-8 text-center text-xs text-muted-foreground">
          Aún no hay actividades.
        </div>
      ) : null}
    </div>
  );
}

function ActivityGroup({
  type,
  items,
}: {
  type: ActivityType;
  items: ActivityRow[];
}) {
  const router = useRouter();
  const meta = TYPE_META[type];
  const Icon = meta.icon;

  if (items.length === 0) return null;

  const handleToggleDone = async (id: string, done: boolean) => {
    try {
      await markActivityDone(id, done);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al actualizar tarea",
      );
    }
  };

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Icon className={cn("h-3.5 w-3.5", meta.color)} />
        <span className="text-sm font-medium">{meta.label}</span>
        <span className="text-[11px] text-muted-foreground">({items.length})</span>
      </div>
      <ul className="divide-y">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex items-start gap-2 px-3 py-2 text-xs"
          >
            <button
              type="button"
              onClick={() => handleToggleDone(a.id, !a.done_at)}
              aria-label={a.done_at ? "Marcar pendiente" : "Marcar hecho"}
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border",
                a.done_at
                  ? "border-emerald-500 bg-emerald-500/10 text-emerald-600"
                  : "border-muted-foreground/40",
              )}
            >
              {a.done_at ? "✓" : ""}
            </button>
            <div className="min-w-0 flex-1">
              <div
                className={cn(
                  "truncate font-medium",
                  a.done_at && "text-muted-foreground line-through",
                )}
              >
                {a.subject}
              </div>
              {a.body ? (
                <p className="line-clamp-2 text-[11px] text-muted-foreground">
                  {a.body}
                </p>
              ) : null}
              <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                {a.owner ? (
                  <span className="inline-flex items-center gap-1">
                    <Avatar size="sm" className="size-3.5">
                      {a.owner.avatar_url ? (
                        <AvatarImage
                          src={a.owner.avatar_url}
                          alt={a.owner.full_name ?? ""}
                        />
                      ) : null}
                      <AvatarFallback className="text-[8px]">
                        {initialsOf(a.owner.full_name ?? a.owner.email ?? "")}
                      </AvatarFallback>
                    </Avatar>
                    {a.owner.full_name ?? a.owner.email}
                  </span>
                ) : null}
                {a.due_at ? (
                  <span>
                    Vence {formatDistanceToNow(new Date(a.due_at), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </span>
                ) : (
                  <span>
                    {formatDistanceToNow(new Date(a.created_at), {
                      addSuffix: true,
                      locale: es,
                    })}
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuickAddActivity({
  oppId,
  users,
  currentUserId,
}: {
  oppId: string;
  users: Pick<AppUserRow, "id" | "full_name" | "email" | "avatar_url">[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [type, setType] = React.useState<ActivityType>("note");
  const [subject, setSubject] = React.useState("");
  const [body, setBody] = React.useState("");
  const [dueAt, setDueAt] = React.useState("");
  const [ownerId, setOwnerId] = React.useState(currentUserId ?? "");
  const [saving, setSaving] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      toast.error("Escribe un asunto");
      return;
    }
    setSaving(true);
    try {
      await createActivity(oppId, {
        type,
        subject: subject.trim(),
        body: body.trim() || null,
        due_at: dueAt ? new Date(dueAt).toISOString() : null,
        owner_id: ownerId || null,
      });
      setSubject("");
      setBody("");
      setDueAt("");
      toast.success("Actividad creada");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-2 rounded-xl border bg-card p-3"
    >
      <div className="flex flex-wrap gap-1">
        {ALL_TYPES.map((t) => {
          const meta = TYPE_META[t];
          const Icon = meta.icon;
          const active = type === t;
          return (
            <button
              type="button"
              key={t}
              onClick={() => setType(t)}
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
        value={subject}
        onChange={(e) => setSubject(e.target.value)}
        placeholder={`Nueva ${TYPE_META[type].label.toLowerCase()}...`}
        className="h-8 text-sm"
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Detalle (opcional)"
        rows={2}
        className="text-sm"
      />
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Vence</Label>
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(e) => setDueAt(e.target.value)}
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Owner</Label>
          <Select
            value={ownerId}
            onValueChange={(v) => {
              if (typeof v === "string") setOwnerId(v);
            }}
          >
            <SelectTrigger size="sm" className="h-7 w-full text-xs">
              <SelectValue placeholder="Sin owner" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name ?? u.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end justify-end">
          <Button
            size="sm"
            type="submit"
            disabled={saving || !subject.trim()}
          >
            <MessageSquare className="h-3 w-3" />
            Agregar
          </Button>
        </div>
      </div>
    </form>
  );
}
