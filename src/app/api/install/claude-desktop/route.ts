import JSZip from "jszip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STUB_SCRIPT = `// Hijuelas CRM — Desktop Extension stub.
// El handshake real corre vía mcp-remote (npx) hacia el endpoint HTTP del CRM.
// Este archivo existe solo porque la spec del manifest requiere un entry_point.
process.exit(0);
`;

export async function GET(req: Request): Promise<Response> {
  const origin =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    new URL(req.url).origin;
  const mcpUrl = `${origin}/api/mcp`;

  const manifest = {
    manifest_version: "0.3",
    name: "hijuelas-crm",
    display_name: "Hijuelas CRM",
    version: "1.0.0",
    description:
      "Conecta Claude a Hijuelas One: consulta contratos, clientes, oportunidades, pagos y variedades. Escritura limitada al rol mcp_editor/admin.",
    long_description:
      "Este extension proxyea conversaciones con Claude al endpoint MCP del CRM. Requiere un token personal — generalo en " +
      origin +
      "/compartir → Tab \"Conectar Claude\".",
    author: { name: "Grupo Hijuelas" },
    homepage: origin,
    server: {
      type: "node",
      entry_point: "server/index.js",
      mcp_config: {
        command: "npx",
        // Workaround Claude Desktop (Windows): no meter espacios dentro de
        // args — Bearer va por env y se interpola en mcp-remote a runtime.
        args: [
          "-y",
          "mcp-remote",
          mcpUrl,
          "--header",
          "Authorization:${AUTH_HEADER}",
        ],
        env: {
          AUTH_HEADER: "Bearer ${user_config.token}",
        },
      },
    },
    user_config: {
      token: {
        type: "string",
        title: "Token MCP",
        description:
          "Token Bearer personal. Generalo en " + origin + "/compartir.",
        sensitive: true,
        required: true,
      },
    },
  };

  const zip = new JSZip();
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("server/index.js", STUB_SCRIPT);
  const buf = await zip.generateAsync({ type: "uint8array" });

  return new Response(buf as unknown as BodyInit, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": 'attachment; filename="hijuelas-crm.mcpb"',
      "Cache-Control": "no-store",
    },
  });
}
