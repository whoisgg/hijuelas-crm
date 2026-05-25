import type { LucideIcon } from "lucide-react";
import { Building2, Globe2, Sprout } from "lucide-react";

import type { TopRankings as TopRankingsData, TopRankingItem } from "@/lib/actions/analytics";
import { Card } from "@/components/ui/card";
import { formatUsd } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  data: TopRankingsData;
};

/**
 * Tres mini-rankings (top 5) que complementan al país-grid del dashboard:
 * programa genético, cliente, país — todos por USD comprometido del
 * año actual. Cada ranking incluye barra visual de share relativo.
 */
export function TopRankings({ data }: Props) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <RankingCard
        title="Top programas genéticos"
        icon={Sprout}
        year={data.year}
        items={data.programs}
      />
      <RankingCard
        title="Top clientes"
        icon={Building2}
        year={data.year}
        items={data.clients}
      />
      <RankingCard
        title="Top países"
        icon={Globe2}
        year={data.year}
        items={data.countries}
      />
    </div>
  );
}

function RankingCard({
  title,
  icon: Icon,
  year,
  items,
}: {
  title: string;
  icon: LucideIcon;
  year: number;
  items: TopRankingItem[];
}) {
  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-2 text-xs">
        <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
          <Icon className="size-3.5 text-muted-foreground" />
          {title}
        </span>
        <span className="tabular-nums text-muted-foreground">{year}</span>
      </div>
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
              isFirst={idx === 0}
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
  isFirst,
}: {
  rank: number;
  name: string;
  usd: number;
  share: number;
  isFirst: boolean;
}) {
  // Barra visual relativa al líder (siempre 100% para #1).
  const widthPct = Math.max(2, Math.round(share * 100));
  return (
    <li
      className={cn(
        "relative flex items-center gap-2 border-b px-3 py-2 text-xs last:border-b-0",
        isFirst && "bg-primary/5",
      )}
    >
      {/* Barra de share como background */}
      <div
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 transition-[width]",
          isFirst ? "bg-primary/15" : "bg-muted/40",
        )}
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
