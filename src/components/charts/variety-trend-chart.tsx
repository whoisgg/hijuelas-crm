"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { year: number; qtyPlants: number; revenueUsd: number };

type Props = {
  data: Point[];
};

export function VarietyTrendChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-xs text-muted-foreground">
        Sin histórico disponible.
      </div>
    );
  }

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="year"
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            stroke="var(--border)"
          />
          <YAxis
            tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
            stroke="var(--border)"
            tickFormatter={(v: number) =>
              new Intl.NumberFormat("es-CL", {
                notation: "compact",
                maximumFractionDigits: 1,
              }).format(v)
            }
          />
          <Tooltip
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: "6px",
              color: "var(--popover-foreground)",
              fontSize: "12px",
            }}
            labelStyle={{ color: "var(--foreground)", fontWeight: 600 }}
            formatter={(value, name) => {
              const num = Number(value);
              if (name === "qtyPlants" && Number.isFinite(num))
                return [num.toLocaleString("es-CL"), "Plantas"];
              return [String(value ?? ""), String(name ?? "")];
            }}
          />
          <Line
            type="monotone"
            dataKey="qtyPlants"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ fill: "var(--primary)", r: 3 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
