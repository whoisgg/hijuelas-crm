"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileEdit, Plus, MinusCircle, Pencil } from "lucide-react";

import type { Database } from "@/lib/database.types";
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
  addContractItem,
  modifyContractItem,
  withdrawContractItem,
} from "@/lib/actions/contratos";
import type { ContractItemRow } from "@/components/contratos/types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];

type Props = {
  contractId: string;
  contractCurrency: CurrencyCode;
  items: ContractItemRow[];
  varieties: { id: string; name: string }[];
};

type Mode = "menu" | "withdraw" | "modify" | "add";

export function ContratoModifyDialog({
  contractId,
  contractCurrency,
  items,
  varieties,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [mode, setMode] = React.useState<Mode>("menu");

  const reset = () => {
    setMode("menu");
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  const onSaved = () => {
    router.refresh();
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm">
            <FileEdit className="h-3.5 w-3.5" />
            Modificar contrato
          </Button>
        }
      />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Modificar contrato</DialogTitle>
          <DialogDescription>
            Cada modificación queda registrada como amendment con motivo y
            actor.
          </DialogDescription>
        </DialogHeader>

        {mode === "menu" ? (
          <div className="grid gap-2">
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setMode("withdraw")}
              disabled={items.length === 0}
            >
              <MinusCircle className="h-4 w-4" />
              Desistir item(s)
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setMode("modify")}
              disabled={items.length === 0}
            >
              <Pencil className="h-4 w-4" />
              Modificar item
            </Button>
            <Button
              variant="outline"
              className="justify-start"
              onClick={() => setMode("add")}
            >
              <Plus className="h-4 w-4" />
              Agregar item
            </Button>
          </div>
        ) : null}

        {mode === "withdraw" ? (
          <WithdrawForm items={items} onCancel={close} onSaved={onSaved} />
        ) : null}
        {mode === "modify" ? (
          <ModifyForm items={items} onCancel={close} onSaved={onSaved} />
        ) : null}
        {mode === "add" ? (
          <AddForm
            contractId={contractId}
            currency={contractCurrency}
            varieties={varieties}
            onCancel={close}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function WithdrawForm({
  items,
  onCancel,
  onSaved,
}: {
  items: ContractItemRow[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = React.useState<string[]>([]);
  const [reason, setReason] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSubmit = async () => {
    if (selected.length === 0) {
      toast.error("Selecciona al menos un item");
      return;
    }
    if (!reason.trim()) {
      toast.error("Ingresa motivo");
      return;
    }
    setSaving(true);
    try {
      for (const id of selected) {
        await withdrawContractItem(id, reason.trim());
      }
      toast.success(`Items desistidos: ${selected.length}`);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  const activeItems = items.filter((it) => it.status !== "eliminado");

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Items a desistir</Label>
        <div className="max-h-60 space-y-1 overflow-y-auto rounded-md border p-2">
          {activeItems.length === 0 ? (
            <p className="py-3 text-center text-xs text-muted-foreground">
              Sin items activos.
            </p>
          ) : (
            activeItems.map((it) => (
              <label
                key={it.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
              >
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selected.includes(it.id)}
                  onChange={() => toggle(it.id)}
                />
                <span className="flex-1">
                  {it.variety_name ?? "—"} · {it.delivery_year}/W
                  {it.delivery_week} · {it.qty_plants} pl
                </span>
              </label>
            ))
          )}
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="withdraw-reason">Motivo</Label>
        <Textarea
          id="withdraw-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Cliente solicita retirar este item porque..."
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Aplicando..." : "Desistir"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function ModifyForm({
  items,
  onCancel,
  onSaved,
}: {
  items: ContractItemRow[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const activeItems = items.filter((it) => it.status !== "eliminado");
  const [itemId, setItemId] = React.useState<string>("");
  const [qty, setQty] = React.useState<string>("");
  const [price, setPrice] = React.useState<string>("");
  const [year, setYear] = React.useState<string>("");
  const [week, setWeek] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  const handleItemChange = (id: string) => {
    setItemId(id);
    const it = activeItems.find((x) => x.id === id);
    if (it) {
      setQty(String(it.qty_plants));
      setPrice(String(it.unit_price));
      setYear(String(it.delivery_year));
      setWeek(String(it.delivery_week));
    }
  };

  const handleSubmit = async () => {
    if (!itemId) {
      toast.error("Selecciona item");
      return;
    }
    if (!reason.trim()) {
      toast.error("Ingresa motivo");
      return;
    }
    setSaving(true);
    try {
      await modifyContractItem(
        itemId,
        {
          qty_plants: Number(qty),
          unit_price: Number(price),
          delivery_year: Number(year),
          delivery_week: Number(week),
        },
        reason.trim(),
      );
      toast.success("Item modificado");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Item</Label>
        <Select value={itemId} onValueChange={(v) => handleItemChange(String(v ?? ""))}>
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Selecciona item" />
          </SelectTrigger>
          <SelectContent>
            {activeItems.map((it) => (
              <SelectItem key={it.id} value={it.id}>
                {it.variety_name ?? "Variedad"} · {it.delivery_year}/W
                {it.delivery_week}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Qty plantas</Label>
          <Input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Precio unitario</Label>
          <Input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Año entrega</Label>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Semana entrega</Label>
          <Input
            type="number"
            min="1"
            max="53"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="modify-reason">Motivo</Label>
        <Textarea
          id="modify-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Cambio acordado con el cliente porque..."
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Aplicando..." : "Modificar"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function AddForm({
  contractId,
  currency,
  varieties,
  onCancel,
  onSaved,
}: {
  contractId: string;
  currency: CurrencyCode;
  varieties: { id: string; name: string }[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [varietyId, setVarietyId] = React.useState<string>("");
  const [qty, setQty] = React.useState<string>("");
  const [price, setPrice] = React.useState<string>("");
  const [year, setYear] = React.useState<string>(
    String(new Date().getFullYear()),
  );
  const [week, setWeek] = React.useState<string>("1");
  const [format, setFormat] = React.useState<string>("");
  const [reason, setReason] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  const handleSubmit = async () => {
    if (!varietyId || !qty || Number(qty) <= 0 || !price || Number(price) <= 0) {
      toast.error("Completa variedad, cantidad y precio");
      return;
    }
    if (!reason.trim()) {
      toast.error("Ingresa motivo");
      return;
    }
    setSaving(true);
    try {
      await addContractItem(
        contractId,
        {
          varietyId,
          qtyPlants: Number(qty),
          unitPrice: Number(price),
          currency,
          deliveryYear: Number(year),
          deliveryWeek: Number(week),
          format: format || null,
        },
        reason.trim(),
      );
      toast.success("Item agregado");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Variedad</Label>
        <Select
          value={varietyId}
          onValueChange={(v) => setVarietyId(String(v ?? ""))}
        >
          <SelectTrigger className="h-9 w-full">
            <SelectValue placeholder="Selecciona variedad" />
          </SelectTrigger>
          <SelectContent>
            {varieties.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Qty plantas</Label>
          <Input
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Precio unitario ({currency})</Label>
          <Input
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Año entrega</Label>
          <Input
            type="number"
            value={year}
            onChange={(e) => setYear(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Semana entrega</Label>
          <Input
            type="number"
            min="1"
            max="53"
            value={week}
            onChange={(e) => setWeek(e.target.value)}
          />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Formato (opcional)</Label>
          <Input value={format} onChange={(e) => setFormat(e.target.value)} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="add-reason">Motivo</Label>
        <Textarea
          id="add-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Item adicional solicitado por el cliente..."
        />
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={saving}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? "Aplicando..." : "Agregar"}
        </Button>
      </DialogFooter>
    </div>
  );
}
