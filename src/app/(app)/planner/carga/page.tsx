import { redirect } from "next/navigation";
import { AlertTriangle, Download } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { UploadCard } from "@/components/planner/upload-card";
import {
  applyHoteleriaImport,
  applyPlannerImport,
  listPlannerUploads,
  previewHoteleriaImport,
  previewPlannerImport,
} from "@/lib/actions/planner-import";

export const metadata = { title: "Carga de datos" };
export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function CargaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser?.role || !PLANNER_ROLES.has(appUser.role)) {
    redirect("/dashboard");
  }

  const uploads = await listPlannerUploads();

  return (
    <AppShell>
      <PageHeader
        title="Carga de datos"
        description="Sube los Excel de planificación y hotelería. Los maestros se actualizan; demanda, lotes y snapshot se reemplazan con cada carga."
        actions={
          // eslint-disable-next-line @next/next/no-html-link-for-pages -- descarga de archivo, no navegación
          <a
            href="/api/planner/export"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Download className="h-4 w-4" /> Exportar plan a Excel
          </a>
        }
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <UploadCard
          kind="planner"
          title="Vivero Planner"
          description="Modelo de planificación (hojas 01–06): parámetros, especies, áreas, demanda, lotes y calendario."
          preview={previewPlannerImport}
          apply={applyPlannerImport}
        />
        <UploadCard
          kind="hoteleria"
          title="Hotelería (snapshot)"
          description="Ocupación real por ubicación y especie (Resumen General + detalle). Requiere haber cargado el Planner antes."
          preview={previewHoteleriaImport}
          apply={applyHoteleriaImport}
        />
      </div>

      <h2 className="mt-8 text-sm font-medium text-muted-foreground">
        Historial de cargas
      </h2>
      <div className="mt-2 overflow-hidden rounded-lg border bg-card">
        {uploads.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Aún no hay cargas. Sube el Vivero Planner para partir.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Fecha</th>
                <th className="px-3 py-2 text-left font-medium">Tipo</th>
                <th className="px-3 py-2 text-left font-medium">Archivo</th>
                <th className="px-3 py-2 text-left font-medium">Resumen</th>
                <th className="px-3 py-2 text-left font-medium">Usuario</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {uploads.map((u) => (
                <tr key={u.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                    {formatDate(u.created_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge variant="outline" className="text-[10px]">
                      {u.kind === "planner" ? "Planner" : "Hotelería"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5">{u.file_name}</td>
                  <td className="px-3 py-2.5 text-xs text-muted-foreground">
                    {Object.entries(u.stats)
                      .filter(([k]) => !k.includes("reemplazar"))
                      .map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`)
                      .join(" · ")}
                    {u.warnings.length > 0 ? (
                      <span className="ml-2 inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="h-3 w-3" />
                        {u.warnings.length}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {u.uploaded_by_name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppShell>
  );
}
