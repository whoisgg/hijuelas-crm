"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  oppName: string;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConvertConfirmDialog({
  open,
  oppName,
  onClose,
  onConfirm,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convertir a contrato</DialogTitle>
          <DialogDescription>
            La oportunidad &quot;{oppName}&quot; se moverá a Ganada y abriremos
            el wizard de conversión a contrato.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={onConfirm}>Abrir wizard</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
