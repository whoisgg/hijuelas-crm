import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { FieldEditor } from "@/components/custom/field-editor";
import { getModuleByKey } from "@/lib/custom/data";

export const metadata = { title: "Editor de módulo" };
export const dynamic = "force-dynamic";

export default async function ModuleBuilderPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role, is_module_builder")
    .eq("id", user.id)
    .maybeSingle();
  const isBuilder = appUser?.role === "admin" || !!appUser?.is_module_builder;
  const isAdmin = appUser?.role === "admin";
  if (!isBuilder) redirect("/apps");

  const key = (await params).key;
  const found = await getModuleByKey(supabase, key);
  if (!found) notFound();
  const { module: mod, fields } = found;

  return (
    <AppShell>
      <PageHeader
        title={`Editar · ${mod.name}`}
        description="Define los campos del módulo. Los de tipo maestro conectan datos compartidos (solo lectura). Un admin lo publica cuando esté listo."
        badge={mod.status === "draft" ? "Borrador" : "Publicado"}
        actions={
          <Link
            href={`/m/${mod.key}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Ver módulo
          </Link>
        }
      />
      <div className="mt-6">
        <FieldEditor
          moduleId={mod.id}
          status={mod.status}
          fields={fields}
          isAdmin={isAdmin}
        />
      </div>
    </AppShell>
  );
}
