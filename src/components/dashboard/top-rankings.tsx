import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Building2, Sprout, UserCircle2 } from "lucide-react";

import type { TopRankings as TopRankingsData, TopRankingItem } from "@/lib/actions/analytics";
import { Card } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";

type Props = {
  data: TopRankingsData;
  /** Label del período activo para mostrar en el header (ej "este mes", "2027"). */
  periodLabel: string;
};

/**
 * Tres mini-rankings (top 5) que complementan al stacked-bar de países
 * del dashboard: programa genético, cliente, KAM — todos por USD
 * comprometido del período activo. El detalle de país ya vive en la
 * barra apilada del card "Entregas comprometidas".
 */
export function TopRankings({ data, periodLabel }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <RankingCard
        title="Top programas genéticos"
        icon={Sprout}
        periodLabel={periodLabel}
        items={data.programs}
      />
      <RankingCard
        title="Top clientes"
        icon={Building2}
        periodLabel={periodLabel}
        items={data.clients}
      />
      <RankingCard
        title="Top KAM"
        icon={UserCircle2}
        periodLabel={periodLabel}
        items={data.kams}
        header={
          data.kamsUnassigned.usd > 0 ? (
            <UnassignedKamBanner
              usd={data.kamsUnassigned.usd}
              share={data.kamsUnassigned.share}
            />
          ) : null
        }
      />
    </div>
  );
}

function UnassignedKamBanner({ usd, share }: { usd: number; share: number }) {
  return (
    <div
      className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-700 dark:text-amber-400"
      role="note"
      aria-label="Indicador de calidad de dato: contratos sin KAM asignado"
    >
      <AlertTriangle className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">
        <strong className="font-semibold">{formatUsd(usd, true)}</strong>{" "}
        en contratos sin KAM ({Math.round(share * 100)}% del total)
      </span>
    </div>
  );
}

function RankingCard({
  title,
  icon: Icon,
  periodLabel,
  items,
  header,
}: {
  title: string;
  icon: LucideIcon;
  periodLabel: string;
  items: TopRankingItem[];
  /** Slot opcional renderizado entre el header y la lista — sirve para
   *  alertas de calidad de dato (ej. contratos sin KAM asignado). */
  header?: ReactNode;
}) {
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Icon className="size-3.5 text-muted-foreground" />
          {title}
        </span>
        <span className="tabular-nums text-muted-foreground">{periodLabel}</span>
      </div>
      {header}
      {items.length === 0 ? (
        <div className="flex h-24 items-center justify-center text-xs text-muted-foreground">
          Sin datos para el año.
        </div>
      ) : (
        <ul className="flex flex-col">
          {items.map((it, idx) => (
            <RankingRow
              key={it.key}
              rank={idx + 1}
              name={it.name}
              usd={it.totalUsd}
              share={it.share}
            />
          ))}
        </ul>
      )}
    </Card>
  );
}

function RankingRow({
  rank,
  name,
  usd,
  share,
}: {
  rank: number;
  name: string;
  usd: number;
  share: number;
}) {
  // Barra de share como background — mismo tinte para todos los ranks.
  // El ancho de la barra ya comunica visualmente quién es #1.
  const widthPct = Math.max(2, Math.round(share * 100));
  return (
    <li className="relative flex items-center gap-2 border-b px-3 py-2 text-xs last:border-b-0">
      <div
        aria-hidden
        className="absolute inset-y-0 left-0 bg-primary/10 transition-[width]"
        style={{ width: `${widthPct}%` }}
      />
      <span className="relative z-10 w-5 shrink-0 text-[10px] tabular-nums text-muted-foreground">
        #{rank}
      </span>
      <span className="relative z-10 min-w-0 flex-1 truncate font-medium text-foreground">
        {name}
      </span>
      <span className="relative z-10 shrink-0 text-right font-semibold tabular-nums text-foreground">
        {formatUsd(usd, true)}
      </span>
    </li>
  );
}
