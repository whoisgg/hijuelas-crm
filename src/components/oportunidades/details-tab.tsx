"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
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
  updateOpportunity,
  type AppUserRow,
  type OpportunityDetail,
  type OpportunityStage,
} from "@/lib/actions/oportunidades";
import type { Database } from "@/lib/database.types";

type CurrencyCode = Database["public"]["Enums"]["currency_code"];
const CURRENCIES: CurrencyCode[] = ["USD", "CLP", "EUR"];

type Props = {
  opp: OpportunityDetail;
  stages: OpportunityStage[];
  users: Pick<AppUserRow, "id" | "full_name" | "email" | "avatar_url">[];
};

export function DetailsTab({ opp, stages, users }: Props) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const [name, setName] = React.useState(opp.name);
  const [stageId, setStageId] = React.useState(opp.stage_id);
  const [ownerId, setOwnerId] = React.useState(opp.owner_id ?? "");
  const [probability, setProbability] = React.useState(opp.probability_pct);
  const [expectedClose, setExpectedClose] = React.useState(
    opp.expected_close_date ?? "",
  );
  const [currency, setCurrency] = React.useState<CurrencyCode>(opp.currency);
  const [estimatedValue, setEstimatedValue] = React.useState(
    opp.estimated_value !== null ? String(opp.estimated_value) : "",
  );
  const [source, setSource] = React.useState(opp.source ?? "");
  const [notes, setNotes] = React.useState(opp.notes ?? "");

  const reset = () => {
    setName(opp.name);
    setStageId(opp.stage_id);
    setOwnerId(opp.owner_id ?? "");
    setProbability(opp.probability_pct);
    setExpectedClose(opp.expected_close_date ?? "");
    setCurrency(opp.currency);
    setEstimatedValue(
      opp.estimated_value !== null ? String(opp.estimated_value) : "",
    );
    setSource(opp.source ?? "");
    setNotes(opp.notes ?? "");
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateOpportunity(opp.id, {
        name: name.trim(),
        stage_id: stageId,
        owner_id: ownerId || null,
        probability_pct: probability,
        expected_close_date: expectedClose || null,
        currency,
        estimated_value: estimatedValue ? Number(estimatedValue) : null,
        source: source.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Actualizado");
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Detalles</h3>
        {editing ? (
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                reset();
                setEditing(false);
              }}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            Editar
          </Button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" editing={editing} display={opp.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field
          label="Stage"
          editing={editing}
          display={
            <span className="inline-flex items-center gap-1.5">
              <span
                className="size-2 rounded-full"
                style={{ backgroundColor: opp.stage?.color ?? "#94a3b8" }}
              />
              {opp.stage?.name ?? "—"}
            </span>
          }
        >
          <Select
            value={stageId}
            onValueChange={(v) => {
              if (typeof v === "string") setStageId(v);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Owner"
          editing={editing}
          display={opp.owner?.full_name ?? opp.owner?.email ?? "—"}
        >
          <Select
            value={ownerId}
            onValueChange={(v) => {
              if (typeof v === "string") setOwnerId(v);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Sin owner" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.full_name ?? u.email ?? "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="Probabilidad"
          editing={editing}
          display={`${Math.round(opp.probability_pct)}%`}
        >
          <Input
            type="number"
            min={0}
            max={100}
            value={probability}
            onChange={(e) => setProbability(Number(e.target.value))}
          />
        </Field>

        <Field
          label="Cierre esperado"
          editing={editing}
          display={
            opp.expected_close_date
              ? new Date(opp.expected_close_date).toLocaleDateString("es-CL")
              : "—"
          }
        >
          <Input
            type="date"
            value={expectedClose}
            onChange={(e) => setExpectedClose(e.target.value)}
          />
        </Field>

        <Field label="Moneda" editing={editing} display={opp.currency}>
          <Select
            value={currency}
            onValueChange={(v) => {
              if (typeof v === "string") setCurrency(v as CurrencyCode);
            }}
          >
            <SelectTrigger className="w-full">
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
        </Field>

        <Field
          label="Valor estimado"
          editing={editing}
          display={
            opp.estimated_value !== null
              ? `${opp.currency} ${opp.estimated_value.toLocaleString()}`
              : "—"
          }
        >
          <Input
            type="number"
            value={estimatedValue}
            onChange={(e) => setEstimatedValue(e.target.value)}
          />
        </Field>

        <Field label="Origen" editing={editing} display={opp.source ?? "—"}>
          <Input value={source} onChange={(e) => setSource(e.target.value)} />
        </Field>

        <Field
          label="Cliente"
          editing={false}
          display={
            opp.client?.name ?? opp.client_name_raw ?? "Prospect sin nombre"
          }
        >
          <></>
        </Field>

        <Field
          label="Organización"
          editing={false}
          display={opp.organization?.name ?? "—"}
        >
          <></>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Notas" editing={editing} display={opp.notes ?? "—"}>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </Field>
        </div>

        {opp.lost_reason ? (
          <div className="sm:col-span-2">
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
              <span className="font-medium text-destructive">
                Motivo de pérdida:
              </span>{" "}
              <span>{opp.lost_reason}</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Field({
  label,
  editing,
  display,
  children,
}: {
  label: string;
  editing: boolean;
  display: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={cn("text-xs text-muted-foreground")}>{label}</Label>
      {editing ? (
        children
      ) : (
        <div className="text-sm font-medium">{display}</div>
      )}
    </div>
  );
}
