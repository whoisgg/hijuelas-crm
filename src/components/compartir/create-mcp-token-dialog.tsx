"use client";

import * as React from "react";
import { Copy, Plus, AlertTriangle } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMcpToken } from "@/lib/actions/mcp-tokens";

export function CreateMcpTokenDialog() {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [plaintext, setPlaintext] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();

  function reset() {
    setName("");
    setPlaintext(null);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Dale un nombre al token");
      return;
    }
    startTransition(async () => {
      const res = await createMcpToken({ name: name.trim() });
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setPlaintext(res.plaintext);
    });
  }

  async function copyToken() {
    if (!plaintext) return;
    try {
      await navigator.clipboard.writeText(plaintext);
      toast.success("Token copiado");
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
            Nuevo token
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        {plaintext ? (
          <>
            <DialogHeader>
              <DialogTitle>Token generado</DialogTitle>
              <DialogDescription>
                Cópialo ahora — no se podrá ver de nuevo.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <p>
                    Este es el único momento en que se muestra el plaintext. Si
                    lo pierdes, revoca el token y crea uno nuevo.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">
                  {plaintext}
                </code>
                <Button variant="outline" size="sm" onClick={copyToken}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" />
                  Copiar
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Ya lo guardé</Button>
            </DialogFooter>
          </>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Nuevo token MCP</DialogTitle>
              <DialogDescription>
                Dale un nombre descriptivo (ej: &ldquo;Laptop personal&rdquo;,
                &ldquo;Claude Code&rdquo;) para reconocerlo después.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="token-name">Nombre</Label>
              <Input
                id="token-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Laptop personal"
                autoFocus
                disabled={pending}
              />
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
              <Button type="submit" disabled={pending}>
                {pending ? "Generando…" : "Generar token"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
