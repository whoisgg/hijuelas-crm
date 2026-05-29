"use client";

import * as React from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { exportAllContractItems } from "@/lib/actions/contratos";
import { EXPORT_COMPROMISOS_HEADERS } from "@/lib/export/compromisos";

/**
 * Exporta TODOS los contratos a un .xlsx que replica la planilla original
 * "BBDD ventas" (hoja "Compromisos", una fila por item). Genera el archivo
 * client-side con la librería `xlsx` (import dinámico para no inflar el bundle).
 */
export function ExportAllButton() {
  const [loading, setLoading] = React.useState(false);

  async function handleExport() {
    if (loading) return;
    setLoading(true);
    try {
      const rows = await exportAllContractItems();
      const XLSX = await import("xlsx");
      const ws = XLSX.utils.json_to_sheet(rows, {
        header: [...EXPORT_COMPROMISOS_HEADERS],
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Compromisos");
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `BBDD ventas - export ${today}.xlsx`);
    } catch (e) {
      console.error("Export error", e);
      window.alert(
        "No se pudo exportar: " + (e instanceof Error ? e.message : "error desconocido"),
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleExport} disabled={loading}>
      <Download className="h-4 w-4" />
      {loading ? "Exportando…" : "Exportar todo"}
    </Button>
  );
}
