"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

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
import {
  createOpportunityItem,
  deleteOpportunityItem,
  updateOpportunityItem,
  type OpportunityDetail,
  type VarietyRow,
} from "@/lib/actions/oportunidades";
import type { Database } from "@/lib/database.types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];
const CURRENCIES: CurrencyCode[] = ["USD", "CLP", "EUR"];

type ItemRow = OpportunityDetail["items"][number];

type Props = {
  opp: OpportunityDetail;
  varieties: Pick<VarietyRow, "id" | "name" | "species_id">[];
};

export function ItemsTab({ opp, varieties }: Props) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);

  return (
    <div className="space-y-3 rounded-xl border bg-card">
      <div className="flex items-center justify-between px-3 py-2">
        <h3 className="text-sm font-medium">Items tentativos</h3>
        <Button size="sm" onClick={() => setAdding(true)}>
          <Plus className="h-3.5 w-3.5" />
          Agregar item
        </Button>
      </div>

      <div className="border-t">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30 hover:bg-muted/30">
              <TableHead className="h-8 text-xs">Variedad</TableHead>
              <TableHead className="h-8 text-xs">Qty (est)</TableHead>
              <TableHead className="h-8 text-xs">Formato</TableHead>
              <TableHead className="h-8 text-xs">Precio unit</TableHead>
              <TableHead className="h-8 text-xs">Moneda</TableHead>
              <TableHead className="h-8 text-xs">Año</TableHead>
              <TableHead className="h-8 text-xs">Semana</TableHead>
              <TableHead className="h-8 w-10 text-xs" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {opp.items.map((item) => (
              <ItemRowEditor
                key={item.id}
                item={item}
                varieties={varieties}
                onUpdate={() => router.refresh()}
              />
            ))}
            {adding ? (
              <NewItemRow
                opportunityId={opp.id}
                varieties={varieties}
                onCancel={() => setAdding(false)}
                onCreated={() => {
                  setAdding(false);
                  router.refresh();
                }}
              />
            ) : null}
            {opp.items.length === 0 && !adding ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-xs text-muted-foreground"
                >
                  Sin items aún.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function ItemRowEditor({
  item,
  varieties,
  onUpdate,
}: {
  item: ItemRow;
  varieties: Pick<VarietyRow, "id" | "name" | "species_id">[];
  onUpdate: () => void;
}) {
  const [qty, setQty] = React.useState(String(item.qty_plants_est));
  const [format, setFormat] = React.useState(item.format ?? "");
  const [price, setPrice] = React.useState(
    item.unit_price_est !== null ? String(item.unit_price_est) : "",
  );
  const [currency, setCurrency] = React.useState<CurrencyCode | "">(
    item.currency ?? "",
  );
  const [year, setYear] = React.useState(
    item.expected_delivery_year !== null
      ? String(item.expected_delivery_year)
      : "",
  );
  const [week, setWeek] = React.useState(
    item.expected_delivery_week !== null
      ? String(item.expected_delivery_week)
      : "",
  );
  const [varietyId, setVarietyId] = React.useState(item.variety_id);

  const handleBlur = async () => {
    const patch = {
      variety_id: varietyId,
      qty_plants_est: Number(qty) || 0,
      format: format.trim() || null,
      unit_price_est: price ? Number(price) : null,
      currency: (currency || null) as CurrencyCode | null,
      expected_delivery_year: year ? Number(year) : null,
      expected_delivery_week: week ? Number(week) : null,
    };
    try {
      await updateOpportunityItem(item.id, patch);
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al actualizar");
    }
  };

  const handleDelete = async () => {
    try {
      await deleteOpportunityItem(item.id);
      toast.success("Item eliminado");
      onUpdate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al eliminar");
    }
  };

  return (
    <TableRow>
      <TableCell className="py-1.5">
        <Select
          value={varietyId}
          onValueChange={(v) => {
            if (typeof v === "string") {
              setVarietyId(v);
            }
          }}
        >
          <SelectTrigger size="sm" className="h-7 w-full max-w-[180px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {varieties.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          type="number"
          className="h-7 w-24 text-xs"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onBlur={handleBlur}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          className="h-7 w-24 text-xs"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
          onBlur={handleBlur}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          type="number"
          className="h-7 w-24 text-xs"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          onBlur={handleBlur}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Select
          value={currency || ""}
          onValueChange={(v) => {
            if (typeof v === "string") setCurrency(v as CurrencyCode);
          }}
        >
          <SelectTrigger size="sm" className="h-7 w-20 text-xs">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          type="number"
          className="h-7 w-20 text-xs"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          onBlur={handleBlur}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          type="number"
          min={1}
          max={53}
          className="h-7 w-16 text-xs"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
          onBlur={handleBlur}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={handleDelete}
          aria-label="Eliminar"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </TableCell>
    </TableRow>
  );
}

function NewItemRow({
  opportunityId,
  varieties,
  onCancel,
  onCreated,
}: {
  opportunityId: string;
  varieties: Pick<VarietyRow, "id" | "name" | "species_id">[];
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [varietyId, setVarietyId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [format, setFormat] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [currency, setCurrency] = React.useState<CurrencyCode>("USD");
  const [year, setYear] = React.useState(String(new Date().getFullYear()));
  const [week, setWeek] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    if (!varietyId) {
      toast.error("Selecciona una variedad");
      return;
    }
    if (!qty || Number(qty) <= 0) {
      toast.error("Indica una cantidad válida");
      return;
    }
    setSaving(true);
    try {
      await createOpportunityItem(opportunityId, {
        variety_id: varietyId,
        qty_plants_est: Number(qty),
        format: format.trim() || null,
        unit_price_est: price ? Number(price) : null,
        currency,
        expected_delivery_year: year ? Number(year) : null,
        expected_delivery_week: week ? Number(week) : null,
      });
      toast.success("Item agregado");
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear");
    } finally {
      setSaving(false);
    }
  };

  return (
    <TableRow className="bg-primary/5">
      <TableCell className="py-1.5">
        <Select
          value={varietyId}
          onValueChange={(v) => {
            if (typeof v === "string") setVarietyId(v);
          }}
        >
          <SelectTrigger size="sm" className="h-7 w-full max-w-[180px] text-xs">
            <SelectValue placeholder="Variedad" />
          </SelectTrigger>
          <SelectContent>
            {varieties.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          type="number"
          className="h-7 w-24 text-xs"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          className="h-7 w-24 text-xs"
          value={format}
          onChange={(e) => setFormat(e.target.value)}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          type="number"
          className="h-7 w-24 text-xs"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Select
          value={currency}
          onValueChange={(v) => {
            if (typeof v === "string") setCurrency(v as CurrencyCode);
          }}
        >
          <SelectTrigger size="sm" className="h-7 w-20 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          type="number"
          className="h-7 w-20 text-xs"
          value={year}
          onChange={(e) => setYear(e.target.value)}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <Input
          type="number"
          min={1}
          max={53}
          className="h-7 w-16 text-xs"
          value={week}
          onChange={(e) => setWeek(e.target.value)}
        />
      </TableCell>
      <TableCell className="py-1.5">
        <div className="flex gap-1">
          <Button size="xs" onClick={handleSave} disabled={saving}>
            ✓
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={onCancel}
            disabled={saving}
          >
            ✕
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
