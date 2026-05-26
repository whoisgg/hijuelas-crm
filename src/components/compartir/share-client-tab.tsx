"use client";

import * as React from "react";
import { Copy, Eye, ExternalLink, Trash2 } from "lucide-react";
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
import { CreateShareLinkDialog } from "./create-share-link-dialog";
import {
  revokeClientShareLink,
  type ClientShareLinkRow,
  type ClientPickerRow,
} from "@/lib/actions/client-shares";

type Props = {
  shareLinks: ClientShareLinkRow[];
  clients: ClientPickerRow[];
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

function shareUrl(siteUrl: string, token: string): string {
  return `${siteUrl}/share/c/${token}`;
}

function statusFor(row: ClientShareLinkRow): "Activo" | "Expirado" | "Revocado" {
  if (row.revoked_at) return "Revocado";
  if (row.expires_at && new Date(row.expires_at) < new Date()) return "Expirado";
  return "Activo";
}

export function ShareClientTab({ shareLinks, clients, siteUrl }: Props) {
  const [isPending, startTransition] = React.useTransition();
  const visibleLinks = shareLinks.filter((s) => !s.revoked_at);

  async function copyUrl(token: string) {
    try {
      await navigator.clipboard.writeText(shareUrl(siteUrl, token));
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  function onRevoke(id: string, clientName: string | null) {
    const label = clientName ?? id;
    if (!window.confirm(`¿Revocar link para ${label}?`)) return;
    startTransition(async () => {
      const res = await revokeClientShareLink(id);
      if (res.ok) toast.success("Link revocado");
      else toast.error(res.message);
    });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Links de cliente</CardTitle>
          <CardDescription>
            Genera un link público con la ficha de contacto del cliente (KAM y
            contactos principales). Útil para compartir con un cliente nuevo o
            un partner.
          </CardDescription>
        </div>
        <CreateShareLinkDialog clients={clients} siteUrl={siteUrl} />
      </CardHeader>
      <CardContent>
        {visibleLinks.length === 0 ? (
          <div className="rounded-md border border-dashed py-8 text-center text-sm text-muted-foreground">
            No tienes links activos.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Creado</TableHead>
                <TableHead>Expira</TableHead>
                <TableHead>Aperturas</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-32" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleLinks.map((s) => {
                const st = statusFor(s);
                return (
                  <TableRow key={s.id} className={s.revoked_at ? "opacity-50" : ""}>
                    <TableCell className="font-medium">
                      {s.client_name ?? "—"}
                      {s.country_name ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({s.country_name})
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground" suppressHydrationWarning>
                      {formatDate(s.created_at)}
                    </TableCell>
                    <TableCell className="text-muted-foreground" suppressHydrationWarning>
                      {s.expires_at ? formatDate(s.expires_at) : "Sin expiración"}
                    </TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-sm">
                        <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                        {s.open_count}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={st === "Activo" ? "secondary" : "outline"}>
                        {st}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {st === "Activo" ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyUrl(s.token)}
                              aria-label="Copiar link"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <a
                              href={shareUrl(siteUrl, s.token)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                              aria-label="Abrir link"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </a>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={isPending}
                              onClick={() => onRevoke(s.id, s.client_name)}
                              aria-label="Revocar"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
