"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

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
  createOpportunity,
  searchClients,
  type AppUserRow,
  type OpportunityStage,
} from "@/lib/actions/oportunidades";
import type { Database } from "@/lib/database.types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];

type Props = {
  stages: OpportunityStage[];
  users: Pick<AppUserRow, "id" | "full_name" | "email" | "avatar_url">[];
  organizations: { id: string; name: string; default_currency: CurrencyCode }[];
  currentUserId: string | null;
};

const CURRENCIES: CurrencyCode[] = ["USD", "CLP", "EUR"];

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function NewOpportunityForm({
  stages,
  users,
  organizations,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);

  const initialStage =
    stages.find((s) => !s.is_won && !s.is_lost) ?? stages[0] ?? null;
  const defaultOrg = organizations[0]?.id ?? "";

  const [name, setName] = React.useState("");
  const [isProspect, setIsProspect] = React.useState(false);
  const [clientId, setClientId] = React.useState<string>("");
  const [clientLabel, setClientLabel] = React.useState<string>("");
  const [clientQuery, setClientQuery] = React.useState("");
  const [clientResults, setClientResults] = React.useState<
    { id: string; name: string }[]
  >([]);
  const [clientNameRaw, setClientNameRaw] = React.useState("");
  const [organizationId, setOrganizationId] = React.useState(defaultOrg);
  const [stageId, setStageIdState] = React.useState(initialStage?.id ?? "");
  const [ownerId, setOwnerId] = React.useState(currentUserId ?? "");
  const [probability, setProbability] = React.useState<number>(
    initialStage?.probability_default ?? 0,
  );

  const setStageId = (id: string) => {
    setStageIdState(id);
    const stage = stages.find((s) => s.id === id);
    if (stage) setProbability(stage.probability_default);
  };
  const [expectedClose, setExpectedClose] = React.useState("");
  const [currency, setCurrency] = React.useState<CurrencyCode>("USD");
  const [estimatedValue, setEstimatedValue] = React.useState<string>("");
  const [source, setSource] = React.useState("");
  const [notes, setNotes] = React.useState("");

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("El nombre es requerido");
      return;
    }
    if (!organizationId) {
      toast.error("Selecciona una organización");
      return;
    }
    if (!stageId) {
      toast.error("Selecciona un stage");
      return;
    }
    if (!isProspect && !clientId) {
      toast.error("Selecciona un cliente o marca como prospect");
      return;
    }
    if (isProspect && !clientNameRaw.trim()) {
      toast.error("Escribe el nombre del prospect");
      return;
    }

    setSubmitting(true);
    try {
      const { id } = await createOpportunity({
        name: name.trim(),
        client_id: isProspect ? null : clientId,
        client_name_raw: isProspect ? clientNameRaw.trim() : null,
        organization_id: organizationId,
        owner_id: ownerId || null,
        stage_id: stageId,
        currency,
        estimated_value: estimatedValue ? Number(estimatedValue) : null,
        expected_close_date: expectedClose || null,
        probability_pct: probability,
        source: source.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Oportunidad creada");
      router.push(`/oportunidades/${id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al crear");
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2 space-y-1.5">
          <Label htmlFor="name">Nombre *</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ej: Vivero Andes - 50k cherry"
            required
          />
        </div>

        <div className="sm:col-span-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <Label>Cliente *</Label>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={isProspect}
                onChange={(e) => {
                  setIsProspect(e.target.checked);
                  if (e.target.checked) {
                    setClientId("");
                    setClientLabel("");
                  } else {
                    setClientNameRaw("");
                  }
                }}
                className="size-3.5 accent-primary"
              />
              Es un prospect
            </label>
          </div>
          {isProspect ? (
            <Input
              value={clientNameRaw}
              onChange={(e) => setClientNameRaw(e.target.value)}
              placeholder="Nombre del prospect"
            />
          ) : (
            <ClientAutocomplete
              query={clientQuery}
              setQuery={setClientQuery}
              results={clientResults}
              selectedLabel={clientLabel}
              onSelect={(c) => {
                setClientId(c.id);
                setClientLabel(c.name);
                setClientQuery(c.name);
                setClientResults([]);
              }}
              onClear={() => {
                setClientId("");
                setClientLabel("");
                setClientQuery("");
              }}
            />
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="organization">Organización *</Label>
          <Select
            value={organizationId}
            onValueChange={(v) => {
              if (typeof v === "string") {
                setOrganizationId(v);
                const org = organizations.find((o) => o.id === v);
                if (org) setCurrency(org.default_currency);
              }
            }}
          >
            <SelectTrigger id="organization" className="w-full">
              <SelectValue placeholder="Selecciona">
                {(value) =>
                  organizations.find((o) => o.id === value)?.name ?? "Selecciona"
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {organizations.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="stage">Stage inicial *</Label>
          <Select
            value={stageId}
            onValueChange={(v) => {
              if (typeof v === "string") setStageId(v);
            }}
          >
            <SelectTrigger id="stage" className="w-full">
              <SelectValue placeholder="Selecciona">
                {(value) => stages.find((s) => s.id === value)?.name ?? "Selecciona"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span
                    className="mr-1.5 inline-block size-2 rounded-full"
                    style={{ backgroundColor: s.color ?? "#94a3b8" }}
                  />
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="owner">Owner</Label>
          <Select
            value={ownerId}
            onValueChange={(v) => {
              if (typeof v === "string") setOwnerId(v);
            }}
          >
            <SelectTrigger id="owner" className="w-full">
              <SelectValue placeholder="Sin owner">
                {(value) => {
                  const u = users.find((x) => x.id === value);
                  return u ? (u.full_name ?? u.email ?? "—") : "Sin owner";
                }}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name ?? u.email ?? "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="probability">Probabilidad %</Label>
          <Input
            id="probability"
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={(e) => setProbability(Number(e.target.value))}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="expectedClose">Fecha estimada de cierre</Label>
          <Input
            id="expectedClose"
            type="date"
            value={expectedClose}
            onChange={(e) => setExpectedClose(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="currency">Moneda</Label>
          <Select
            value={currency}
            onValueChange={(v) => {
              if (typeof v === "string") setCurrency(v as CurrencyCode);
            }}
          >
            <SelectTrigger id="currency" className="w-full">
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
          <Label htmlFor="estimated">Valor estimado</Label>
          <Input
            id="estimated"
            type="number"
            min={0}
            step="0.01"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="source">Origen</Label>
          <Input
            id="source"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            placeholder="Ej: Referido, feria, web"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="notes">Notas</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.back()}
          disabled={submitting}
        >
          Cancelar
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Creando..." : "Crear oportunidad"}
        </Button>
      </div>
    </form>
  );
}

function ClientAutocomplete({
  query,
  setQuery,
  results,
  selectedLabel,
  onSelect,
  onClear,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: { id: string; name: string }[];
  selectedLabel: string;
  onSelect: (c: { id: string; name: string }) => void;
  onClear: () => void;
}) {
  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          if (selectedLabel) onClear();
        }}
        placeholder="Buscar cliente por nombre..."
      />
      {results.length > 0 && !selectedLabel ? (
        <ul className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onSelect(c)}
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
              >
                {c.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
