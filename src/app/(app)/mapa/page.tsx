import { Suspense } from "react";

import { getMapData, getSpeciesLookup } from "@/lib/actions/analytics";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WorldMap } from "@/components/mapa/world-map";
import { MapFilters } from "@/components/mapa/map-filters";
import { EmptyState } from "@/components/dashboard/empty-state";
import { Globe2 } from "lucide-react";

export const metadata = { title: "Mapa Mundial" };
export const dynamic = "force-dynamic";

type MapPageSearchParams = {
  year?: string;
  species?: string;
  opps?: string;
  status?: string;
};

const STATUS_MAP: Record<string, string[]> = {
  activos: ["firmado", "en_proceso", "finalizado"],
  por_firmar: ["borrador", "por_revisar"],
  cancelados: ["cancelado"],
};

function statusesFromParam(param: string | undefined): string[] | null {
  if (param === "all") return null; // todos los estados
  if (param == null) return STATUS_MAP.activos; // default activos
  const keys = param.split(",").filter((k) => k in STATUS_MAP);
  if (keys.length === 0) return STATUS_MAP.activos;
  return keys.flatMap((k) => STATUS_MAP[k]);
}

export default async function MapaPage({
  searchParams,
}: {
  searchParams: Promise<MapPageSearchParams>;
}) {
  const params = await searchParams;
  const year = Number.parseInt(params.year ?? "", 10);
  const includeOpps = params.opps === "1";
  const contractStatuses = statusesFromParam(params.status);

  return (
    <div className="mx-auto w-full max-w-7xl p-6">
      <PageHeader
        title="Mapa Mundial"
        description="Colores por país. Cada tag muestra plantas comprometidas y total USD."
        badge="Sprint 6"
      />

      <Suspense fallback={<MapaSkeleton />}>
        <MapaContent
          year={Number.isFinite(year) ? year : undefined}
          speciesId={params.species}
          contractStatuses={contractStatuses}
          includeOpportunities={includeOpps}
        />
      </Suspense>
    </div>
  );
}

async function MapaContent({
  year,
  speciesId,
  contractStatuses,
  includeOpportunities,
}: {
  year?: number;
  speciesId?: string;
  contractStatuses: string[] | null;
  includeOpportunities: boolean;
}) {
  const effectiveYear = year ?? new Date().getUTCFullYear();
  const [data, species] = await Promise.all([
    getMapData({
      year: effectiveYear,
      speciesId: speciesId === "all" ? null : speciesId,
      contractStatuses,
      includeOpportunities,
    }),
    getSpeciesLookup(),
  ]);

  const years = [effectiveYear - 2, effectiveYear - 1, effectiveYear, effectiveYear + 1];

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <MapFilters species={species} years={years} />
      <Card className="flex-1 overflow-hidden">
        <div className="relative h-[560px] w-full">
          {data.length === 0 ? (
            <div className="flex h-full w-full items-center justify-center">
              <EmptyState
                icon={Globe2}
                title="Sin actividad"
                description="No hay datos para los filtros seleccionados."
              />
            </div>
          ) : (
            <WorldMap data={data} includeOpportunities={includeOpportunities} />
          )}
        </div>
      </Card>
    </div>
  );
}

function MapaSkeleton() {
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <Skeleton className="h-96 w-full lg:w-72" />
      <Skeleton className="h-[560px] w-full flex-1" />
    </div>
  );
}
