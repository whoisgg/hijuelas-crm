import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";

import { getAuthExtra, supabaseAnonClient } from "./auth";

/**
 * Herramientas MCP del Planner (producción). Solo lectura; requieren rol
 * admin, produccion o mcp_editor (validado dentro de cada RPC).
 */

type ToolHandler = Parameters<McpServer["registerTool"]>[2];
type ToolExtra = { authInfo?: AuthInfo };

function notAuthed() {
  return {
    content: [{ type: "text" as const, text: "No autenticado." }],
    isError: true as const,
  };
}

function jsonContent(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function errorContent(message: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${message}` }],
    isError: true as const,
  };
}

async function rpc<T = unknown>(
  fnName: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const supabase = supabaseAnonClient();
  return await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { message: string } | null }>)(fnName, args);
}

export function registerPlannerTools(server: McpServer): void {
  server.registerTool(
    "planner_ocupacion",
    {
      title: "Ocupación del vivero",
      description:
        "Bandejas ocupadas, capacidad y % de utilización por área y semana-campaña, desde la semana actual. Datos del plan de producción (lotes activos).",
      inputSchema: {
        semanas: z
          .number()
          .int()
          .min(1)
          .max(70)
          .optional()
          .describe("Horizonte en semanas desde la actual (default 12)"),
      },
    },
    (async ({ semanas }: { semanas?: number }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_planner_ocupacion", {
        p_user_id: auth.userId,
        p_semanas: semanas ?? 12,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "planner_alertas",
    {
      title: "Alertas de capacidad",
      description:
        "Semanas × área donde la ocupación planificada supera el máximo de utilización (default 95%) — los cuellos de botella del plan.",
      inputSchema: {},
    },
    (async (_args: Record<string, never>, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_planner_alertas", {
        p_user_id: auth.userId,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "planner_lotes",
    {
      title: "Lotes planificados",
      description:
        "Lista de lotes del plan de producción con especie, variedad, plantas, bandejas, semanas y estado. Filtrable por especie.",
      inputSchema: {
        especie: z.string().optional().describe("Filtro por nombre de especie (parcial)"),
        limit: z.number().int().min(1).max(200).optional().describe("Máximo de filas (default 50)"),
      },
    },
    (async (
      { especie, limit }: { especie?: string; limit?: number },
      extra: ToolExtra,
    ) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_planner_lotes", {
        p_user_id: auth.userId,
        p_especie: especie ?? null,
        p_limit: limit ?? 50,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );
}
