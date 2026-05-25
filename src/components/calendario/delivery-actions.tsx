"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarRange, Loader2, Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  deleteContractItem,
  updateContractItem,
} from "@/lib/actions/contratos";

type Props = {
  /** ID del contract_item (NO del contrato). */
  itemId: string;
  qty: number;
  year: number;
  week: number;
  clientName: string | null;
  varietyName: string | null;
  /** Callback opcional para cerrar el side-sheet padre tras una acción. */
  onAfter?: () => void;
};

type Mode = null | "qty" | "date" | "delete";

/**
 * Botones de acción para items del side-sheet del calendario:
 * - Reagendar (cambia delivery_year/week)
 * - Cantidad (cambia qty_plants)
 * - Borrar (soft-delete con confirm)
 *
 * Todas las acciones revalidan el calendario y el contrato padre vía
 * server actions, así que `router.refresh()` propaga los cambios a toda
 * la UI (calendar grid, contratos list, KAM, etc).
 */
export function DeliveryActions({
  itemId,
  qty,
  year,
  week,
  clientName,
  varietyName,
  onAfter,
}: Props) {
  const router = useRouter();
  const [mode, setMode] = React.useState<Mode>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Form state
  const [qtyInput, setQtyInput] = React.useState(String(qty));
  const [yearInput, setYearInput] = React.useState(String(year));
  const [weekInput, setWeekInput] = React.useState(String(week));

  const close = () => {
    if (submitting) return;
    setMode(null);
  };

  const openQty = () => {
    setQtyInput(String(qty));
    setMode("qty");
  };
  const openDate = () => {
    setYearInput(String(year));
    setWeekInput(String(week));
    setMode("date");
  };
  const openDelete = () => setMode("delete");

  const onAfterSuccess = () => {
    setMode(null);
    setSubmitting(false);
    onAfter?.();
    router.refresh();
  };

  const saveQty = async () => {
    const n = Number(qtyInput);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("Cantidad inválida");
      return;
    }
    setSubmitting(true);
    try {
      await updateContractItem(itemId, { qty_plants: n });
      toast.success(`Cantidad actualizada a ${n.toLocaleString("es-CL")}`);
      onAfterSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
      setSubmitting(false);
    }
  };

  const saveDate = async () => {
    const y = Number(yearInput);
    const w = Number(weekInput);
    if (!Number.isInteger(y) || y < 2020 || y > 2100) {
      toast.error("Año inválido");
      return;
    }
    if (!Number.isInteger(w) || w < 1 || w > 53) {
      toast.error("Semana ISO inválida (1–53)");
      return;
    }
    setSubmitting(true);
    try {
      await updateContractItem(itemId, {
        delivery_year: y,
        delivery_week: w,
      });
      toast.success(`Entrega movida a Wk${w}/${y}`);
      onAfterSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    setSubmitting(true);
    try {
      await deleteContractItem(itemId);
      toast.success("Entrega borrada");
      onAfterSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={openDate}
          title="Reagendar"
          aria-label="Reagendar entrega"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <CalendarRange className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={openQty}
          title="Editar cantidad"
          aria-label="Editar cantidad"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={openDelete}
          title="Borrar entrega"
          aria-label="Borrar entrega"
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <Dialog open={mode !== null} onOpenChange={(o) => !o && close()}>
        <DialogContent>
          {mode === "qty" ? (
            <>
              <DialogHeader>
                <DialogTitle>Editar cantidad</DialogTitle>
                <DialogDescription>
                  {clientName ? `${clientName} · ` : ""}
                  {varietyName ?? "—"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="qty">Plantas</Label>
                  <Input
                    id="qty"
                    type="number"
                    min="0"
                    step="1"
                    value={qtyInput}
                    onChange={(e) => setQtyInput(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={close} disabled={submitting}>
                  Cancelar
                </Button>
                <Button onClick={saveQty} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    "Guardar"
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {mode === "date" ? (
            <>
              <DialogHeader>
                <DialogTitle>Reagendar entrega</DialogTitle>
                <DialogDescription>
                  Cambiar año + semana ISO. Actualiza el calendario y todos los
                  reportes asociados.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="year">Año</Label>
                  <Input
                    id="year"
                    type="number"
                    min="2020"
                    max="2100"
                    step="1"
                    value={yearInput}
                    onChange={(e) => setYearInput(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="week">Semana ISO</Label>
                  <Input
                    id="week"
                    type="number"
                    min="1"
                    max="53"
                    step="1"
                    value={weekInput}
                    onChange={(e) => setWeekInput(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={close} disabled={submitting}>
                  Cancelar
                </Button>
                <Button onClick={saveDate} disabled={submitting}>
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Guardando…
                    </>
                  ) : (
                    "Reagendar"
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : null}

          {mode === "delete" ? (
            <>
              <DialogHeader>
                <DialogTitle>¿Borrar esta entrega?</DialogTitle>
                <DialogDescription>
                  {clientName ? `${clientName} · ` : ""}
                  {varietyName ?? "—"} · {qty.toLocaleString("es-CL")} plantas ·
                  Wk{week}/{year}
                  <br />
                  Se oculta del calendario y los reportes. El total del
                  contrato se recalcula automáticamente.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={close} disabled={submitting}>
                  Cancelar
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  disabled={submitting}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Borrando…
                    </>
                  ) : (
                    "Borrar entrega"
                  )}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
