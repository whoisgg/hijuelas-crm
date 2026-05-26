"use client";

import * as React from "react";
import { Copy, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  createClientShareLink,
  type ClientPickerRow,
} from "@/lib/actions/client-shares";

type Props = {
  clients: ClientPickerRow[];
  siteUrl: string;
};

const TTL_OPTIONS = [
  { value: "7", label: "7 días" },
  { value: "30", label: "30 días" },
  { value: "90", label: "90 días" },
  { value: "0", label: "Sin expiración" },
];

export function CreateShareLinkDialog({ clients, siteUrl }: Props) {
  const [open, setOpen] = React.useState(false);
  const [clientId, setClientId] = React.useState<string>("");
  const [ttl, setTtl] = React.useState<string>("30");
  const [generatedUrl, setGeneratedUrl] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setClientId("");
    setTtl("30");
    setGeneratedUrl(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!clientId) {
      toast.error("Selecciona un cliente");
      return;
    }
    startTransition(async () => {
      const res = await createClientShareLink({
        client_id: clientId,
        ttl_days: Number(ttl),
      });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setGeneratedUrl(`${siteUrl}/share/c/${res.token}`);
    });
  }

  async function copy() {
    if (!generatedUrl) return;
    try {
      await navigator.clipboard.writeText(generatedUrl);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo link
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        {generatedUrl ? (
          <>
            <DialogHeader>
              <DialogTitle>Link generado</DialogTitle>
              <DialogDescription>
                Cópialo y compártelo. Puedes revocarlo en cualquier momento.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">
                {generatedUrl}
              </code>
              <Button variant="outline" size="sm" onClick={copy}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Cerrar</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Nuevo link de cliente</DialogTitle>
              <DialogDescription>
                El destinatario verá el cliente, su KAM y contactos
                principales. Sin login requerido.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Cliente</Label>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                      {c.country_name ? (
                        <span className="ml-1 text-muted-foreground">
                          · {c.country_name}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Expira en</Label>
              <Select value={ttl} onValueChange={(v) => setTtl(v ?? "30")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TTL_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={pending || !clientId}>
                {pending ? "Generando…" : "Generar link"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
