"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type QuickAction = {
  id: string;
  label: string;
  icon: LucideIcon;
  onClick: () => void;
  shortcut?: string;
  variant?: "default" | "secondary" | "ghost";
};

export type QuickActionsProps = {
  actions: QuickAction[];
  compact?: boolean;
  className?: string;
};

/**
 * Botones contextuales (Log Call / New Task / Email / Note...).
 * Modo default: icon + label. Modo compact: icon-only con tooltip.
 */
export function QuickActions({
  actions,
  compact = false,
  className,
}: QuickActionsProps) {
  if (compact) {
    return (
      <TooltipProvider>
        <div className={cn("flex items-center gap-1", className)}>
          {actions.map((action) => {
            const Icon = action.icon;
            return (
              <Tooltip key={action.id}>
                <TooltipTrigger
                  render={
                    <Button
                      variant={action.variant ?? "ghost"}
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
                    <kbd className="ml-1.5 rounded border border-background/30 bg-background/20 px-1 font-mono text-[10px]">
                      {action.shortcut}
                    </kbd>
                  ) : null}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
        {actions.map((action) => {
          const Icon = action.icon;
          const button = (
            <Button
              variant={action.variant ?? "outline"}
              size="sm"
              onClick={action.onClick}
            >
              <Icon className="h-3.5 w-3.5" />
              {action.label}
            </Button>
          );

          if (!action.shortcut) {
            return <React.Fragment key={action.id}>{button}</React.Fragment>;
          }

          return (
            <Tooltip key={action.id}>
              <TooltipTrigger render={button} />
              <TooltipContent>
                <span>{action.label}</span>
                <kbd className="ml-1.5 rounded border border-background/30 bg-background/20 px-1 font-mono text-[10px]">
                  {action.shortcut}
                </kbd>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
