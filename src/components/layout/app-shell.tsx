"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Activity } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type AppShellProps = {
  children: React.ReactNode;
  /**
   * Slot opcional para la Activity Timeline (sidebar derecho).
   * Si no se pasa, no se muestra el panel.
   */
  activity?: React.ReactNode;
};

/**
 * Layout principal de los módulos autenticados.
 *
 * Implementa el split 70/30 spec del documento de UI/UX:
 *   - Workspace principal (children) a la izquierda.
 *   - ActivityTimeline (activity) colapsable a la derecha.
 */
export function AppShell({ children, activity }: AppShellProps) {
  const [activityOpen, setActivityOpen] = React.useState(true);
  const hasActivity = Boolean(activity);

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] w-full">
      <main
        className={cn(
          "flex-1 min-w-0 p-6",
          hasActivity && activityOpen ? "lg:pr-3" : undefined,
        )}
      >
        {children}
      </main>

      {hasActivity ? (
        <aside
          className={cn(
            "hidden lg:flex flex-col border-l bg-card/30 transition-[width] duration-200",
            activityOpen ? "w-[30%] max-w-md" : "w-12",
          )}
        >
          <div className="flex h-12 items-center justify-between border-b px-2">
            {activityOpen ? (
              <div className="flex items-center gap-2 px-2 text-sm font-medium">
                <Activity className="h-4 w-4 text-primary" />
                <span>Actividad</span>
              </div>
            ) : (
              <Activity className="mx-auto h-4 w-4 text-muted-foreground" />
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => setActivityOpen((v) => !v)}
              aria-label={activityOpen ? "Colapsar actividad" : "Expandir actividad"}
            >
              {activityOpen ? (
                <ChevronRight className="h-4 w-4" />
              ) : (
                <ChevronLeft className="h-4 w-4" />
              )}
            </Button>
          </div>
          {activityOpen ? (
            <div className="flex-1 overflow-y-auto p-4">{activity}</div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
