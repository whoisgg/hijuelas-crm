import Link from "next/link";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { NewOpportunityForm } from "@/components/oportunidades/new-opportunity-form";
import { createClient } from "@/lib/supabase/server";
import {
  listAppUsers,
  listOpportunityStages,
  listOrganizations,
} from "@/lib/actions/oportunidades";

export const metadata = { title: "Nueva oportunidad" };

export default async function NewOpportunityPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [stages, users, organizations] = await Promise.all([
    listOpportunityStages(),
    listAppUsers(),
    listOrganizations(),
  ]);

  return (
    <div className="p-6">
      <PageHeader
        title="Nueva oportunidad"
        description="Crea una oportunidad para empezar a trackear el pipeline."
        actions={
          <Button
            variant="outline"
            render={<Link href="/oportunidades">Volver</Link>}
          />
        }
      />
      <div className="max-w-3xl">
        <NewOpportunityForm
          stages={stages}
          users={users}
          organizations={organizations}
          currentUserId={user?.id ?? null}
        />
      </div>
    </div>
  );
}
