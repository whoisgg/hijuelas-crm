"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

const REASONS = ["Precio", "Competencia", "Timing", "Fit", "Otro"] as const;
type ReasonKey = (typeof REASONS)[number];

type Props = {
  open: boolean;
  oppName: string;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

export function LostReasonDialog({ open, oppName, onClose, onConfirm }: Props) {
  const [reason, setReason] = React.useState<ReasonKey>("Precio");
  const [details, setDetails] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const handleSubmit = async () => {
    setSubmitting(true);
    const payload = details.trim()
      ? `${reason}: ${details.trim()}`
      : reason;
    try {
      await onConfirm(payload);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar como perdida</DialogTitle>
          <DialogDescription>
            ¿Por qué se perdió la oportunidad &quot;{oppName}&quot;?
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lost-reason">Motivo</Label>
            <Select
              value={reason}
              onValueChange={(v) => {
                if (typeof v === "string") setReason(v as ReasonKey);
              }}
            >
              <SelectTrigger id="lost-reason" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lost-details">Detalle (opcional)</Label>
            <Textarea
              id="lost-details"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Por qué perdimos? contra quién?"
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? "Guardando..." : "Marcar perdida"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
