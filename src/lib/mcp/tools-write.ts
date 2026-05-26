import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { z } from "zod";
import { canWrite, getAuthExtra, supabaseAnonClient } from "./auth";

type ToolHandler = Parameters<McpServer["registerTool"]>[2];
type ToolExtra = { authInfo?: AuthInfo };

function authedWriter(extra: ToolExtra) {
  const auth = getAuthExtra(extra?.authInfo);
  if (!auth) return { error: "No autenticado." as const, auth: null };
  if (!canWrite(auth.role)) {
    return {
      error:
        `Rol "${auth.role}" no autorizado a escribir vía MCP. Necesitas rol admin o mcp_editor.` as const,
      auth: null,
    };
  }
  return { error: null, auth };
}

function jsonContent(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorContent(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true as const };
}

async function rpc<T = unknown>(
  fnName: string,
  args: Record<string, unknown>,
): Promise<{ data: T | null; error: { message: string } | null }> {
  const supabase = supabaseAnonClient();
  return (supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: T | null; error: { message: string } | null }>)(fnName, args);
}

export function registerWriteTools(server: McpServer): void {
  server.registerTool(
    "create_opportunity",
    {
      title: "Crear oportunidad",
      description:
        "Crea una oportunidad en el pipeline. Si no se especifica stage, usa la primera. Requiere rol admin o mcp_editor.",
      inputSchema: {
        name: z.string().min(1).describe("Nombre de la oportunidad"),
        client_id: z.string().uuid().optional().describe("UUID de cliente existente"),
        client_name_raw: z.string().optional().describe("Si no hay client_id, nombre libre"),
        stage_id: z.string().uuid().optional(),
        owner_id: z.string().uuid().optional().describe("Si null, owner = caller"),
        expected_close_date: z.string().optional().describe("YYYY-MM-DD"),
        currency: z.string().optional().describe("USD, CLP, EUR, etc."),
        estimated_value: z.number().optional(),
        notes: z.string().optional(),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const { error: authErr, auth } = authedWriter(extra);
      if (authErr || !auth) return errorContent(authErr ?? "No auth");
      const { data, error } = await rpc("mcp_create_opportunity", {
        p_user_id: auth.userId,
        p_name: args.name,
        p_client_id: args.client_id ?? null,
        p_client_name_raw: args.client_name_raw ?? null,
        p_stage_id: args.stage_id ?? null,
        p_owner_id: args.owner_id ?? null,
        p_expected_close_date: args.expected_close_date ?? null,
        p_currency: args.currency ?? null,
        p_estimated_value: args.estimated_value ?? null,
        p_notes: args.notes ?? null,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "update_opportunity",
    {
      title: "Actualizar oportunidad",
      description: "Actualiza campos editables. Solo se modifican los pasados; el resto queda igual.",
      inputSchema: {
        opportunity_id: z.string().uuid(),
        name: z.string().optional(),
        stage_id: z.string().uuid().optional(),
        owner_id: z.string().uuid().optional(),
        expected_close_date: z.string().optional(),
        probability_pct: z.number().optional(),
        estimated_value: z.number().optional(),
        currency: z.string().optional(),
        lost_reason: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const { error: authErr, auth } = authedWriter(extra);
      if (authErr || !auth) return errorContent(authErr ?? "No auth");
      const { data, error } = await rpc("mcp_update_opportunity", {
        p_user_id: auth.userId,
        p_opportunity_id: args.opportunity_id,
        p_name: args.name ?? null,
        p_stage_id: args.stage_id ?? null,
        p_owner_id: args.owner_id ?? null,
        p_expected_close_date: args.expected_close_date ?? null,
        p_probability_pct: args.probability_pct ?? null,
        p_estimated_value: args.estimated_value ?? null,
        p_currency: args.currency ?? null,
        p_lost_reason: args.lost_reason ?? null,
        p_notes: args.notes ?? null,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "move_opportunity_stage",
    {
      title: "Mover oportunidad de etapa",
      description: "Cambia la etapa y reescribe probability_pct al default de la nueva etapa.",
      inputSchema: {
        opportunity_id: z.string().uuid(),
        stage_id: z.string().uuid(),
      },
    },
    (async (
      args: { opportunity_id: string; stage_id: string },
      extra: ToolExtra,
    ) => {
      const { error: authErr, auth } = authedWriter(extra);
      if (authErr || !auth) return errorContent(authErr ?? "No auth");
      const { data, error } = await rpc("mcp_move_opportunity_stage", {
        p_user_id: auth.userId,
        p_opportunity_id: args.opportunity_id,
        p_stage_id: args.stage_id,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "register_payment",
    {
      title: "Registrar pago",
      description:
        "Crea un pago asociado a un contrato. type debe ser uno de: anticipo_1, anticipo_2, saldo. status: pendiente, pagado, vencido.",
      inputSchema: {
        contract_id: z.string().uuid(),
        type: z.enum(["anticipo_1", "anticipo_2", "saldo"]),
        amount: z.number(),
        currency: z.string().describe("USD, CLP, EUR, etc."),
        iva: z.number().optional().describe("Default 0"),
        due_date: z.string().optional().describe("YYYY-MM-DD"),
        paid_at: z.string().optional(),
        reference: z.string().optional(),
        status: z.enum(["pendiente", "pagado", "vencido"]).optional(),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const { error: authErr, auth } = authedWriter(extra);
      if (authErr || !auth) return errorContent(authErr ?? "No auth");
      const { data, error } = await rpc("mcp_register_payment", {
        p_user_id: auth.userId,
        p_contract_id: args.contract_id,
        p_type: args.type,
        p_amount: args.amount,
        p_currency: args.currency,
        p_iva: args.iva ?? 0,
        p_due_date: args.due_date ?? null,
        p_paid_at: args.paid_at ?? null,
        p_reference: args.reference ?? null,
        p_status: args.status ?? "pendiente",
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "create_client",
    {
      title: "Crear cliente",
      description: "Crea un cliente nuevo. Solo `name` es obligatorio.",
      inputSchema: {
        name: z.string().min(1),
        country_id: z.string().uuid().optional(),
        legal_name: z.string().optional(),
        tax_id: z.string().optional(),
        giro: z.string().optional(),
        region: z.string().optional(),
        account_owner_id: z.string().uuid().optional().describe("UUID del KAM"),
        notes: z.string().optional(),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const { error: authErr, auth } = authedWriter(extra);
      if (authErr || !auth) return errorContent(authErr ?? "No auth");
      const { data, error } = await rpc("mcp_create_client", {
        p_user_id: auth.userId,
        p_name: args.name,
        p_country_id: args.country_id ?? null,
        p_legal_name: args.legal_name ?? null,
        p_tax_id: args.tax_id ?? null,
        p_giro: args.giro ?? null,
        p_region: args.region ?? null,
        p_account_owner_id: args.account_owner_id ?? null,
        p_notes: args.notes ?? null,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "update_client",
    {
      title: "Actualizar cliente",
      description: "Actualiza campos del cliente. Solo se modifican los pasados.",
      inputSchema: {
        client_id: z.string().uuid(),
        name: z.string().optional(),
        legal_name: z.string().optional(),
        tax_id: z.string().optional(),
        giro: z.string().optional(),
        country_id: z.string().uuid().optional(),
        region: z.string().optional(),
        account_owner_id: z.string().uuid().optional(),
        notes: z.string().optional(),
        is_active: z.boolean().optional(),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const { error: authErr, auth } = authedWriter(extra);
      if (authErr || !auth) return errorContent(authErr ?? "No auth");
      const { data, error } = await rpc("mcp_update_client", {
        p_user_id: auth.userId,
        p_client_id: args.client_id,
        p_name: args.name ?? null,
        p_legal_name: args.legal_name ?? null,
        p_tax_id: args.tax_id ?? null,
        p_giro: args.giro ?? null,
        p_country_id: args.country_id ?? null,
        p_region: args.region ?? null,
        p_account_owner_id: args.account_owner_id ?? null,
        p_notes: args.notes ?? null,
        p_is_active: args.is_active ?? null,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "create_contract_draft",
    {
      title: "Crear borrador de contrato",
      description:
        "Crea un contrato nuevo en status 'borrador' con sus items. El KAM lo termina de armar después en la web. Auto-genera el número con formato {PREFIX}-{YEAR}-MCP{epoch}. organization_id se resuelve del caller. total_neto se calcula como SUM(qty_plants * unit_price). Requiere admin o mcp_editor.",
      inputSchema: {
        client_id: z.string().uuid(),
        currency: z.string().describe("USD, CLP, EUR, etc."),
        items: z.array(z.object({
          variety_id: z.string().uuid(),
          qty_plants: z.number().int().min(1),
          unit_price: z.number().optional(),
          delivery_year: z.number().int().optional(),
          delivery_week: z.number().int().min(1).max(53).optional(),
          delivery_month: z.number().int().min(1).max(12).optional(),
          format: z.string().optional().describe("Ej: 'vitro', 'maceta 1L'"),
          material_type: z.string().optional(),
          notes: z.string().optional(),
        })).min(1).describe("Al menos 1 item con variety_id y qty_plants"),
        sale_type: z.string().optional().describe("Ej: 'exportacion', 'mercado_interno'"),
        condition: z.string().optional().describe("'venta' (default), 'muestra', 'reposicion'"),
        incoterm: z.string().optional().describe("Ej: 'EXW', 'FOB', 'CIF'"),
        notes: z.string().optional(),
        organization_id: z.string().uuid().optional().describe("Si null, usa la del caller"),
      },
    },
    (async (
      args: {
        client_id: string;
        currency: string;
        items: unknown[];
        sale_type?: string;
        condition?: string;
        incoterm?: string;
        notes?: string;
        organization_id?: string;
      },
      extra: ToolExtra,
    ) => {
      const { error: authErr, auth } = authedWriter(extra);
      if (authErr || !auth) return errorContent(authErr ?? "No auth");
      const { data, error } = await rpc("mcp_create_contract_draft", {
        p_user_id: auth.userId,
        p_client_id: args.client_id,
        p_currency: args.currency,
        p_items: args.items,
        p_sale_type: args.sale_type ?? null,
        p_condition: args.condition ?? "venta",
        p_incoterm: args.incoterm ?? null,
        p_notes: args.notes ?? null,
        p_organization_id: args.organization_id ?? null,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "update_contract",
    {
      title: "Actualizar contrato",
      description:
        "Actualiza metadata del contrato. status: borrador, por_revisar, firmado, en_proceso, finalizado, cancelado.",
      inputSchema: {
        contract_id: z.string().uuid(),
        status: z.string().optional(),
        condition: z.string().optional(),
        sale_type: z.string().optional(),
        signed_at: z.string().optional(),
        kam_id: z.string().uuid().optional(),
        incoterm: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    (async (args: Record<string, unknown>, extra: ToolExtra) => {
      const { error: authErr, auth } = authedWriter(extra);
      if (authErr || !auth) return errorContent(authErr ?? "No auth");
      const { data, error } = await rpc("mcp_update_contract", {
        p_user_id: auth.userId,
        p_contract_id: args.contract_id,
        p_status: args.status ?? null,
        p_condition: args.condition ?? null,
        p_sale_type: args.sale_type ?? null,
        p_signed_at: args.signed_at ?? null,
        p_kam_id: args.kam_id ?? null,
        p_incoterm: args.incoterm ?? null,
        p_notes: args.notes ?? null,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "add_contract_note",
    {
      title: "Agregar nota a contrato",
      description: "Anota una nota interna al timeline del contrato (no modifica `contracts.notes`).",
      inputSchema: {
        contract_id: z.string().uuid(),
        body: z.string().min(1),
      },
    },
    (async (args: { contract_id: string; body: string }, extra: ToolExtra) => {
      const { error: authErr, auth } = authedWriter(extra);
      if (authErr || !auth) return errorContent(authErr ?? "No auth");
      const { data, error } = await rpc("mcp_add_contract_note", {
        p_user_id: auth.userId,
        p_contract_id: args.contract_id,
        p_body: args.body,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );

  server.registerTool(
    "list_contract_notes",
    {
      title: "Listar notas de contrato",
      description: "Lectura del timeline de notas (no requiere rol de escritura).",
      inputSchema: {
        contract_id: z.string().uuid(),
        limit: z.number().int().min(1).max(200).optional(),
      },
    },
    (async (
      args: { contract_id: string; limit?: number },
      extra: ToolExtra,
    ) => {
      const auth = getAuthExtra(extra?.authInfo);
      if (!auth) return errorContent("No autenticado.");
      const { data, error } = await rpc("mcp_list_contract_notes", {
        p_user_id: auth.userId,
        p_contract_id: args.contract_id,
        p_limit: args.limit ?? 50,
      });
      if (error) return errorContent(error.message);
      return jsonContent(data);
    }) as ToolHandler,
  );
}
