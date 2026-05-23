"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DeliveryStatusBadge } from "@/components/contratos/status-badge";
import { formatMoney, formatQty } from "@/components/contratos/format";
import { updateContractItem } from "@/lib/actions/contratos";
import type { ContractItemRow } from "@/components/contratos/types";
import type { Database } from "@/lib/database.types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];
const CURRENCY_OPTIONS: CurrencyCode[] = ["CLP", "USD", "EUR"];

type Props = {
  contractId: string;
  items: ContractItemRow[];
  varieties: { id: string; name: string }[];
};

type Draft = {
  qty_plants: string;
  unit_price: string;
  currency: CurrencyCode;
  delivery_year: string;
  delivery_week: string;
};

export function ContractItemsTab({ items }: Props) {
  const router = useRouter();
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [saving, setSaving] = React.useState(false);

  const beginEdit = (item: ContractItemRow) => {
    setEditingId(item.id);
    setDraft({
      qty_plants: String(item.qty_plants),
      unit_price: String(item.unit_price),
      currency: item.currency as CurrencyCode,
      delivery_year: String(item.delivery_year),
      delivery_week: String(item.delivery_week),
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(null);
  };

  const handleSave = async (id: string) => {
    if (!draft) return;
    setSaving(true);
    try {
      await updateContractItem(id, {
        qty_plants: Number(draft.qty_plants),
        unit_price: Number(draft.unit_price),
        currency: draft.currency,
        delivery_year: Number(draft.delivery_year),
        delivery_week: Number(draft.delivery_week),
      });
      toast.success("Item actualizado");
      setEditingId(null);
      setDraft(null);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
        Este contrato aún no tiene líneas. Usa &ldquo;Modificar contrato&rdquo; →
        &ldquo;Agregar item&rdquo; para sumar plantas.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Variedad</TableHead>
            <TableHead className="text-right">Comprometido</TableHead>
            <TableHead className="text-right">Entregado</TableHead>
            <TableHead>Avance</TableHead>
            <TableHead className="text-right">Precio</TableHead>
            <TableHead>Moneda</TableHead>
            <TableHead className="text-right">Año</TableHead>
            <TableHead className="text-right">Semana</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((it) => {
            const isEditing = editingId === it.id;
            const pct =
              it.qty_plants > 0
                ? Math.min(100, Math.round((it.qty_delivered / it.qty_plants) * 100))
                : 0;
            return (
              <TableRow key={it.id}>
                <TableCell>
                  <div>
                    <p className="font-medium">{it.variety_name ?? "—"}</p>
                    {it.format ? (
                      <p className="text-xs text-muted-foreground">{it.format}</p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {isEditing && draft ? (
                    <Input
                      type="number"
                      value={draft.qty_plants}
                      onChange={(e) =>
                        setDraft({ ...draft, qty_plants: e.target.value })
                      }
                      className="h-7 w-24 text-right"
                    />
                  ) : (
                    formatQty(it.qty_plants)
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatQty(it.qty_delivered)}
                </TableCell>
                <TableCell className="min-w-32">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
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
                <TableCell className="text-right tabular-nums">
                  {isEditing && draft ? (
                    <Input
                      type="number"
                      step="0.01"
                      value={draft.unit_price}
                      onChange={(e) =>
                        setDraft({ ...draft, unit_price: e.target.value })
                      }
                      className="h-7 w-24 text-right"
                    />
                  ) : (
                    formatMoney(it.unit_price, it.currency)
                  )}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {isEditing && draft ? (
                    <Select
                      value={draft.currency}
                      onValueChange={(v) =>
                        setDraft({ ...draft, currency: v as CurrencyCode })
                      }
                    >
                      <SelectTrigger className="h-7 w-20">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCY_OPTIONS.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    it.currency
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isEditing && draft ? (
                    <Input
                      type="number"
                      value={draft.delivery_year}
                      onChange={(e) =>
                        setDraft({ ...draft, delivery_year: e.target.value })
                      }
                      className="h-7 w-20 text-right"
                    />
                  ) : (
                    it.delivery_year
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {isEditing && draft ? (
                    <Input
                      type="number"
                      min="1"
                      max="53"
                      value={draft.delivery_week}
                      onChange={(e) =>
                        setDraft({ ...draft, delivery_week: e.target.value })
                      }
                      className="h-7 w-16 text-right"
                    />
                  ) : (
                    it.delivery_week
                  )}
                </TableCell>
                <TableCell>
                  <DeliveryStatusBadge status={it.status} />
                </TableCell>
                <TableCell>
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleSave(it.id)}
                        disabled={saving}
                        aria-label="Guardar"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={cancelEdit}
                        disabled={saving}
                        aria-label="Cancelar"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => beginEdit(it)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
