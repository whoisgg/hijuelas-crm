import Link from "next/link";
import { notFound } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ConvertWizard } from "@/components/oportunidades/convert-wizard";
import {
  getOpportunity,
  listVarieties,
} from "@/lib/actions/oportunidades";
import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{ id: string }>;
};

export const metadata = { title: "Convertir oportunidad" };

export default async function ConvertOpportunityPage({ params }: PageProps) {
  const { id } = await params;
  const opp = await getOpportunity(id);
  if (!opp) notFound();

  const supabase = await createClient();
  const [varieties, orgPrefixRes] = await Promise.all([
    listVarieties(),
    supabase
      .from("organizations")
      .select("contract_prefix")
      .eq("id", opp.organization_id)
      .maybeSingle(),
  ]);

  return (
    <div className="p-6">
      <PageHeader
        title={`Convertir: ${opp.name}`}
        description="Wizard de 4 pasos para crear el contrato y marcar la oportunidad como Ganada."
        actions={
          <Button
            variant="outline"
            render={<Link href={`/oportunidades/${opp.id}`}>Volver</Link>}
          />
        }
      />
      <div className="max-w-3xl">
        <ConvertWizard
          opp={opp}
          varieties={varieties}
          organizationPrefix={orgPrefixRes.data?.contract_prefix}
        />
      </div>
    </div>
  );
}
