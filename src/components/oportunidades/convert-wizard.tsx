"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  convertOpportunityToContract,
  searchClients,
  type OpportunityDetail,
  type VarietyRow,
} from "@/lib/actions/oportunidades";
import type { Database } from "@/lib/database.types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];
type PaymentType = Database["public"]["Enums"]["payment_type"];
const CURRENCIES: CurrencyCode[] = ["USD", "CLP", "EUR"];

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

type Props = {
  opp: OpportunityDetail;
  varieties: Pick<VarietyRow, "id" | "name" | "species_id">[];
  organizationPrefix?: string;
};

type ItemDraft = {
  variety_id: string;
  qty_plants: number;
  unit_price: number;
  currency: CurrencyCode;
  format: string;
  delivery_year: number;
  delivery_week: number;
};

type PaymentSplit = {
  type: PaymentType;
  pct: number;
  due_date: string;
};

const STEPS = ["Cliente", "Items", "Contrato", "Generar"] as const;

export function ConvertWizard({ opp, varieties, organizationPrefix }: Props) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);

  // --- Step 1: Client
  const [clientMode, setClientMode] = React.useState<"existing" | "linked">(
    opp.client_id ? "linked" : "existing",
  );
  const [clientId, setClientId] = React.useState(opp.client_id ?? "");
  const [clientLabel, setClientLabel] = React.useState(
    opp.client?.name ?? opp.client_name_raw ?? "",
  );
  const [clientQuery, setClientQuery] = React.useState("");
  const [clientResults, setClientResults] = React.useState<
    { id: string; name: string }[]
  >([]);

  const debouncedClientQuery = useDebouncedValue(clientQuery, 200);
  React.useEffect(() => {
    let cancelled = false;
    const q = debouncedClientQuery.trim();
    (async () => {
      if (q.length < 2) {
        if (!cancelled) setClientResults([]);
        return;
      }
      try {
        const res = await searchClients(q);
        if (!cancelled) setClientResults(res);
      } catch {
        if (!cancelled) setClientResults([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedClientQuery]);

  // --- Step 2: Items
  const [items, setItems] = React.useState<ItemDraft[]>(() =>
    opp.items.map((it) => ({
      variety_id: it.variety_id,
      qty_plants: it.qty_plants_est,
      unit_price: it.unit_price_est ?? 0,
      currency: (it.currency ?? opp.currency) as CurrencyCode,
      format: it.format ?? "",
      delivery_year: it.expected_delivery_year ?? new Date().getFullYear(),
      delivery_week: it.expected_delivery_week ?? 1,
    })),
  );

  const totalNeto = React.useMemo(
    () => items.reduce((acc, it) => acc + it.qty_plants * it.unit_price, 0),
    [items],
  );

  // --- Step 3: Contract data
  const [contractNumber, setContractNumber] = React.useState(
    suggestContractNumber(organizationPrefix),
  );
  const [contractCurrency, setContractCurrency] = React.useState<CurrencyCode>(
    opp.currency,
  );
  const [incoterm, setIncoterm] = React.useState("");
  const [signedAt, setSignedAt] = React.useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = React.useState(opp.notes ?? "");
  const [splits, setSplits] = React.useState<PaymentSplit[]>([
    { type: "anticipo_1", pct: 30, due_date: "" },
    { type: "anticipo_2", pct: 30, due_date: "" },
    { type: "saldo", pct: 40, due_date: "" },
  ]);

  // --- Step 4: Submit
  const [submitting, setSubmitting] = React.useState(false);

  const canAdvance = (): boolean => {
    if (step === 0) return Boolean(clientId);
    if (step === 1) return items.length > 0 && items.every((i) => i.qty_plants > 0);
    if (step === 2) {
      const totalPct = splits.reduce((acc, s) => acc + s.pct, 0);
      return Boolean(contractNumber.trim()) && totalPct === 100;
    }
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const payments = splits
        .filter((s) => s.pct > 0)
        .map((s) => ({
          type: s.type,
          amount: (totalNeto * s.pct) / 100,
          currency: contractCurrency,
          due_date: s.due_date || null,
        }));

      const { contractId } = await convertOpportunityToContract(opp.id, {
        client_id: clientId,
        contract_number: contractNumber.trim(),
        currency: contractCurrency,
        incoterm: incoterm.trim() || null,
        signed_at: signedAt || null,
        notes: notes.trim() || null,
        items: items.map((it) => ({
          variety_id: it.variety_id,
          qty_plants: it.qty_plants,
          unit_price: it.unit_price,
          currency: it.currency,
          format: it.format.trim() || null,
          delivery_year: it.delivery_year,
          delivery_week: it.delivery_week,
        })),
        payments,
      });

      toast.success("Contrato creado");
      router.push(`/contratos/${contractId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al convertir",
      );
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2">
        {STEPS.map((label, idx) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <div
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium",
                idx < step
                  ? "bg-primary text-primary-foreground"
                  : idx === step
                    ? "bg-primary/20 text-primary ring-2 ring-primary/40"
                    : "bg-muted text-muted-foreground",
              )}
            >
              {idx < step ? <Check className="h-3 w-3" /> : idx + 1}
            </div>
            <span
              className={cn(
                "text-xs",
                idx === step
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {label}
            </span>
            {idx < STEPS.length - 1 ? (
              <div className="h-px flex-1 bg-border" />
            ) : null}
          </li>
        ))}
      </ol>

      <div className="rounded-xl border bg-card p-4">
        {step === 0 ? (
          <ClientStep
            clientMode={clientMode}
            setClientMode={setClientMode}
            opp={opp}
            clientId={clientId}
            clientLabel={clientLabel}
            clientQuery={clientQuery}
            clientResults={clientResults}
            setClientQuery={setClientQuery}
            onSelectClient={(c) => {
              setClientId(c.id);
              setClientLabel(c.name);
              setClientQuery(c.name);
              setClientResults([]);
            }}
            onClearClient={() => {
              setClientId("");
              setClientLabel("");
              setClientQuery("");
            }}
          />
        ) : null}

        {step === 1 ? (
          <ItemsStep
            items={items}
            varieties={varieties}
            setItems={setItems}
          />
        ) : null}

        {step === 2 ? (
          <ContractStep
            contractNumber={contractNumber}
            setContractNumber={setContractNumber}
            contractCurrency={contractCurrency}
            setContractCurrency={setContractCurrency}
            incoterm={incoterm}
            setIncoterm={setIncoterm}
            signedAt={signedAt}
            setSignedAt={setSignedAt}
            notes={notes}
            setNotes={setNotes}
            splits={splits}
            setSplits={setSplits}
            totalNeto={totalNeto}
          />
        ) : null}

        {step === 3 ? (
          <SummaryStep
            clientLabel={clientLabel}
            items={items}
            contractNumber={contractNumber}
            currency={contractCurrency}
            totalNeto={totalNeto}
            splits={splits}
          />
        ) : null}
      </div>

      <div className="flex items-center justify-between border-t pt-4">
        <Button
          variant="outline"
          onClick={() => {
            if (step === 0) router.back();
            else setStep((s) => s - 1);
          }}
          disabled={submitting}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          {step === 0 ? "Cancelar" : "Atrás"}
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            onClick={() => setStep((s) => s + 1)}
            disabled={!canAdvance() || submitting}
          >
            Siguiente
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "Generando..." : "Generar contrato"}
          </Button>
        )}
      </div>
    </div>
  );
}

function suggestContractNumber(prefix?: string): string {
  const year = new Date().getFullYear();
  const tail = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");
  return `${prefix ?? "C"}-${year}-${tail}`;
}

function ClientStep({
  clientMode,
  setClientMode,
  opp,
  clientId,
  clientLabel,
  clientQuery,
  clientResults,
  setClientQuery,
  onSelectClient,
  onClearClient,
}: {
  clientMode: "existing" | "linked";
  setClientMode: (m: "existing" | "linked") => void;
  opp: OpportunityDetail;
  clientId: string;
  clientLabel: string;
  clientQuery: string;
  clientResults: { id: string; name: string }[];
  setClientQuery: (v: string) => void;
  onSelectClient: (c: { id: string; name: string }) => void;
  onClearClient: () => void;
}) {
  if (opp.client) {
    return (
      <div className="space-y-3">
        <h3 className="text-sm font-medium">Confirmar cliente</h3>
        <div className="rounded-md border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">Cliente vinculado</div>
          <div className="text-sm font-medium">{opp.client.name}</div>
        </div>
        <p className="text-xs text-muted-foreground">
          El contrato se creará bajo este cliente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Vincular o crear cliente</h3>
      <p className="text-xs text-muted-foreground">
        Esta oportunidad era un prospect ({opp.client_name_raw ?? "sin nombre"}).
        Selecciona el cliente final.
      </p>

      <div className="space-y-1.5">
        <Label>Buscar cliente existente</Label>
        <div className="relative">
          <Input
            value={clientQuery}
            onChange={(e) => {
              setClientQuery(e.target.value);
              if (clientLabel) onClearClient();
            }}
            placeholder="Buscar por nombre..."
          />
          {clientResults.length > 0 && !clientLabel ? (
            <ul className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
              {clientResults.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onSelectClient(c)}
                    className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                  >
                    {c.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {clientId ? (
        <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          Cliente seleccionado: <span className="font-medium">{clientLabel}</span>
        </div>
      ) : (
        <div className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
          Crear cliente nuevo se hará desde el módulo de Clientes. Por ahora,
          selecciona uno existente.
        </div>
      )}

      <div className="flex gap-2 text-xs">
        <button
          type="button"
          onClick={() => setClientMode("existing")}
          className={cn(
            "rounded-md border px-2 py-1",
            clientMode === "existing" && "bg-primary/10 border-primary/40",
          )}
        >
          Existente
        </button>
      </div>
    </div>
  );
}

function ItemsStep({
  items,
  varieties,
  setItems,
}: {
  items: ItemDraft[];
  varieties: Pick<VarietyRow, "id" | "name" | "species_id">[];
  setItems: React.Dispatch<React.SetStateAction<ItemDraft[]>>;
}) {
  const addItem = () => {
    setItems((arr) => [
      ...arr,
      {
        variety_id: varieties[0]?.id ?? "",
        qty_plants: 1,
        unit_price: 0,
        currency: "USD",
        format: "",
        delivery_year: new Date().getFullYear(),
        delivery_week: 1,
      },
    ]);
  };

  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    setItems((arr) => arr.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium">Items finales del contrato</h3>
      <p className="text-xs text-muted-foreground">
        Pre-llenado desde los items tentativos. Ajusta cantidad, precio y semana
        antes de generar el contrato.
      </p>

      <div className="space-y-2">
        {items.map((it, idx) => (
          <div
            key={idx}
            className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-2 rounded-md border bg-muted/20 p-2"
          >
            <Select
              value={it.variety_id}
              onValueChange={(v) => {
                if (typeof v === "string") updateItem(idx, { variety_id: v });
              }}
            >
              <SelectTrigger size="sm" className="h-7 text-xs">
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
            <Input
              type="number"
              className="h-7 w-24 text-xs"
              value={it.qty_plants}
              onChange={(e) =>
                updateItem(idx, { qty_plants: Number(e.target.value) })
              }
              placeholder="Qty"
            />
            <Input
              type="number"
              className="h-7 w-24 text-xs"
              value={it.unit_price}
              onChange={(e) =>
                updateItem(idx, { unit_price: Number(e.target.value) })
              }
              placeholder="Precio"
            />
            <Select
              value={it.currency}
              onValueChange={(v) => {
                if (typeof v === "string")
                  updateItem(idx, { currency: v as CurrencyCode });
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
            <Input
              type="number"
              className="h-7 w-20 text-xs"
              value={it.delivery_year}
              onChange={(e) =>
                updateItem(idx, { delivery_year: Number(e.target.value) })
              }
              placeholder="Año"
            />
            <Input
              type="number"
              min={1}
              max={53}
              className="h-7 w-16 text-xs"
              value={it.delivery_week}
              onChange={(e) =>
                updateItem(idx, { delivery_week: Number(e.target.value) })
              }
              placeholder="Sem"
            />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => removeItem(idx)}
              aria-label="Quitar item"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
      </div>

      <Button variant="outline" size="sm" onClick={addItem}>
        + Agregar item
      </Button>
    </div>
  );
}

function ContractStep({
  contractNumber,
  setContractNumber,
  contractCurrency,
  setContractCurrency,
  incoterm,
  setIncoterm,
  signedAt,
  setSignedAt,
  notes,
  setNotes,
  splits,
  setSplits,
  totalNeto,
}: {
  contractNumber: string;
  setContractNumber: (v: string) => void;
  contractCurrency: CurrencyCode;
  setContractCurrency: (v: CurrencyCode) => void;
  incoterm: string;
  setIncoterm: (v: string) => void;
  signedAt: string;
  setSignedAt: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  splits: PaymentSplit[];
  setSplits: React.Dispatch<React.SetStateAction<PaymentSplit[]>>;
  totalNeto: number;
}) {
  const totalPct = splits.reduce((acc, s) => acc + s.pct, 0);

  const updateSplit = (idx: number, patch: Partial<PaymentSplit>) => {
    setSplits((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium">Datos del contrato</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="cn">Número de contrato</Label>
          <Input
            id="cn"
            value={contractNumber}
            onChange={(e) => setContractNumber(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cur">Moneda</Label>
          <Select
            value={contractCurrency}
            onValueChange={(v) => {
              if (typeof v === "string")
                setContractCurrency(v as CurrencyCode);
            }}
          >
            <SelectTrigger id="cur" className="w-full">
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
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="inc">Incoterm</Label>
          <Input
            id="inc"
            value={incoterm}
            onChange={(e) => setIncoterm(e.target.value)}
            placeholder="FOB, CIF, EXW..."
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sa">Fecha firma</Label>
          <Input
            id="sa"
            type="date"
            value={signedAt}
            onChange={(e) => setSignedAt(e.target.value)}
          />
        </div>
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="notes">Notas</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-2 border-t pt-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Splits de pago</div>
          <div
            className={cn(
              "text-xs",
              totalPct === 100
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-destructive",
            )}
          >
            Total: {totalPct}%
          </div>
        </div>
        {splits.map((s, idx) => (
          <div
            key={s.type}
            className="grid grid-cols-[1fr_auto_auto] gap-2 rounded-md border p-2 text-xs"
          >
            <div className="flex items-center gap-2 font-medium">
              {paymentTypeLabel(s.type)}
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                min={0}
                max={100}
                className="h-7 w-16 text-xs"
                value={s.pct}
                onChange={(e) =>
                  updateSplit(idx, { pct: Number(e.target.value) })
                }
              />
              <span>%</span>
            </div>
            <Input
              type="date"
              className="h-7 text-xs"
              value={s.due_date}
              onChange={(e) => updateSplit(idx, { due_date: e.target.value })}
            />
          </div>
        ))}
        <div className="text-xs text-muted-foreground">
          Total neto del contrato: {totalNeto.toLocaleString()} {contractCurrency}
        </div>
      </div>
    </div>
  );
}

function SummaryStep({
  clientLabel,
  items,
  contractNumber,
  currency,
  totalNeto,
  splits,
}: {
  clientLabel: string;
  items: ItemDraft[];
  contractNumber: string;
  currency: CurrencyCode;
  totalNeto: number;
  splits: PaymentSplit[];
}) {
  return (
    <div className="space-y-3 text-sm">
      <h3 className="text-sm font-medium">Confirmar y generar</h3>
      <dl className="space-y-1.5 rounded-md border bg-muted/20 p-3 text-xs">
        <Row label="Cliente" value={clientLabel || "—"} />
        <Row label="Número" value={contractNumber} />
        <Row label="Moneda" value={currency} />
        <Row label="Items" value={`${items.length}`} />
        <Row
          label="Total neto"
          value={`${totalNeto.toLocaleString()} ${currency}`}
        />
        <Row
          label="Pagos"
          value={splits
            .filter((s) => s.pct > 0)
            .map((s) => `${paymentTypeLabel(s.type)}: ${s.pct}%`)
            .join(" / ")}
        />
      </dl>
      <p className="text-xs text-muted-foreground">
        Al generar se creará el contrato + items + pagos. La oportunidad quedará
        marcada como Ganada y vinculada al contrato.
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function paymentTypeLabel(t: PaymentType): string {
  if (t === "anticipo_1") return "Anticipo 1";
  if (t === "anticipo_2") return "Anticipo 2";
  return "Saldo";
}
