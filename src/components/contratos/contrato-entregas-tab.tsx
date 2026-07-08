"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatQty } from "@/components/contratos/format";
import { recordDelivery } from "@/lib/actions/entregas";
import { listClientsForSelect } from "@/lib/actions/clientes";
import type { ContractItemRow } from "@/components/contratos/types";

type Props = {
  contractId: string;
  items: ContractItemRow[];
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ContractEntregasTab({ contractId: _contractId, items }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Resumen por item y registro de remitos.
        </p>
        <RecordDeliveryDialog items={items} />
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variedad</TableHead>
              <TableHead>Año/Semana</TableHead>
              <TableHead className="text-right">Comprometido</TableHead>
              <TableHead className="text-right">Entregado</TableHead>
              <TableHead className="text-right">Pendiente</TableHead>
              <TableHead>Avance</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-muted-foreground"
                >
                  Sin items para entregar.
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => {
                const pending = Math.max(0, it.qty_plants - it.qty_delivered);
                const pct =
                  it.qty_plants > 0
                    ? Math.min(
                        100,
                        Math.round((it.qty_delivered / it.qty_plants) * 100),
                      )
                    : 0;
                return (
                  <TableRow key={it.id}>
                    <TableCell>{it.variety_name ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {it.delivery_year} · W{it.delivery_week}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(it.qty_plants)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(it.qty_delivered)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatQty(pending)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-primary"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {pct}%
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">
        Para ver el historial completo de entregas, consulta el módulo
        cross-contrato en{" "}
        <span className="font-mono">/contratos/entregas</span>.
      </p>
      {/* TODO: surface delivery history inline once Sprint 4 deliveries table is wired. */}
    </div>
  );
}

function RecordDeliveryDialog({ items }: { items: ContractItemRow[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [itemId, setItemId] = React.useState<string>("");
  const [qty, setQty] = React.useState<string>("");
  const [deliveredAt, setDeliveredAt] = React.useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [remito, setRemito] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);
  // Despacho a un cliente distinto del que paga (override por entrega).
  const [shipToOther, setShipToOther] = React.useState(false);
  const [shipToClientId, setShipToClientId] = React.useState<string>("");
  const [shipToAddress, setShipToAddress] = React.useState<string>("");
  const [clientOptions, setClientOptions] = React.useState<
    { id: string; name: string }[] | null
  >(null);

  // Carga lazy del listado de clientes la primera vez que se abre el dialog.
  React.useEffect(() => {
    if (!open || clientOptions !== null) return;
    listClientsForSelect()
      .then(setClientOptions)
      .catch(() => setClientOptions([]));
  }, [open, clientOptions]);

  const handleSubmit = async () => {
    if (!itemId || !qty || Number(qty) <= 0) {
      toast.error("Selecciona item y cantidad");
      return;
    }
    setSaving(true);
    try {
      await recordDelivery({
        contractItemId: itemId,
        qty: Number(qty),
        deliveredAt: new Date(deliveredAt).toISOString(),
        remitoNumber: remito || null,
        notes: notes || null,
        shipToClientId: shipToOther && shipToClientId ? shipToClientId : null,
        shipToAddress: shipToOther && shipToAddress ? shipToAddress : null,
      });
      toast.success("Entrega registrada");
      setOpen(false);
      setItemId("");
      setQty("");
      setRemito("");
      setNotes("");
      setShipToOther(false);
      setShipToClientId("");
      setShipToAddress("");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" disabled={items.length === 0}>
            <Plus className="h-3.5 w-3.5" />
            Registrar entrega
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            <span className="inline-flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Nueva entrega
            </span>
          </DialogTitle>
          <DialogDescription>
            Asocia la entrega a una línea del contrato.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Item</Label>
            <Select
              value={itemId}
              onValueChange={(v) => setItemId(String(v ?? ""))}
            >
              <SelectTrigger className="h-9 w-full">
                <SelectValue placeholder="Selecciona item" />
              </SelectTrigger>
              <SelectContent>
                {items.map((it) => (
                  <SelectItem key={it.id} value={it.id}>
                    {it.variety_name ?? "Variedad"} · {it.delivery_year}/W
                    {it.delivery_week} · pendiente{" "}
                    {Math.max(0, it.qty_plants - it.qty_delivered)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qty">Cantidad</Label>
              <Input
                id="qty"
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delivered">Fecha</Label>
              <Input
                id="delivered"
                type="date"
                value={deliveredAt}
                onChange={(e) => setDeliveredAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="remito">N° remito (opcional)</Label>
            <Input
              id="remito"
              value={remito}
              onChange={(e) => setRemito(e.target.value)}
            />
          </div>
          <div className="space-y-2 rounded-md border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={shipToOther}
                onChange={(e) => {
                  setShipToOther(e.target.checked);
                  if (!e.target.checked) {
                    setShipToClientId("");
                    setShipToAddress("");
                  }
                }}
                className="h-4 w-4 accent-primary"
              />
              Despachar a otro cliente
            </label>
            {shipToOther ? (
              <>
                <Select
                  value={shipToClientId}
                  onValueChange={(v) => setShipToClientId(String(v ?? ""))}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue
                      placeholder={
                        clientOptions === null
                          ? "Cargando clientes..."
                          : "Selecciona cliente de despacho"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(clientOptions ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  value={shipToAddress}
                  onChange={(e) => setShipToAddress(e.target.value)}
                  placeholder="Dirección de despacho (opcional)"
                />
              </>
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones..."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? "Guardando..." : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

