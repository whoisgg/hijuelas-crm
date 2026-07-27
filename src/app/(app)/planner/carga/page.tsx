import { redirect } from "next/navigation";
import { AlertTriangle, Download } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { getAccessProfile, hasModuleAccess } from "@/lib/access";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { UploadCard } from "@/components/planner/upload-card";
import {
  applyHoteleriaImport,
  applyInventarioImport,
  listPlannerUploads,
  previewHoteleriaImport,
  previewInventarioImport,
} from "@/lib/actions/planner-import";

export const metadata = { title: "Carga de datos" };
export const dynamic = "force-dynamic";

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

  const profile = await getAccessProfile(supabase);
  if (!hasModuleAccess(profile, "planner")) {
    redirect("/apps");
  }

  const uploads = await listPlannerUploads();

  return (
    <AppShell>
      <PageHeader
        title="Carga de datos"
        description="Sube el Excel de hotelería para actualizar la ocupación real. El plan de producción se mantiene dentro de la app, no se re-importa."
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

      {/* Solo hotelería: la carga del "Vivero Planner" se retiró de la UI a
          pedido del usuario (2026-07-27) porque en la práctica nunca se vuelve a
          subir y el botón era peligroso — `applyPlannerCore` borra TODA la
          demanda y TODOS los lotes (delete + reinsert) y `applyPlannerImport`
          elimina además las mesas de trabajo. Hoy eso significaría perder los
          314 lotes / 21,1M plantas y el trabajo sin aprobar de todos.
          Las server actions siguen existiendo (`previewPlannerImport` /
          `applyPlannerImport`) para un re-baseline futuro; se exponen de nuevo
          solo si se necesita, a sabiendas de que reemplazan el plan completo. */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <UploadCard
          kind="inventario"
          title="Inventario de hardening"
          description="El Excel «Inventario Hrd» (hoja Inventario 2026). Una fila por barcode con delivery note, variedad, medio de cultivo y fecha de plantación. Cubre todo el vivero y es la fuente recomendada de la ocupación real."
          preview={previewInventarioImport}
          apply={applyInventarioImport}
        />
        <UploadCard
          kind="hoteleria"
          title="Hotelería (snapshot)"
          description="Formato anterior, ya resumido en tablas dinámicas (Resumen General + detalle). Solo cubría Góticos, Zona Clara y Zona Oscura. Se mantiene por compatibilidad."
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
            Aún no hay cargas. Sube el Excel de hotelería para registrar la
            ocupación real.
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
