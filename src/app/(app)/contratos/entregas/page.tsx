import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { listUpcomingDeliveries } from "@/lib/actions/entregas";
import { DeliveryStatusBadge } from "@/components/contratos/status-badge";
import { formatQty } from "@/components/contratos/format";
import type { Database } from "@/lib/database.types";

type DeliveryStatus = Database["public"]["Enums"]["delivery_status"];

export const metadata = { title: "Entregas próximas" };

type RawItem = {
  id: string;
  contract_id: string;
  variety_id: string;
  qty_plants: number;
  qty_delivered: number;
  delivery_year: number;
  delivery_week: number;
  status: DeliveryStatus;
  variety: unknown;
  contract: unknown;
};

function pickOne<T>(v: unknown): T | null {
  if (!v) return null;
  if (Array.isArray(v)) return (v[0] as T) ?? null;
  return v as T;
}

export default async function EntregasPage({
  searchParams,
}: {
  searchParams?: Promise<{ weeks?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const weeksAhead = Math.min(Math.max(parseInt(sp.weeks ?? "8", 10) || 8, 1), 52);

  const raw = (await listUpcomingDeliveries({ weeksAhead })) as unknown as RawItem[];

  // Group by year/week.
  const groups = new Map<string, RawItem[]>();
  for (const it of raw) {
    const key = `${it.delivery_year}-W${String(it.delivery_week).padStart(2, "0")}`;
    const list = groups.get(key) ?? [];
    list.push(it);
    groups.set(key, list);
  }

  const sortedKeys = Array.from(groups.keys()).sort();

  return (
    <AppShell>
      <PageHeader
        title="Entregas próximas"
        description={`Items pendientes o en proceso en las próximas ${weeksAhead} semanas.`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" render={<Link href="/contratos" />}>
              <ChevronLeft className="h-4 w-4" />
              Volver
            </Button>
            <form
              className="inline-flex items-center gap-1 rounded-md border bg-background px-2 py-1"
              method="get"
            >
              <span className="text-xs text-muted-foreground">Semanas:</span>
              <Input
                name="weeks"
                type="number"
                min="1"
                max="52"
                defaultValue={weeksAhead}
                className="h-7 w-16"
              />
              <Button size="xs" type="submit">
                Filtrar
              </Button>
            </form>
          </div>
        }
      />

      {sortedKeys.length === 0 ? (
        <div className="rounded-lg border bg-card py-12 text-center text-sm text-muted-foreground">
          Sin entregas próximas en el rango seleccionado.
        </div>
      ) : (
        <div className="space-y-4">
          {sortedKeys.map((key) => {
            const list = groups.get(key) ?? [];
            const totalPending = list.reduce(
              (acc, it) =>
                acc + Math.max(0, Number(it.qty_plants) - Number(it.qty_delivered)),
              0,
            );
            return (
              <section key={key} className="overflow-hidden rounded-lg border bg-card">
                <header className="flex items-center justify-between border-b bg-muted/30 px-3 py-2">
                  <p className="font-mono text-xs font-medium">{key}</p>
                  <p className="text-xs text-muted-foreground">
                    {list.length} item{list.length === 1 ? "" : "s"} ·{" "}
                    {formatQty(totalPending)} plantas pendientes
                  </p>
                </header>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contrato</TableHead>
                      <TableHead>Cliente</TableHead>
                      <TableHead>Variedad</TableHead>
                      <TableHead className="text-right">Comprometido</TableHead>
                      <TableHead className="text-right">Entregado</TableHead>
                      <TableHead className="text-right">Pendiente</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {list.map((it) => {
                      const variety = pickOne<{ id: string; name: string }>(
                        it.variety,
                      );
                      const contract = pickOne<{
                        id: string;
                        number: string;
                        client: unknown;
                      }>(it.contract);
                      const client = contract
                        ? pickOne<{ id: string; name: string }>(
                            contract.client,
                          )
                        : null;
                      const pending = Math.max(
                        0,
                        Number(it.qty_plants) - Number(it.qty_delivered),
                      );
                      return (
                        <TableRow key={it.id}>
                          <TableCell className="font-mono text-xs">
                            {contract ? (
                              <Link
                                href={`/contratos/${contract.id}?tab=entregas`}
                                className="hover:underline"
                              >
                                {contract.number}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell>{client?.name ?? "—"}</TableCell>
                          <TableCell>{variety?.name ?? "—"}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatQty(it.qty_plants)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatQty(it.qty_delivered)}
                          </TableCell>
                          <TableCell className="text-right tabular-nums font-medium">
                            {formatQty(pending)}
                          </TableCell>
                          <TableCell>
                            <DeliveryStatusBadge status={it.status} />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </section>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
