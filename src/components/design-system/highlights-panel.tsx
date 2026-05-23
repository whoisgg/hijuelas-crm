"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type Highlight = {
  label: string;
  value: React.ReactNode;
  helper?: string;
};

export type QuickAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  shortcut?: string;
};

export type HighlightsBadge = {
  label: string;
  variant?: "default" | "secondary" | "success" | "warning" | "destructive";
};

export type HighlightsPanelProps = {
  title: string;
  subtitle?: string;
  avatar?: { src?: string; fallback: string };
  highlights: Highlight[];
  actions?: QuickAction[];
  badges?: HighlightsBadge[];
  className?: string;
};

const BADGE_CLASSES: Record<NonNullable<HighlightsBadge["variant"]>, string> = {
  default: "bg-primary/10 text-primary border-primary/20",
  secondary: "bg-muted text-muted-foreground border-transparent",
  success:
    "bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-300",
  warning:
    "bg-amber-500/10 text-amber-700 border-amber-500/20 dark:text-amber-300",
  destructive:
    "bg-destructive/10 text-destructive border-destructive/20",
};

/**
 * Sticky header de Record Pages (Cliente / Contrato / Oportunidad).
 *
 * Layout: avatar + título + subtitle + badges a la izquierda, quick actions
 * a la derecha. Debajo, grid responsivo de highlights (4-6 campos clave).
 */
export function HighlightsPanel({
  title,
  subtitle,
  avatar,
  highlights,
  actions,
  badges,
  className,
}: HighlightsPanelProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-10 flex flex-col gap-3 rounded-xl border bg-card/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/80",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {avatar ? (
            <Avatar size="lg">
              {avatar.src ? (
                <AvatarImage src={avatar.src} alt={title} />
              ) : null}
              <AvatarFallback>{avatar.fallback}</AvatarFallback>
            </Avatar>
          ) : null}
          <div className="min-w-0 space-y-0.5">
            <h2 className="truncate font-heading text-lg leading-tight font-semibold">
              {title}
            </h2>
            {subtitle ? (
              <p className="truncate text-sm text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
            {badges && badges.length > 0 ? (
              <div className="mt-1 flex flex-wrap items-center gap-1">
                {badges.map((b, i) => (
                  <Badge
                    key={`${b.label}-${i}`}
                    variant="outline"
                    className={cn("h-5 px-2", BADGE_CLASSES[b.variant ?? "default"])}
                  >
                    {b.label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {actions && actions.length > 0 ? (
          <TooltipProvider>
            <div className="flex shrink-0 items-center gap-1">
              {actions.map((action) => {
                const Icon = action.icon;
                return (
                  <Tooltip key={action.id}>
                    <TooltipTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={action.onClick}
                          aria-label={action.label}
                        >
                          <Icon className="h-4 w-4" />
                        </Button>
                      }
                    />
                    <TooltipContent>
                      <span>{action.label}</span>
                      {action.shortcut ? (
                        <kbd className="ml-1 rounded border border-background/30 bg-background/20 px-1 text-[10px] font-mono">
                          {action.shortcut}
                        </kbd>
                      ) : null}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          </TooltipProvider>
        ) : null}
      </div>

      {highlights.length > 0 ? (
        <div
          className={cn(
            "grid gap-3 border-t pt-3 sm:gap-4",
            "grid-cols-2 md:grid-cols-3 lg:grid-cols-6",
          )}
        >
          {highlights.slice(0, 6).map((h) => (
            <div key={h.label} className="min-w-0 space-y-0.5">
              <div className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                {h.label}
              </div>
              <div className="truncate text-sm font-medium text-foreground">
                {h.value}
              </div>
              {h.helper ? (
                <div className="truncate text-xs text-muted-foreground">
                  {h.helper}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
