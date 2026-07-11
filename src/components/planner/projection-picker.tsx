"use client";

import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";

/**
 * Selector "Incluir proyección": ver la ocupación con un escenario del
 * simulador en lugar del plan vigente.
 */
export function ProjectionPicker({
  scenarios,
  selectedId,
}: {
  scenarios: { id: number; name: string; status: string }[];
  selectedId: number | null;
}) {
  const router = useRouter();
  if (!scenarios.length) return null;

  return (
    <label className="flex items-center gap-2 text-sm">
      <FlaskConical className="h-4 w-4 text-muted-foreground" />
      <select
        value={selectedId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          router.push(v ? `/planner/ocupacion?proyeccion=${v}` : "/planner/ocupacion");
        }}
        className="h-9 max-w-56 rounded-md border bg-background px-2 text-sm"
        aria-label="Incluir proyección"
      >
        <option value="">Plan vigente</option>
        {scenarios.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.status === "aprobado" ? " ✓" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
