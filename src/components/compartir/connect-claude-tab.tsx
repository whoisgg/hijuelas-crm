"use client";

import * as React from "react";
import { Copy, Download, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
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

          {/* OPCIÓN A — claude.ai web (multi-device, account-level) */}
          <section className="space-y-3 rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                A
              </span>
              <h3 className="text-base font-semibold">
                claude.ai (web) — recomendado · funciona en celular + PC
              </h3>
            </div>
            <p className="text-muted-foreground">
              Agregalo <strong>una vez en tu cuenta</strong> desde claude.ai y
              queda disponible en web, Claude Desktop y móvil sin volver a
              configurar.
            </p>
            <ol className="ml-0 space-y-3 text-foreground">
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  1
                </span>
                <div>
                  <strong>Generar tu token</strong> en la sección de arriba (botón <em>Nuevo token</em>) y copialo.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  2
                </span>
                <div>
                  Abrir <a href="https://claude.ai/settings/connectors" target="_blank" rel="noopener noreferrer" className="text-primary underline">claude.ai/settings/connectors</a> (logueado con tu cuenta de Claude).
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  3
                </span>
                <div>
                  Click <strong>&ldquo;Add custom connector&rdquo;</strong>.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  4
                </span>
                <div className="space-y-1">
                  <div>Completar el formulario:</div>
                  <ul className="ml-4 list-disc space-y-1 text-sm text-muted-foreground">
                    <li><strong>Name</strong>: <code className="rounded bg-muted px-1">Hijuelas CRM</code></li>
                    <li>
                      <strong>Remote MCP server URL</strong>:
                      <code className="ml-1 break-all rounded bg-muted px-1">
                        {mcpUrl}?token=TU_TOKEN
                      </code>
                    </li>
                    <li>OAuth Client ID / Secret: <strong>dejar vacíos</strong></li>
                  </ul>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  5
                </span>
                <div>Click <strong>Add</strong>. Listo — el connector ya está sincronizado con tu cuenta.</div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  6
                </span>
                <div>
                  Probá en cualquier chat (web, Desktop o móvil):{" "}
                  <em>&ldquo;Listame los KAMs del CRM Hijuelas&rdquo;</em>.
                </div>
              </li>
            </ol>
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs">
              <strong>Trade-off:</strong> el token queda visible en la URL del
              connector. Si compartes tu sesión de claude.ai con alguien o el
              dispositivo se pierde, revoca el token en{" "}
              <code className="rounded bg-muted px-1">Tokens MCP</code> arriba y
              genera uno nuevo.
            </div>
          </section>

          {/* OPCIÓN B — drag-and-drop .mcpb (single machine, sin token en URL) */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
                B
              </span>
              <h3 className="text-base font-semibold">
                Claude Desktop — instalador local (solo esta máquina)
              </h3>
            </div>
            <p className="text-muted-foreground">
              Si usas Claude solo en este equipo y prefieres que el token{" "}
              <strong>no quede en la URL</strong> sino en archivo cifrado:
              descarga el <code className="rounded bg-muted px-1">.mcpb</code>{" "}
              y arrastralo. No sincroniza con otros dispositivos.
            </p>

            <ol className="ml-0 space-y-3 text-foreground">
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  1
                </span>
                <div>
                  <strong>Tener Claude Desktop instalado.</strong>{" "}
                  <a
                    href="https://claude.ai/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline"
                  >
                    Descargar acá
                  </a>{" "}
                  si todavía no lo tienes (Windows/Mac).
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  2
                </span>
                <div>
                  <strong>Generar tu token</strong> en la sección de arriba
                  (botón <em>Nuevo token</em>). Cópialo a un bloc de notas — lo
                  vas a pegar en Claude.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  3
                </span>
                <div className="space-y-2">
                  <div>
                    <strong>Descargar el instalador</strong>:
                  </div>
                  <a
                    href="/api/install/claude-desktop"
                    download="hijuelas-crm.mcpb"
                    className={buttonVariants()}
                  >
                    <Download className="mr-1.5 h-4 w-4" />
                    Descargar hijuelas-crm.mcpb
                  </a>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  4
                </span>
                <div className="space-y-1.5">
                  <div>
                    <strong>Abrir Claude Desktop</strong> y ir a Settings (
                    <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      Ctrl
                    </kbd>{" "}
                    +{" "}
                    <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      ,
                    </kbd>{" "}
                    en Windows /{" "}
                    <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      ⌘
                    </kbd>{" "}
                    +{" "}
                    <kbd className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      ,
                    </kbd>{" "}
                    en Mac) → click en <strong>Extensions</strong> en el menú
                    lateral.
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  5
                </span>
                <div>
                  <strong>Arrastrar el archivo</strong>{" "}
                  <code className="rounded bg-muted px-1">
                    hijuelas-crm.mcpb
                  </code>{" "}
                  desde tu carpeta de descargas <strong>directo a esa ventana
                  de Extensions</strong>. Va a aparecer un dialog{" "}
                  <strong>&ldquo;Install Hijuelas CRM&rdquo;</strong>.
                  <div className="mt-1.5 text-xs italic text-muted-foreground">
                    ⚠️ Doble-click sobre el archivo puede no funcionar en
                    Windows (file association no se registra automáticamente).
                    El drag-and-drop a la ventana de Extensions es la vía
                    oficial.
                  </div>
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  6
                </span>
                <div>
                  En el dialog: <strong>pegar el token</strong> que generaste
                  en el campo <strong>Token MCP</strong> → click{" "}
                  <strong>Install</strong>.
                </div>
              </li>
              <li className="flex gap-3">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  7
                </span>
                <div>
                  Listo. Abre cualquier chat con Claude y prueba:{" "}
                  <em>&ldquo;Listame los KAMs del CRM Hijuelas&rdquo;</em>.
                </div>
              </li>
            </ol>

            <div className="rounded-md border border-muted-foreground/20 bg-background/50 p-2.5 text-xs text-muted-foreground">
              <strong>Requisitos invisibles:</strong> Claude Desktop ≥ 0.10
              (versiones recientes traen Extensions) y Node.js en el sistema
              para que <code className="rounded bg-muted px-1">npx</code> pueda
              levantar el proxy <code className="rounded bg-muted px-1">mcp-remote</code>.
              Si no tienes Node, instalalo en{" "}
              <a
                href="https://nodejs.org/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                nodejs.org
              </a>{" "}
              (versión LTS, &ldquo;Next&rdquo;, &ldquo;Next&rdquo; — listo).
            </div>
          </section>

          {/* OPCIÓN C — Claude Code (técnico) */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
                C
              </span>
              <h3 className="text-base font-semibold">
                Claude Code (CLI) — para técnicos
              </h3>
            </div>
            <p className="text-muted-foreground">
              Si usas Claude Code en terminal, pega esto en{" "}
              <code className="rounded bg-muted px-1">~/.claude/settings.json</code> o
              <code className="ml-1 rounded bg-muted px-1">.claude/settings.local.json</code> del proyecto:
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

          {/* OPCIÓN D — fallback: Claude Desktop nativo sin .mcpb */}
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-muted text-xs font-bold">
                D
              </span>
              <h3 className="text-base font-semibold">
                Claude Desktop nativo — sin Node.js (fallback)
              </h3>
            </div>
            <p className="text-muted-foreground">
              Si la Opción B falla porque no tienes Node, también podés agregar
              el connector directamente en Claude Desktop (sin pasar por
              claude.ai web). Solo esta máquina. Mismos parámetros que la Opción A.
            </p>
            <ol className="ml-5 list-decimal space-y-1.5 text-muted-foreground">
              <li>Settings → <strong>Connectors</strong> → <strong>Add custom connector</strong>.</li>
              <li><strong>Name</strong>: <code className="rounded bg-muted px-1">Hijuelas CRM</code>.</li>
              <li><strong>Remote MCP server URL</strong>: <code className="rounded bg-muted px-1">{mcpUrl}?token=TU_TOKEN</code> (deja vacío OAuth Client ID/Secret).</li>
              <li>Click <strong>Add</strong>.</li>
            </ol>
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
