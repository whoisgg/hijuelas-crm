"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Loader2, Pencil, Share2 } from "lucide-react";

import { softDeleteClientAction } from "@/lib/actions/clientes";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type Props = {
  clientId: string;
  onEdit?: () => void;
};

export function ClienteHeaderActions({ clientId, onEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const handleArchive = () => {
    const confirmed = window.confirm(
      "¿Archivar cliente? Quedará oculto pero podés recuperarlo después.",
    );
    if (!confirmed) return;
    startTransition(async () => {
      const res = await softDeleteClientAction(clientId);
      if (res.ok) {
        toast.success("Cliente archivado");
        router.push("/clientes");
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="sm" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
        Editar
      </Button>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button variant="ghost" size="icon-sm" disabled aria-label="Compartir">
              <Share2 className="h-4 w-4" />
            </Button>
          }
        />
        <TooltipContent>Compartir (próximamente)</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={handleArchive}
              disabled={pending}
              aria-label="Archivar"
            >
              {pending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Archive className="h-4 w-4" />
              )}
            </Button>
          }
        />
        <TooltipContent>Archivar cliente</TooltipContent>
      </Tooltip>
    </div>
  );
}
