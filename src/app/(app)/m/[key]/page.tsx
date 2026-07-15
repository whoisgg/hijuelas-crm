import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Settings2 } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { RecordView } from "@/components/custom/record-view";
import {
  getModuleByKey,
  getModuleRecords,
  getMasterOptionsForFields,
} from "@/lib/custom/data";

export const dynamic = "force-dynamic";

export default async function CustomModulePage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const key = (await params).key;
  const found = await getModuleByKey(supabase, key);
  if (!found) notFound();
  const { module: mod, fields } = found;

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, is_module_builder")
    .eq("id", user.id)
    .maybeSingle();
  const isBuilder = appUser?.role === "admin" || !!appUser?.is_module_builder;

  // Un draft solo lo ve su dueño o un admin.
  if (mod.status === "draft" && !(isBuilder && (mod.ownerId === user.id || appUser?.role === "admin"))) {
    notFound();
  }

  const [records, masterOptions] = await Promise.all([
    getModuleRecords(supabase, mod.id),
    getMasterOptionsForFields(supabase, fields),
  ]);

  return (
    <AppShell>
      <PageHeader
        title={mod.name}
        description={mod.description ?? undefined}
        badge={mod.status === "draft" ? "Borrador" : undefined}
        actions={
          isBuilder ? (
            <Link
              href={`/m/${mod.key}/builder`}
              className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              <Settings2 className="h-4 w-4" /> Editar módulo
            </Link>
          ) : null
        }
      />
      <div className="mt-6">
        <RecordView
          moduleId={mod.id}
          fields={fields}
          records={records}
          masterOptions={masterOptions}
        />
      </div>
    </AppShell>
  );
}
