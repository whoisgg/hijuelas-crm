import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Mail, Phone, ShieldCheck } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { getKAMDetail } from "@/lib/actions/kam";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { ContractStatusBadge } from "@/components/contratos/status-badge";
import { Button } from "@/components/ui/button";
import type { Database } from "@/lib/database.types";

type ContractStatus = Database["public"]["Enums"]["contract_status"];

export const dynamic = "force-dynamic";

const numFmt = new Intl.NumberFormat("es-CL");
const usdFmt = new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const dateFmt = new Intl.DateTimeFormat("es-CL", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function initials(name: string | null): string {
  if (!name) return "??";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  sales: "Sales",
  finance: "Finance",
  viewer: "Viewer",
};

export default async function KAMDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let data;
  try {
    data = await getKAMDetail(id);
  } catch {
    notFound();
  }
  if (!data.user) notFound();

  const { user, contracts } = data;
  const currentYear = new Date().getFullYear();

  // Summary metrics
  const total = contracts.length;
  const active = contracts.filter((c) =>
    ["borrador", "por_revisar", "firmado", "en_proceso"].includes(c.status),
  ).length;
  const finalized = contracts.filter((c) => c.status === "finalizado").length;
  const ytdContracts = contracts.filter((c) => {
    const ref = c.signed_at ?? c.created_at;
    return ref && new Date(ref).getFullYear() === currentYear;
  });
  const plantsYtd = ytdContracts.reduce((s, c) => s + c.totalPlants, 0);
  const usdYtd = ytdContracts.reduce((s, c) => s + c.totalUsd, 0);

  return (
    <AppShell>
      <div className="mb-3">
        <Button variant="ghost" size="sm" render={<Link href="/kam" />}>
          <ChevronLeft className="h-4 w-4" />
          Volver
        </Button>
      </div>

      <Card className="mb-4 p-4">
        <div className="flex items-start gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-base font-medium">
              {initials(user.full_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-semibold">{user.full_name ?? "Sin nombre"}</h2>
              {!user.is_active ? (
                <Badge variant="secondary">Inactivo</Badge>
              ) : null}
              <Badge variant="outline">
                <ShieldCheck className="mr-1 h-3 w-3" />
                {ROLE_LABELS[user.role] ?? user.role}
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              {user.email ? (
                <span className="inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {user.email}
                </span>
              ) : null}
              {user.phone ? (
                <span className="inline-flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {user.phone}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-5">
          <Metric label="Activos" value={numFmt.format(active)} />
          <Metric label="Histórico" value={numFmt.format(total)} />
          <Metric label="Finalizados" value={numFmt.format(finalized)} />
          <Metric label={`Plantas ${currentYear}`} value={numFmt.format(plantsYtd)} />
          <Metric label={`Revenue ${currentYear}`} value={usdFmt.format(usdYtd)} />
        </div>
      </Card>

      <PageHeader title="Contratos asignados" description={`${total} contratos`} />

      {contracts.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Este KAM no tiene contratos asignados. Asigná uno desde el detalle de un contrato.
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b">
                <th className="px-3 py-2 text-left font-medium"># Contrato</th>
                <th className="px-3 py-2 text-left font-medium">Cliente</th>
                <th className="px-3 py-2 text-left font-medium">País</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
                <th className="px-3 py-2 text-right font-medium">Plantas</th>
                <th className="px-3 py-2 text-right font-medium">USD</th>
                <th className="px-3 py-2 text-left font-medium">Firma</th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/50">
                  <td className="px-3 py-2 font-mono text-xs">
                    <Link href={`/contratos/${c.id}`} className="hover:underline">
                      {c.number}
                    </Link>
                  </td>
                  <td className="px-3 py-2">{c.clientName ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {c.clientCountryName ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <ContractStatusBadge status={c.status as ContractStatus} />
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {numFmt.format(c.totalPlants)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {usdFmt.format(c.totalUsd)}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {c.signed_at ? dateFmt.format(new Date(c.signed_at)) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-mono text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
