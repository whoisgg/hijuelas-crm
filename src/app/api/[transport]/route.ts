import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpBearerToken, getAuthExtra } from "@/lib/mcp/auth";
import { registerReadTools } from "@/lib/mcp/tools-read";
import { registerWriteTools } from "@/lib/mcp/tools-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "whoami",
      {
        title: "Quién soy",
        description:
          "Devuelve el usuario autenticado por el token MCP actual (id, email, rol).",
        inputSchema: {},
      },
      async (_args, extra) => {
        const auth = getAuthExtra(extra?.authInfo);
        if (!auth) {
          return {
            content: [{ type: "text", text: "No autenticado." }],
            isError: true,
          };
        }
        return {
          content: [
            {
              type: "text",
              text: `Autenticado como ${auth.email} (id ${auth.userId}, rol ${auth.role}).`,
            },
          ],
        };
      },
    );

    registerReadTools(server);
    registerWriteTools(server);
  },
  {
    serverInfo: {
      name: "hijuelas-crm",
      version: "0.1.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: process.env.NODE_ENV !== "production",
  },
);

const authHandler = withMcpAuth(handler, verifyMcpBearerToken, {
  required: true,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
