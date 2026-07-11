import { NextResponse } from "next/server";
import * as XLSX from "xlsx";

import { createClient } from "@/lib/supabase/server";

/**
 * Exportación round-trip del plan vigente: genera un .xlsx con las mismas
 * hojas y columnas que consume el importador (01_Parametros … 06_Calendario),
 * para quienes sigan trabajando en Excel durante la transición.
 */

export const dynamic = "force-dynamic";

const PLANNER_ROLES = new Set(["admin", "produccion"]);

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!appUser?.role || !PLANNER_ROLES.has(appUser.role)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const [params, areas, species, varieties, calendar, demand, lots] =
    await Promise.all([
      supabase.from("planner_parameters").select("*").order("key"),
      supabase.from("planner_areas").select("*").order("id"),
      supabase.from("planner_species").select("*, rooting:planner_areas!planner_species_rooting_area_id_fkey(name), maturation:planner_areas!planner_species_maturation_area_id_fkey(name), predispatch:planner_areas!planner_species_predispatch_area_id_fkey(name)").order("id"),
      supabase.from("planner_varieties").select("*, planner_species(name)").order("species_id").order("name"),
      supabase.from("planner_calendar_weeks").select("*").order("year").order("week"),
      supabase.from("planner_demand").select("*, planner_species(name), planner_varieties(name)").order("year").order("week").limit(10000),
      supabase.from("planner_lots").select("*, planner_species(name), planner_varieties(name), r:planner_areas!planner_lots_rooting_area_id_fkey(name), m:planner_areas!planner_lots_maturation_area_id_fkey(name), p:planner_areas!planner_lots_predispatch_area_id_fkey(name)").order("start_week").limit(10000),
    ]);

  type Rel = { name: string } | null;
  const rel = (v: unknown) => (v as Rel)?.name ?? null;

  const wb = XLSX.utils.book_new();

  const sheetParams = [
    ["Parámetro", "Valor", "Comentario"],
    ...(params.data ?? []).map((p) => [p.key, p.value, p.comment]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetParams), "01_Parametros");

  const stageLabel: Record<string, string> = {
    enraizamiento: "Enraizamiento",
    maduracion: "Maduración",
    predespacho: "Predespacho",
  };

  const sheetSpecies = [
    ["ID", "Especie", "Sigla", "Formato (Plantas/Bandeja)", "Area Enraizamiento", "Enraizamiento", "Area Maduración", "Maduración", "Area PreDespacho", "Predespacho", "Prioridad", "Activa", "Familia", "Cliente Principal", "Observaciones", "Color"],
    ...(species.data ?? []).map((s, i) => [
      i + 1, s.name, s.code, s.tray_format,
      rel(s.rooting), s.rooting_weeks,
      rel(s.maturation), s.maturation_weeks,
      rel(s.predispatch), s.predispatch_weeks,
      s.priority, s.active ? "Si" : "No", s.family, null, null, s.color,
    ]),
    [],
    [null, "Especie", "Variedad", "Sigla Variedad"],
    ...(varieties.data ?? []).map((v) => [
      null, rel(v.planner_species), v.name, v.code,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetSpecies), "02_Especies");

  const sheetAreas = [
    ["ID", "Área", "Etapa", "Capacidad", "Tipo", "Prioridad", "Activa"],
    ...(areas.data ?? []).map((a) => [
      a.id, a.name, stageLabel[a.stage] ?? a.stage, a.capacity_trays, a.type, a.priority, a.active ? "Sí" : "No",
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetAreas), "03_Areas");

  const sheetDemand = [
    ["Año", "Mes", "Semana", "Especie", "Variedad", "Plantas", "Formato", "Bandejas"],
    ...(demand.data ?? []).map((d) => [
      d.year, d.month_name, d.week, rel(d.planner_species), rel(d.planner_varieties), d.plants, d.tray_format, d.trays,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetDemand), "04_Demanda");

  const sheetLots = [
    ["ID Lote", "Especie", "Variedad", "Año", "Semana Inicio", "Plantas", "Formato", "Bandejas", "Area Enraizamiento", "Enraiz. Sem.", "Area Maduración", "Madur. Sem.", "Area PreDespacho", "PreDesp. Sem", "Semana Fin", "Estado", "Sigla Especie", "Sigla Veriedad", "Inicio Enraizamiento", "Fin Enraizamiento", "Inicio Maduración", "Fin Maduración", "Inicio PreDespacho", "Fin PreDespacho"],
    ...(lots.data ?? []).map((l) => [
      l.lot_code, rel(l.planner_species), rel(l.planner_varieties), l.year, l.start_week, l.plants, l.tray_format, l.trays,
      rel(l.r), l.rooting_weeks, rel(l.m), l.maturation_weeks, rel(l.p), l.predispatch_weeks,
      l.end_week, l.status, null, null,
      l.rooting_start_week, l.rooting_end_week, l.maturation_start_week, l.maturation_end_week, l.predispatch_start_week, l.predispatch_end_week,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetLots), "05_Lotes");

  const sheetCalendar = [
    ["Semana Campaña", "Semana", "Inicio", "Fin", "Mes", "Año"],
    ...(calendar.data ?? []).map((c) => [
      c.campaign_week, c.week, c.start_date, c.end_date, c.month_name, c.year,
    ]),
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetCalendar), "06_Calendario");

  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const today = new Date().toISOString().slice(0, 10);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Vivero Planner export ${today}.xlsx"`,
    },
  });
}
