import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { getAuthExtra, supabaseAnonClient } from "./auth";

type ToolHandler = Parameters<McpServer["registerTool"]>[2];
type ToolExtra = { authInfo?: AuthInfo };

type ErrorResult = {
  content: { type: "text"; text: string }[];
  isError: true;
};

type JsonResult = {
  content: { type: "text"; text: string }[];
};

function notAuthed(): ErrorResult {
  return {
    content: [{ type: "text", text: "No autenticado." }],
    isError: true,
  };
}

function jsonContent(value: unknown): JsonResult {
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
  };
}

function errorContent(message: string): ErrorResult {
  return {
    content: [{ type: "text", text: `Error: ${message}` }],
    isError: true,
  };
}

async function rpc<T = unknown>(
  fnName: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const supabase = supabaseAnonClient();
  // The RPCs we wrote aren't in the generated types; cast through unknown.
  const result = await (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { message: string } | null }>)(fnName, args);
  return result;
}

export function registerReadTools(server: McpServer): void {
  server.registerTool(
    "search",
    {
      title: "Búsqueda global",
      description:
        "Busca por nombre/número en clientes, contratos, oportunidades y variedades. Mínimo 2 caracteres.",
      inputSchema: {
        query: z.string().describe("Texto a buscar (mínimo 2 caracteres)"),
        limit: z.number().int().min(1).max(20).optional().describe("Resultados por grupo (default 5)"),
      },
    },
    (async (
      { query, limit }: { query: string; limit?: number },
      extra: ToolExtra,
    ) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_search", {
        p_user_id: auth.userId,
        p_query: query,
        p_limit: limit ?? 5,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "list_clients",
    {
      title: "Listar clientes",
      description:
        "Lista clientes con paginación. Filtros opcionales: búsqueda por nombre, país, KAM.",
      inputSchema: {
        search: z.string().optional().describe("Buscar por nombre o razón social"),
        country_id: z.string().uuid().optional().describe("UUID del país"),
        kam_id: z.string().uuid().optional().describe("UUID del KAM (account_owner)"),
        limit: z.number().int().min(1).max(100).optional().describe("Default 20"),
        offset: z.number().int().min(0).optional().describe("Default 0"),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_list_clients", {
        p_user_id: auth.userId,
        p_search: args.search ?? null,
        p_country_id: args.country_id ?? null,
        p_kam_id: args.kam_id ?? null,
        p_limit: args.limit ?? 20,
        p_offset: args.offset ?? 0,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "get_client",
    {
      title: "Detalle de cliente",
      description: "Devuelve un cliente con sus contactos y contratos (resumen).",
      inputSchema: { client_id: z.string().uuid() },
    },
    (async ({ client_id }: { client_id: string }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_get_client", {
        p_user_id: auth.userId,
        p_client_id: client_id,
      });
      if (error) return errorContent(error.message);
      if (!data) return errorContent("Cliente no encontrado");
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "list_contracts",
    {
      title: "Listar contratos",
      description:
        "Lista contratos con paginación. Filtros: búsqueda (número o cliente), status, año firma, KAM, cliente.",
      inputSchema: {
        search: z.string().optional(),
        status: z.string().optional().describe("Ej: borrador, firmado, ejecutado, cancelado"),
        year: z.number().int().optional().describe("Año de firma"),
        kam_id: z.string().uuid().optional(),
        client_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(100).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_list_contracts", {
        p_user_id: auth.userId,
        p_search: args.search ?? null,
        p_status: args.status ?? null,
        p_year: args.year ?? null,
        p_kam_id: args.kam_id ?? null,
        p_client_id: args.client_id ?? null,
        p_limit: args.limit ?? 20,
        p_offset: args.offset ?? 0,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "get_contract",
    {
      title: "Detalle de contrato",
      description:
        "Devuelve el contrato completo: items (con variedad), pagos y entregas.",
      inputSchema: { contract_id: z.string().uuid() },
    },
    (async ({ contract_id }: { contract_id: string }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_get_contract", {
        p_user_id: auth.userId,
        p_contract_id: contract_id,
      });
      if (error) return errorContent(error.message);
      if (!data) return errorContent("Contrato no encontrado");
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "list_opportunities",
    {
      title: "Listar oportunidades",
      description: "Lista oportunidades del pipeline. Filtros: stage, owner, cliente.",
      inputSchema: {
        stage_id: z.string().uuid().optional(),
        owner_id: z.string().uuid().optional(),
        client_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_list_opportunities", {
        p_user_id: auth.userId,
        p_stage_id: args.stage_id ?? null,
        p_owner_id: args.owner_id ?? null,
        p_client_id: args.client_id ?? null,
        p_limit: args.limit ?? 50,
        p_offset: args.offset ?? 0,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "get_opportunity",
    {
      title: "Detalle de oportunidad",
      inputSchema: { opportunity_id: z.string().uuid() },
    },
    (async ({ opportunity_id }: { opportunity_id: string }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_get_opportunity", {
        p_user_id: auth.userId,
        p_opportunity_id: opportunity_id,
      });
      if (error) return errorContent(error.message);
      if (!data) return errorContent("Oportunidad no encontrada");
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "list_opportunity_stages",
    {
      title: "Etapas del pipeline",
      description:
        "Lista las 6 etapas del pipeline de oportunidades en orden, con probabilidad default.",
      inputSchema: {},
    },
    (async (_args: Record<string, unknown>, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_list_opportunity_stages", {
        p_user_id: auth.userId,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "list_varieties",
    {
      title: "Listar variedades",
      description: "Catálogo de variedades. Filtros: búsqueda, especie, programa genético.",
      inputSchema: {
        search: z.string().optional(),
        species_id: z.string().uuid().optional(),
        program_id: z.string().uuid().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_list_varieties", {
        p_user_id: auth.userId,
        p_search: args.search ?? null,
        p_species_id: args.species_id ?? null,
        p_program_id: args.program_id ?? null,
        p_limit: args.limit ?? 50,
        p_offset: args.offset ?? 0,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  // ============================================================
  // Aggregation tools — totales y rankings en 1 call
  // ============================================================

  server.registerTool(
    "kam_summary",
    {
      title: "Resumen de un KAM",
      description:
        "Panorama completo de un KAM en una sola llamada: total USD, contratos por status, top 10 clientes y top países. Útil cuando preguntan 'cuánto vendió X' o 'qué hace fulano'. Opcional: filtrar por año.",
      inputSchema: {
        kam_id: z.string().uuid(),
        year: z.number().int().optional().describe("Año de firma del contrato (opcional)"),
      },
    },
    (async (args: { kam_id: string; year?: number }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_kam_summary", {
        p_user_id: auth.userId,
        p_kam_id: args.kam_id,
        p_year: args.year ?? null,
      });
      if (error) return errorContent(error.message);
      if (!data) return errorContent("KAM no encontrado");
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "top_kams",
    {
      title: "Ranking de KAMs",
      description:
        "Top N KAMs ordenados por USD facturado / # contratos / plantas vendidas. Una sola call agrega todos los contratos — no requiere paginar.",
      inputSchema: {
        metric: z.enum(["usd", "contracts", "plants"]).optional().describe("Default 'usd'"),
        year: z.number().int().optional(),
        limit: z.number().int().min(1).max(50).optional().describe("Default 10"),
      },
    },
    (async (
      args: { metric?: "usd" | "contracts" | "plants"; year?: number; limit?: number },
      extra: ToolExtra,
    ) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_top_kams", {
        p_user_id: auth.userId,
        p_metric: args.metric ?? "usd",
        p_year: args.year ?? null,
        p_limit: args.limit ?? 10,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "top_clients",
    {
      title: "Ranking de clientes",
      description:
        "Top N clientes por USD / # contratos / plantas. Mejor que paginar list_contracts cuando se busca ranking. Filtros opcionales: año y status (ej. 'firmado' para excluir borrador).",
      inputSchema: {
        metric: z.enum(["usd", "contracts", "plants"]).optional().describe("Default 'usd'"),
        year: z.number().int().optional(),
        status: z.string().optional().describe("Ej. 'firmado' para solo contratos firmados"),
        limit: z.number().int().min(1).max(100).optional().describe("Default 10"),
      },
    },
    (async (
      args: { metric?: "usd" | "contracts" | "plants"; year?: number; status?: string; limit?: number },
      extra: ToolExtra,
    ) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_top_clients", {
        p_user_id: auth.userId,
        p_metric: args.metric ?? "usd",
        p_year: args.year ?? null,
        p_status: args.status ?? null,
        p_limit: args.limit ?? 10,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "pipeline_summary",
    {
      title: "Resumen del pipeline de oportunidades",
      description:
        "Oportunidades agregadas por stage: count, total USD estimado, weighted USD (estimado * probability/100). Útil para forecast. Filtros: año del expected_close_date, owner_id.",
      inputSchema: {
        year: z.number().int().optional(),
        owner_id: z.string().uuid().optional(),
      },
    },
    (async (args: { year?: number; owner_id?: string }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_pipeline_summary", {
        p_user_id: auth.userId,
        p_year: args.year ?? null,
        p_owner_id: args.owner_id ?? null,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "contracts_overview",
    {
      title: "Resumen general de contratos",
      description:
        "Totales agregados de contratos + breakdown por status, condition, sale_type y año. Ideal para preguntas tipo 'cuánto firmamos este año' o 'cuántos contratos hay por status'.",
      inputSchema: {
        year: z.number().int().optional(),
      },
    },
    (async (args: { year?: number }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_contracts_overview", {
        p_user_id: auth.userId,
        p_year: args.year ?? null,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "deliveries_overview",
    {
      title: "Resumen de entregas por ventana de tiempo",
      description:
        "Agrega plantas a entregar (cross-contract) por año + mes/rango-de-semanas + filtros (país, KAM, cliente). Responde 'cuántas plantas entregamos en junio 2026' o 'qué le debemos a Agroberries este Q3' en 1 call sin abrir contratos uno por uno. Devuelve totals + breakdown por variety/client/country/week + items detallados (cap 100).",
      inputSchema: {
        year: z.number().int().describe("Año de entrega (obligatorio)"),
        month: z.number().int().min(1).max(12).optional().describe("Mes 1-12"),
        week_from: z.number().int().min(1).max(53).optional().describe("Semana ISO inicio"),
        week_to: z.number().int().min(1).max(53).optional().describe("Semana ISO fin"),
        country_id: z.string().uuid().optional(),
        kam_id: z.string().uuid().optional(),
        client_id: z.string().uuid().optional(),
        only_pending: z
          .boolean()
          .optional()
          .describe("Si true, solo items con plantas todavía no entregadas. Default false."),
      },
    },
    (async (
      args: {
        year: number;
        month?: number;
        week_from?: number;
        week_to?: number;
        country_id?: string;
        kam_id?: string;
        client_id?: string;
        only_pending?: boolean;
      },
      extra: ToolExtra,
    ) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_deliveries_overview", {
        p_user_id: auth.userId,
        p_year: args.year,
        p_month: args.month ?? null,
        p_week_from: args.week_from ?? null,
        p_week_to: args.week_to ?? null,
        p_country_id: args.country_id ?? null,
        p_kam_id: args.kam_id ?? null,
        p_client_id: args.client_id ?? null,
        p_only_pending: args.only_pending ?? false,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "payments_overview",
    {
      title: "Resumen de pagos",
      description:
        "Total cobrado vs pendiente vs vencido. Breakdown por moneda. Filtro opcional por año (paid_at o due_date).",
      inputSchema: {
        year: z.number().int().optional(),
      },
    },
    (async (args: { year?: number }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_payments_overview", {
        p_user_id: auth.userId,
        p_year: args.year ?? null,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  // ============================================================
  // Listing tools (existentes desde 00014 + list_kams)
  // ============================================================

  server.registerTool(
    "list_kams",
    {
      title: "Listar KAMs",
      description:
        "Devuelve los KAMs (Key Account Managers, rol sales) con su UUID, email, contacts_count y contracts_count. Usalo para descubrir qué kam_id pasar a list_clients/list_contracts/list_opportunities.",
      inputSchema: {
        include_support: z
          .boolean()
          .optional()
          .describe("Si true, también incluye los sales_support. Default false."),
      },
    },
    (async (args: { include_support?: boolean }, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_list_kams", {
        p_user_id: auth.userId,
        p_include_support: args.include_support ?? false,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "list_payments",
    {
      title: "Listar pagos",
      description:
        "Pagos a través de contratos. Filtros: contrato, cliente, status (pendiente, pagado, vencido).",
      inputSchema: {
        contract_id: z.string().uuid().optional(),
        client_id: z.string().uuid().optional(),
        status: z.string().optional(),
        limit: z.number().int().min(1).max(200).optional(),
        offset: z.number().int().min(0).optional(),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return notAuthed();
      const { data, error } = await rpc("mcp_list_payments", {
        p_user_id: auth.userId,
        p_contract_id: args.contract_id ?? null,
        p_client_id: args.client_id ?? null,
        p_status: args.status ?? null,
        p_limit: args.limit ?? 50,
        p_offset: args.offset ?? 0,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );
}
