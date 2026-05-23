"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { KanbanSquare, List } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  view: "kanban" | "list";
};

export function ViewToggle({ view }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setView = (next: "kanban" | "list") => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "kanban") params.delete("view");
    else params.set("view", "list");
    const qs = params.toString();
    router.replace(`/oportunidades${qs ? `?${qs}` : ""}`);
  };

  return (
    <div className="inline-flex h-8 items-center rounded-lg border bg-card p-0.5">
      <button
        type="button"
        onClick={() => setView("kanban")}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
          view === "kanban"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={view === "kanban"}
      >
        <KanbanSquare className="h-3.5 w-3.5" />
        Kanban
      </button>
      <button
        type="button"
        onClick={() => setView("list")}
        className={cn(
          "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors",
          view === "list"
            ? "bg-primary text-primary-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
        aria-pressed={view === "list"}
      >
        <List className="h-3.5 w-3.5" />
        Lista
      </button>
    </div>
  );
}
