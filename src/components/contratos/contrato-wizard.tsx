"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Check,
  Send,
  TriangleAlert,
} from "lucide-react";

import type { Database } from "@/lib/database.types";
import { cn } from "@/lib/utils";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createContract,
  previewContractNumber,
  type ContractItemInput,
  type CreateContractInput,
} from "@/lib/actions/contratos";
import {
  sendContractForSignature,
  getClientSignerInfo,
} from "@/lib/actions/signatures";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];
type ConditionType = Database["public"]["Enums"]["condition_type"];
type SaleType = Database["public"]["Enums"]["sale_type"];

export type ClientOption = { id: string; name: string; tax_id: string | null };
export type OrgOption = {
  id: string;
  name: string;
  contract_prefix: string;
  default_currency: CurrencyCode;
};
export type VarietyOption = {
  id: string;
  name: string;
  royalty_per_plant: number | null;
};

type Props = {
  clients: ClientOption[];
  organizations: OrgOption[];
  varieties: VarietyOption[];
  docusignReady?: boolean;
};

type SignerInfo = {
  hasEmail: boolean;
  name: string | null;
  email: string | null;
  for: string; // clientId al que corresponde este chequeo
};

type ItemDraft = {
  varietyId: string;
  qtyPlants: string;
  unitPrice: string;
  currency: CurrencyCode;
  deliveryYear: string;
  deliveryWeek: string;
  format: string;
};

const STEPS = [
  { id: "cliente", label: "Cliente" },
  { id: "organizacion", label: "Organización" },
  { id: "items", label: "Items" },
  { id: "detalles", label: "Detalles & Anticipos" },
] as const;

const CONDITION_OPTIONS: { value: ConditionType; label: string }[] = [
  { value: "venta", label: "Venta" },
  { value: "reposicion", label: "Reposición" },
  { value: "muestra", label: "Muestra" },
];

const SALE_TYPE_OPTIONS: { value: SaleType; label: string }[] = [
  { value: "nacional", label: "Nacional" },
  { value: "exportacion", label: "Exportación" },
];

const CURRENCIES: CurrencyCode[] = ["CLP", "USD", "EUR"];

function newItem(currency: CurrencyCode): ItemDraft {
  const now = new Date();
  return {
    varietyId: "",
    qtyPlants: "",
    unitPrice: "",
    currency,
    deliveryYear: String(now.getFullYear()),
    deliveryWeek: "1",
    format: "",
  };
}

