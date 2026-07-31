import { redirect } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { SiteMap } from "@/components/planner/site-map";
import { getSiteMapData } from "@/lib/planner/site-map-data";

export const metadata = { title: "Mapa · Planner" };
export const dynamic = "force-dynamic";

export default async function PlannerMapaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const profile = await getAccessProfile(supabase);
  if (!hasModuleAccess(profile, "planner")) {
    redirect("/apps");
  }

  const data = await getSiteMapData(supabase);

  return (
    <AppShell>
      <PageHeader
        title="Mapa"
        description={`Vista georreferenciada del sitio (Hijuelas), coordenadas reales del levantamiento KMZ.${data?.weekLabel ? ` Ocupación de ${data.weekLabel}.` : ""}`}
      />
      {!data || data.areas.length === 0 ? (
        <p className="rounded-lg border bg-card px-3 py-10 text-center text-sm text-muted-foreground">
          Sin geometría cargada todavía.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
          <SiteMap areas={data.areas} alertAt={data.alertAt} />
          {data.undelimited.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">
                Sin delimitar en el KMZ
              </p>
              {data.undelimited.map((a) => (
                <Link
                  key={a.id}
                  href={`/planner/sector/${a.id}`}
                  className="block rounded-lg border bg-card px-3 py-2 text-sm hover:bg-muted/40"
                >
                  <div className="font-medium">{a.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {Math.round(a.pct)}% · {a.occupiedTrays.toLocaleString("es-CL")}/
                    {a.capacityTrays.toLocaleString("es-CL")} band.
                  </div>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
