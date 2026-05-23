"use client";

import * as React from "react";
import { Check, Info } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type PathStep = {
  id: string;
  label: string;
  completed?: boolean;
  current?: boolean;
  description?: string;
};

export type PathStepperProps = {
  steps: PathStep[];
  onMarkComplete?: (stepId: string) => void;
  /** Texto contextual mostrado bajo el path cuando hay etapa actual. */
  guidance?: string;
  className?: string;
};

/**
 * Visualización tipo Salesforce "Path" — pildoras horizontales conectadas que
 * muestran las etapas (stages) de un proceso. Etapa actual con relleno verde,
 * completadas con check, pendientes en gris.
 */
export function PathStepper({
  steps,
  onMarkComplete,
  guidance,
  className,
}: PathStepperProps) {
  const currentStep = steps.find((s) => s.current);

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex items-stretch gap-2">
        <div className="flex-1 overflow-x-auto">
          <ol className="flex min-w-max items-center">
            {steps.map((step, idx) => (
              <PathStepperPill
                key={step.id}
                step={step}
                isFirst={idx === 0}
                isLast={idx === steps.length - 1}
              />
            ))}
          </ol>
        </div>
        {currentStep && onMarkComplete ? (
          <Button
            size="sm"
            onClick={() => onMarkComplete(currentStep.id)}
            className="shrink-0 self-center"
          >
            <Check className="h-3.5 w-3.5" />
            Marcar como completado
          </Button>
        ) : null}
      </div>
      {currentStep && (guidance || currentStep.description) ? (
        <div className="flex items-start gap-1.5 rounded-md border border-dashed border-primary/30 bg-primary/5 px-2.5 py-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span>
            <span className="font-medium text-foreground">
              {currentStep.label}:
            </span>{" "}
            {guidance ?? currentStep.description}
          </span>
        </div>
      ) : null}
    </div>
  );
}

type PathStepperPillProps = {
  step: PathStep;
  isFirst: boolean;
  isLast: boolean;
};

function PathStepperPill({ step, isFirst, isLast }: PathStepperPillProps) {
  const state: "completed" | "current" | "pending" = step.current
    ? "current"
    : step.completed
      ? "completed"
      : "pending";

  return (
    <li
      className={cn(
        "relative flex h-9 items-center pr-3 pl-4 text-xs font-medium select-none",
        isFirst ? "rounded-l-md" : "-ml-2",
        isLast ? "rounded-r-md pr-4" : "",
        state === "current" &&
          "bg-primary text-primary-foreground shadow-sm",
        state === "completed" &&
          "bg-primary/15 text-primary dark:bg-primary/25",
        state === "pending" &&
          "bg-muted text-muted-foreground",
      )}
      style={{
        clipPath: isLast
          ? undefined
          : "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%, 10px 50%)",
        // primer step no necesita la muesca izquierda
        ...(isFirst
          ? {
              clipPath: isLast
                ? undefined
                : "polygon(0 0, calc(100% - 10px) 0, 100% 50%, calc(100% - 10px) 100%, 0 100%)",
            }
          : {}),
      }}
      aria-current={state === "current" ? "step" : undefined}
    >
      {state === "completed" ? (
        <Check className="mr-1.5 h-3.5 w-3.5" />
      ) : (
        <span
          className={cn(
            "mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px]",
            state === "current"
              ? "bg-primary-foreground/20 text-primary-foreground"
              : "bg-foreground/10 text-muted-foreground",
          )}
          aria-hidden
        >
          •
        </span>
      )}
      <span className="whitespace-nowrap">{step.label}</span>
    </li>
  );
}
