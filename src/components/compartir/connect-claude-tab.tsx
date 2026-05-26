"use client";

import * as React from "react";
import { Copy, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateMcpTokenDialog } from "./create-mcp-token-dialog";
import { revokeMcpToken, type McpTokenRow } from "@/lib/actions/mcp-tokens";

type Props = {
  tokens: McpTokenRow[];
  siteUrl: string;
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CL", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function ConnectClaudeTab({ tokens, siteUrl }: Props) {
  const mcpUrl = `${siteUrl}/api/mcp`;
  const [isPending, startTransition] = React.useTransition();

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  function onRevoke(id: string, name: string) {
    if (!window.confirm(`¿Revocar token "${name}"? Esta acción es inmediata.`)) return;
    startTransition(async () => {
      const res = await revokeMcpToken(id);
      if (res.ok) toast.success("Token revocado");
      else toast.error(res.message);
    });
  }

  const activeTokens = tokens.filter((t) => !t.revoked_at);
  const revokedTokens = tokens.filter((t) => t.revoked_at);

  return (
    <div className="space-y-6">
      {/* Tokens */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              Tokens MCP
            </CardTitle>
            <CardDescription>
              Cada cliente MCP (Claude Desktop, Claude Code, etc) necesita un
              token. El plaintext solo se muestra una vez al crearlo — guárdalo.
            </CardDescription>
          </div>
          <CreateMcpTokenDialog />
        </CardHeader>
        <CardContent>
          {tokens.length === 0 ? (
            <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
              No tienes tokens todavía. Crea uno para conectar Claude.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead>Último uso</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeTokens.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground" suppressHydrationWarning>
                      {formatDate(t.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground" suppressHydrationWarning>
                      {formatDate(t.last_used_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">Activo</Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPending}
                        onClick={() => onRevoke(t.id, t.name)}
                        aria-label={`Revocar ${t.name}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {revokedTokens.map((t) => (
                  <TableRow key={t.id} className="opacity-50">
                    <TableCell className="font-medium line-through">{t.name}</TableCell>
                    <TableCell className="text-muted-foreground" suppressHydrationWarning>
                      {formatDate(t.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground" suppressHydrationWarning>
                      {formatDate(t.last_used_at)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">Revocado</Badge>
                    </TableCell>
                    <TableCell />
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Instrucciones */}
      <Card>
        <CardHeader>
          <CardTitle>Cómo conectar Claude</CardTitle>
          <CardDescription>
            Una vez tengas un token, agrega este servidor MCP en tu cliente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <section className="space-y-2">
            <h3 className="font-semibold">Endpoint MCP</h3>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md bg-muted px-3 py-2 text-xs">{mcpUrl}</code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(mcpUrl, "URL")}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
            <p className="text-muted-foreground">
              Header: <code className="rounded bg-muted px-1">Authorization: Bearer &lt;tu token&gt;</code>
            </p>
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">Opción A — Claude Code (recomendado)</h3>
            <p className="text-muted-foreground">
              Agrega esto a <code className="rounded bg-muted px-1">~/.claude/settings.json</code> o
              <code className="ml-1 rounded bg-muted px-1">.claude/settings.local.json</code> del proyecto.
              Reemplaza el token con el que generaste arriba:
            </p>
            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
{`{
  "mcpServers": {
    "hijuelas-crm": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer hjc_TU_TOKEN_AQUI"
      }
    }
  }
}`}
            </pre>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                copy(
                  `{
  "mcpServers": {
    "hijuelas-crm": {
      "type": "http",
      "url": "${mcpUrl}",
      "headers": {
        "Authorization": "Bearer hjc_TU_TOKEN_AQUI"
      }
    }
  }
}`,
                  "JSON",
                )
              }
            >
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar JSON
            </Button>
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold">Opción B — Claude Desktop</h3>
            <p className="text-muted-foreground">
              El dialog <strong>Add custom connector</strong> de Claude Desktop solo
              acepta OAuth, no permite setear un Bearer header. Workaround: pega el
              token en el query string de la URL.
            </p>
            <ol className="ml-5 list-decimal space-y-1.5 text-muted-foreground">
              <li>Descarga Claude Desktop desde <code className="rounded bg-muted px-1">claude.ai/download</code>.</li>
              <li>Settings (⌘+,) → <strong>Connectors</strong> → <strong>Add custom connector</strong>.</li>
              <li>En <strong>Name</strong>: <code className="rounded bg-muted px-1">Hijuelas CRM</code>.</li>
              <li>En <strong>Remote MCP server URL</strong>: pega <code className="rounded bg-muted px-1">{mcpUrl}?token=TU_TOKEN</code> (deja vacío OAuth Client ID/Secret).</li>
              <li>Click <strong>Add</strong>. Debería listar las tools (whoami, list_contracts, list_clients, etc).</li>
            </ol>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs">
              <strong>Heads up:</strong> el token va visible en la URL del config
              (no en el tráfico HTTP — viaja en query string TLS-encriptado, pero
              queda en archivos y logs de Claude Desktop). Úsalo solo en
              dispositivos de confianza. Si lo expones, revoca el token y crea otro.
            </div>
          </section>

          <section className="space-y-2">
            <h3 className="font-semibold">Prueba rápida</h3>
            <p className="text-muted-foreground">
              Una vez conectado, dile a Claude:{" "}
              <em>&ldquo;Listame los contratos firmados de este año&rdquo;</em>{" "}
              o <em>&ldquo;¿Quién es el KAM de Agroberries?&rdquo;</em>.
            </p>
          </section>
        </CardContent>
      </Card>
    </div>
  );
}