export function ContratoWizard({
  clients,
  organizations,
  varieties,
  docusignReady = false,
}: Props) {
  const router = useRouter();
  const [stepIndex, setStepIndex] = React.useState(0);
  const [clientId, setClientId] = React.useState<string>("");
  const [organizationId, setOrganizationId] = React.useState<string>("");
  const [previewNumber, setPreviewNumber] = React.useState<string>("");
  const [currency, setCurrency] = React.useState<CurrencyCode>("CLP");
  const [incoterm, setIncoterm] = React.useState<string>("");
  const [condition, setCondition] = React.useState<ConditionType>("venta");
  const [saleType, setSaleType] = React.useState<SaleType>("nacional");
  const [signedAt, setSignedAt] = React.useState<string>("");
  const [fxRateToUsd, setFxRateToUsd] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");
  const [items, setItems] = React.useState<ItemDraft[]>([newItem("CLP")]);
  const [anticipo1, setAnticipo1] = React.useState<string>("");
  const [anticipo2, setAnticipo2] = React.useState<string>("");
  const [saldo, setSaldo] = React.useState<string>("");
  const [anticipo1Due, setAnticipo1Due] = React.useState<string>("");
  const [anticipo2Due, setAnticipo2Due] = React.useState<string>("");
  const [saldoDue, setSaldoDue] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);
  const [signerInfo, setSignerInfo] = React.useState<SignerInfo | null>(null);

  // Chequeo previo: ¿el cliente tiene contacto con email para enviar a firmar?
  // signerInfo se asocia al clientId con el que se resolvió (signerInfo.for) para
  // ignorar resultados de un cliente anterior.
  React.useEffect(() => {
    if (!clientId) return;
    let active = true;
    getClientSignerInfo(clientId)
      .then((info) => {
        if (active) setSignerInfo({ ...info, for: clientId });
      })
      .catch(() => {
        if (active) setSignerInfo({ hasEmail: false, name: null, email: null, for: clientId });
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  const selectedOrg = organizations.find((o) => o.id === organizationId);
  const selectedClient = clients.find((c) => c.id === clientId);
  // Solo válido si el chequeo corresponde al cliente actualmente seleccionado.
  const currentSigner = signerInfo?.for === clientId ? signerInfo : null;
  const canSend = docusignReady && Boolean(currentSigner?.hasEmail);

  const handleOrganizationChange = (id: string) => {
    setOrganizationId(id);
    if (!id) {
      setPreviewNumber("");
      return;
    }
    const org = organizations.find((o) => o.id === id);
    if (org) {
      setCurrency(org.default_currency);
      setItems((prev) =>
        prev.map((it) => ({ ...it, currency: org.default_currency })),
      );
    }
    previewContractNumber(id)
      .then((n) => setPreviewNumber(n))
      .catch(() => setPreviewNumber(""));
  };

  const totalNeto = React.useMemo(() => {
    return items.reduce((acc, it) => {
      const qty = parseFloat(it.qtyPlants);
      const price = parseFloat(it.unitPrice);
      if (!isNaN(qty) && !isNaN(price)) return acc + qty * price;
      return acc;
    }, 0);
  }, [items]);

  const canAdvance = (): boolean => {
    if (stepIndex === 0) return !!clientId;
    if (stepIndex === 1) return !!organizationId;
    if (stepIndex === 2) {
      return items.length > 0 && items.every(itemIsValid);
    }
    return true;
  };

  const addItem = () => {
    setItems((prev) => [...prev, newItem(currency)]);
  };

  const removeItem = (idx: number) => {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateItem = (
    idx: number,
    patch: Partial<ItemDraft>,
  ) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const handleSubmit = async (alsoSend = false) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const itemsPayload: ContractItemInput[] = items.map((it) => ({
        varietyId: it.varietyId,
        qtyPlants: Number(it.qtyPlants),
        unitPrice: Number(it.unitPrice),
        currency: it.currency,
        deliveryYear: Number(it.deliveryYear),
        deliveryWeek: Number(it.deliveryWeek),
        format: it.format || null,
      }));
      const input: CreateContractInput = {
        clientId,
        organizationId,
        currency,
        incoterm: incoterm || null,
        condition,
        saleType,
        signedAt: signedAt || null,
        fxRateToUsd: fxRateToUsd ? Number(fxRateToUsd) : null,
        notes: notes || null,
        items: itemsPayload,
        anticipo1Amount: Number(anticipo1) || 0,
        anticipo2Amount: Number(anticipo2) || 0,
        saldoAmount: Number(saldo) || 0,
        anticipo1DueDate: anticipo1Due || null,
        anticipo2DueDate: anticipo2Due || null,
        saldoDueDate: saldoDue || null,
      };
      const result = await createContract(input);

      if (alsoSend) {
        const sendRes = await sendContractForSignature(result.id);
        if (sendRes.ok) {
          toast.success(`Contrato ${result.number} creado y enviado a firmar`);
        } else {
          toast.warning(
            `Contrato ${result.number} creado como borrador, pero no se envió a firmar: ${sendRes.message}`,
            { duration: 8000 },
          );
        }
      } else {
        toast.success(`Contrato ${result.number} creado`);
      }
      router.push(`/contratos/${result.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al crear contrato";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <ol className="flex items-center gap-2 overflow-x-auto rounded-lg border bg-card px-3 py-2 text-xs">
        {STEPS.map((s, i) => {
          const state =
            i < stepIndex ? "done" : i === stepIndex ? "current" : "pending";
          return (
            <li key={s.id} className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 font-medium",
                  state === "current" && "bg-primary text-primary-foreground",
                  state === "done" && "bg-primary/15 text-primary",
                  state === "pending" && "bg-muted text-muted-foreground",
                )}
              >
                {state === "done" ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  state === "current"
                    ? "font-semibold text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 ? (
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="rounded-lg border bg-card p-4">
        {stepIndex === 0 ? (
          <div className="space-y-3">
            <h3 className="font-medium">Selecciona el cliente</h3>
            <p className="text-sm text-muted-foreground">
              Busca un cliente existente. Si no existe, créalo desde el módulo de
              Clientes.
            </p>
            <ClientSearch
              clients={clients}
              value={clientId}
              onChange={setClientId}
            />
          </div>
        ) : null}

        {stepIndex === 1 ? (
          <div className="space-y-3">
            <h3 className="font-medium">Organización vendedora</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Organización</Label>
                <Select
                  value={organizationId}
                  onValueChange={(v) => handleOrganizationChange(String(v ?? ""))}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue placeholder="Selecciona organización" />
                  </SelectTrigger>
                  <SelectContent>
                    {organizations.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name} ({o.contract_prefix})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Número de contrato</Label>
                <Input
                  value={previewNumber || ""}
                  readOnly
                  placeholder="Se asigna al seleccionar organización"
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Select
                  value={currency}
                  onValueChange={(v) => setCurrency((v ?? "CLP") as CurrencyCode)}
                >
                  <SelectTrigger className="h-9 w-full">
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
              {currency !== "USD" ? (
                <div className="space-y-1.5">
                  <Label>FX a USD (1 USD = X {currency})</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={fxRateToUsd}
                    onChange={(e) => setFxRateToUsd(e.target.value)}
                    placeholder="950"
                  />
                </div>
              ) : null}
            </div>
            {selectedOrg ? (
              <p className="text-xs text-muted-foreground">
                Prefijo:{" "}
                <span className="font-mono">{selectedOrg.contract_prefix}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {stepIndex === 2 ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Líneas del contrato</h3>
              <Button size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3.5 w-3.5" />
                Agregar línea
              </Button>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-48">Variedad</TableHead>
                    <TableHead className="text-right">Qty plantas</TableHead>
                    <TableHead className="text-right">Precio unitario</TableHead>
                    <TableHead>Formato</TableHead>
                    <TableHead className="text-right">Año</TableHead>
                    <TableHead className="text-right">Semana</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((it, idx) => {
                    const subtotal =
                      Number(it.qtyPlants || 0) * Number(it.unitPrice || 0);
                    return (
                      <TableRow key={idx}>
                        <TableCell className="min-w-48 py-1">
                          <Select
                            value={it.varietyId}
                            onValueChange={(v) =>
                              updateItem(idx, { varietyId: String(v ?? "") })
                            }
                          >
                            <SelectTrigger className="h-8 w-full">
                              <SelectValue placeholder="Seleccionar variedad" />
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
                        <TableCell className="py-1 text-right">
                          <Input
                            type="number"
                            min="0"
                            value={it.qtyPlants}
                            onChange={(e) =>
                              updateItem(idx, { qtyPlants: e.target.value })
                            }
                            className="h-8 w-28 text-right"
                          />
                        </TableCell>
                        <TableCell className="py-1 text-right">
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={it.unitPrice}
                            onChange={(e) =>
                              updateItem(idx, { unitPrice: e.target.value })
                            }
                            className="h-8 w-28 text-right"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            value={it.format}
                            onChange={(e) =>
                              updateItem(idx, { format: e.target.value })
                            }
                            placeholder="raíz cubierta"
                            className="h-8 w-32"
                          />
                        </TableCell>
                        <TableCell className="py-1 text-right">
                          <Input
                            type="number"
                            value={it.deliveryYear}
                            onChange={(e) =>
                              updateItem(idx, { deliveryYear: e.target.value })
                            }
                            className="h-8 w-20 text-right"
                          />
                        </TableCell>
                        <TableCell className="py-1 text-right">
                          <Input
                            type="number"
                            min="1"
                            max="53"
                            value={it.deliveryWeek}
                            onChange={(e) =>
                              updateItem(idx, { deliveryWeek: e.target.value })
                            }
                            className="h-8 w-16 text-right"
                          />
                        </TableCell>
                        <TableCell className="py-1 text-right tabular-nums">
                          {subtotal > 0 ? subtotal.toLocaleString("es-CL") : "—"}
                        </TableCell>
                        <TableCell className="py-1">
                          {items.length > 1 ? (
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeItem(idx)}
                              aria-label="Eliminar línea"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <p className="text-right text-sm font-medium">
              Total neto: {totalNeto.toLocaleString("es-CL")} {currency}
            </p>
          </div>
        ) : null}

        {stepIndex === 3 ? (
          <div className="space-y-4">
            <h3 className="font-medium">Detalles del contrato</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Incoterm</Label>
                <Input
                  value={incoterm}
                  onChange={(e) => setIncoterm(e.target.value)}
                  placeholder="EXW / FOB / CIF..."
                />
              </div>
              <div className="space-y-1.5">
                <Label>Condición</Label>
                <Select
                  value={condition}
                  onValueChange={(v) => setCondition((v ?? "venta") as ConditionType)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONDITION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Tipo de venta</Label>
                <Select
                  value={saleType}
                  onValueChange={(v) => setSaleType((v ?? "nacional") as SaleType)}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SALE_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de firma (opcional)</Label>
                <Input
                  type="date"
                  value={signedAt}
                  onChange={(e) => setSignedAt(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observaciones internas..."
              />
            </div>

            <h3 className="pt-2 font-medium">Anticipos y saldo</h3>
            <p className="text-xs text-muted-foreground">
              Total neto calculado: {totalNeto.toLocaleString("es-CL")} {currency}.
              Distribuye en los 3 pagos.
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <PaymentRow
                label="Anticipo 1"
                amount={anticipo1}
                onAmountChange={setAnticipo1}
                dueDate={anticipo1Due}
                onDueDateChange={setAnticipo1Due}
              />
              <PaymentRow
                label="Anticipo 2"
                amount={anticipo2}
                onAmountChange={setAnticipo2}
                dueDate={anticipo2Due}
                onDueDateChange={setAnticipo2Due}
              />
              <PaymentRow
                label="Saldo"
                amount={saldo}
                onAmountChange={setSaldo}
                dueDate={saldoDue}
                onDueDateChange={setSaldoDue}
              />
            </div>
          </div>
        ) : null}
      </div>

      {/* Chequeo previo a "Crear y enviar a firmar" (solo en el último paso). */}
      {stepIndex === STEPS.length - 1 && clientId ? (
        !currentSigner?.hasEmail ? (
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              {selectedClient?.name ?? "El cliente"} no tiene un contacto con
              email. Podés crear el borrador, pero para{" "}
              <strong>enviarlo a firmar</strong> primero agregá un contacto con
              correo en la ficha del cliente.
            </span>
          </div>
        ) : !docusignReady ? (
          <div className="flex items-start gap-2 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>DocuSign no está configurado — solo podés crear el borrador.</span>
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-800 dark:text-emerald-200">
            <Send className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Al enviar a firmar, el contrato irá a{" "}
              <strong>{currentSigner?.email}</strong> vía DocuSign.
            </span>
          </div>
        )
      ) : null}

      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          disabled={stepIndex === 0 || submitting}
          onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
          Atrás
        </Button>
        {stepIndex < STEPS.length - 1 ? (
          <Button
            disabled={!canAdvance() || submitting}
            onClick={() => setStepIndex((i) => Math.min(STEPS.length - 1, i + 1))}
          >
            Siguiente
            <ChevronRight className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              disabled={submitting || !canAdvance()}
              onClick={() => handleSubmit(false)}
            >
              {submitting ? "Guardando..." : "Crear borrador"}
            </Button>
            <Button
              disabled={submitting || !canAdvance() || !canSend}
              title={
                !canSend
                  ? "Necesita un contacto con email y DocuSign configurado"
                  : undefined
              }
              onClick={() => handleSubmit(true)}
            >
              <Send className="h-4 w-4" />
              Crear y enviar a firmar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function itemIsValid(it: ItemDraft): boolean {
  return (
    !!it.varietyId &&
    !!it.qtyPlants &&
    Number(it.qtyPlants) > 0 &&
    !!it.unitPrice &&
    Number(it.unitPrice) > 0 &&
    !!it.deliveryYear &&
    !!it.deliveryWeek
  );
}

function PaymentRow({
  label,
  amount,
  onAmountChange,
  dueDate,
  onDueDateChange,
}: {
  label: string;
  amount: string;
  onAmountChange: (v: string) => void;
  dueDate: string;
  onDueDateChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium">{label}</p>
      <Input
        type="number"
        min="0"
        step="0.01"
        value={amount}
        onChange={(e) => onAmountChange(e.target.value)}
        placeholder="Monto"
      />
      <Input
        type="date"
        value={dueDate}
        onChange={(e) => onDueDateChange(e.target.value)}
      />
    </div>
  );
}

function ClientSearch({
  clients,
  value,
  onChange,
}: {
  clients: ClientOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const filtered = React.useMemo(() => {
    if (!query.trim()) return clients.slice(0, 12);
    const q = query.trim().toLowerCase();
    return clients
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.tax_id ?? "").toLowerCase().includes(q),
      )
      .slice(0, 20);
  }, [clients, query]);

  const selected = clients.find((c) => c.id === value);

  return (
    <div className="space-y-2">
      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar por nombre o RUT..."
      />
      {selected ? (
        <div className="flex items-center justify-between rounded-md border border-primary/40 bg-primary/5 px-3 py-2">
          <div>
            <p className="text-sm font-medium">{selected.name}</p>
            {selected.tax_id ? (
              <p className="text-xs text-muted-foreground">{selected.tax_id}</p>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={() => onChange("")}>
            Cambiar
          </Button>
        </div>
      ) : (
        <div className="max-h-60 overflow-y-auto rounded-md border">
          {filtered.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              Sin resultados.
            </p>
          ) : (
            <ul className="divide-y">
              {filtered.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => onChange(c.id)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    <span>{c.name}</span>
                    {c.tax_id ? (
                      <span className="text-xs text-muted-foreground">
                        {c.tax_id}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
