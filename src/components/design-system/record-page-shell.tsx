"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";

export type RecordPageTab = {
  id: string;
  label: string;
  content: React.ReactNode;
  count?: number;
};

export type RecordPageShellProps = {
  highlights: React.ReactNode;
  path?: React.ReactNode;
  tabs: RecordPageTab[];
  timeline?: React.ReactNode;
  defaultTab?: string;
  /** Nombre del search-param que persiste el tab activo. Default: `tab`. */
  tabParam?: string;
  className?: string;
};

/**
 * Layout principal de Record Pages (70/30). Compone HighlightsPanel +
 * PathStepper + Tabs en el main, y ActivityTimeline en el rail derecho
 * (colapsable).
 */
export function RecordPageShell({
  highlights,
  path,
  tabs,
  timeline,
  defaultTab,
  tabParam = "tab",
  className,
}: RecordPageShellProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [timelineOpen, setTimelineOpen] = React.useState(true);

  const initial =
    searchParams.get(tabParam) ?? defaultTab ?? tabs[0]?.id ?? "";

  const handleTabChange = (value: string | number | null) => {
    if (value === null) return;
    const val = String(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set(tabParam, val);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  return (
    <div className={cn("flex w-full gap-4", className)}>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {highlights}
        {path ? <div>{path}</div> : null}

        <Tabs
          value={initial}
          onValueChange={handleTabChange}
          className="flex flex-col gap-3"
        >
          <TabsList variant="line" className="border-b">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
                {typeof t.count === "number" ? (
                  <Badge
                    variant="secondary"
                    className="ml-1.5 h-4 px-1.5 text-[10px]"
                  >
                    {t.count}
                  </Badge>
                ) : null}
              </TabsTrigger>
            ))}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent
              key={t.id}
              value={t.id}
              className="flex flex-col gap-3"
            >
              {t.content}
            </TabsContent>
          ))}
        </Tabs>
      </div>

      {timeline ? (
        <aside
          className={cn(
            "hidden shrink-0 flex-col rounded-xl border bg-card/30 transition-[width] duration-200 lg:flex",
            timelineOpen ? "w-80" : "w-12",
          )}
        >
          <div className="flex h-10 items-center justify-between border-b px-2">
            {timelineOpen ? (
              <div className="flex items-center gap-1.5 px-1 text-xs font-medium">
                <Activity className="h-3.5 w-3.5 text-primary" />
                <span>Actividad</span>
              </div>
            ) : (
              <Activity className="mx-auto h-3.5 w-3.5 text-muted-foreground" />
            )}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => setTimelineOpen((v) => !v)}
              aria-label={
                timelineOpen ? "Colapsar actividad" : "Expandir actividad"
              }
            >
              {timelineOpen ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronLeft className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
          {timelineOpen ? (
            <div className="flex-1 overflow-y-auto p-3">{timeline}</div>
          ) : null}
        </aside>
      ) : null}
    </div>
  );
}
