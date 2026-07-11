import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import type { ParsedPlannerFile } from "@/lib/planner/parse-planner";
import type { ParsedHoteleriaFile } from "@/lib/planner/parse-hoteleria";

/**
 * Núcleo de los importadores del Planner — funciones puras sobre un
 * SupabaseClient (server action o script). Filosofía (masterplan §3): los
 * archivos se pisan — cada carga reemplaza demanda/lotes/snapshot, pero los
 * maestros (áreas, especies, variedades, calendario) solo se upsertean,
 * nunca se borran.
 */

export type ImportSummary = {
  ok: boolean;
  kind: "planner" | "hoteleria";
  fileName: string;
  stats: Record<string, number>;
  newMasters: Record<string, string[]>;
  warnings: string[];
  errors: string[];
};

export type UploadRow = {
  id: string;
  kind: string;
  file_name: string;
  status: string;
  stats: Record<string, number>;
  warnings: string[];
  created_at: string;
  uploaded_by_name: string | null;
};

const CHUNK = 500;

export type PlannerClient = SupabaseClient<Database>;

type AliasMap = Map<string, Map<string, string>>;

async function loadAliases(supabase: PlannerClient): Promise<AliasMap> {
  const { data } = await supabase.from("planner_aliases").select("kind, alias, canonical");
  const map: AliasMap = new Map();
  for (const row of data ?? []) {
    if (!map.has(row.kind)) map.set(row.kind, new Map());
    map.get(row.kind)!.set(row.alias.trim().toLowerCase(), row.canonical);
  }
  return map;
}

function canon(aliases: AliasMap, kind: string, raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  return aliases.get(kind)?.get(s.toLowerCase()) ?? s;
}

function chunks<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/* ------------------------------------------------------------------ */
/* Vivero Planner                                                      */
/* ------------------------------------------------------------------ */

function plannerStats(parsed: ParsedPlannerFile): Record<string, number> {
  return {
    areas: parsed.areas.length,
    especies: parsed.species.length,
    variedades: parsed.varieties.length,
    semanas_calendario: parsed.calendar.length,
    demanda: parsed.demand.length,
    lotes: parsed.lots.length,
  };
}

export async function previewPlannerCore(
  supabase: PlannerClient,
  parsed: ParsedPlannerFile,
  name: string,
): Promise<ImportSummary> {
  const aliases = await loadAliases(supabase);

  const [{ data: dbSpecies }, { data: dbAreas }, lotsCount, demandCount] =
    await Promise.all([
      supabase.from("planner_species").select("name"),
      supabase.from("planner_areas").select("name"),
      supabase.from("planner_lots").select("id", { count: "exact", head: true }),
      supabase.from("planner_demand").select("id", { count: "exact", head: true }),
    ]);

  const existingSpecies = new Set((dbSpecies ?? []).map((s) => s.name.toLowerCase()));
  const existingAreas = new Set((dbAreas ?? []).map((a) => a.name.toLowerCase()));
  const newSpecies = parsed.species
    .map((s) => canon(aliases, "species", s.name)!)
    .filter((n) => !existingSpecies.has(n.toLowerCase()));
  const newAreas = parsed.areas
    .map((a) => canon(aliases, "area", a.name)!)
    .filter((n) => !existingAreas.has(n.toLowerCase()));

  return {
    ok: parsed.errors.length === 0,
    kind: "planner",
    fileName: name,
    stats: {
      ...plannerStats(parsed),
      lotes_actuales_a_reemplazar: lotsCount.count ?? 0,
      demanda_actual_a_reemplazar: demandCount.count ?? 0,
    },
    newMasters: { areas: newAreas, especies: newSpecies },
    warnings: parsed.warnings,
    errors: parsed.errors,
  };
}

export async function applyPlannerCore(
  supabase: PlannerClient,
  parsed: ParsedPlannerFile,
  name: string,
  userId: string | null,
): Promise<ImportSummary> {
  const errors = [...parsed.errors];

  if (parsed.areas.length === 0 || parsed.species.length === 0) {
    return {
      ok: false,
      kind: "planner",
      fileName: name,
      stats: plannerStats(parsed),
      newMasters: {},
      warnings: parsed.warnings,
      errors: errors.length ? errors : ["El archivo no contiene áreas/especies."],
    };
  }

  const aliases = await loadAliases(supabase);

  // 1. Áreas (upsert por nombre)
  {
    const rows = parsed.areas.map((a) => ({
      name: canon(aliases, "area", a.name)!,
      stage: a.stage,
      capacity_trays: a.capacityTrays,
      type: a.type,
      priority: a.priority,
      active: a.active,
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("planner_areas")
      .upsert(rows, { onConflict: "name" });
    if (error) throw new Error(`Áreas: ${error.message}`);
  }
  const { data: areaRows } = await supabase.from("planner_areas").select("id, name");
  const areaId = new Map((areaRows ?? []).map((a) => [a.name.toLowerCase(), a.id]));
  const resolveArea = (raw: string | null): number | null => {
    const c = canon(aliases, "area", raw);
    if (!c) return null;
    return areaId.get(c.toLowerCase()) ?? null;
  };

  // 2. Especies (upsert por nombre)
  {
    const rows = parsed.species.map((s) => ({
      name: canon(aliases, "species", s.name)!,
      code: s.code,
      tray_format: s.trayFormat,
      rooting_area_id: resolveArea(s.rootingArea),
      rooting_weeks: s.rootingWeeks,
      maturation_area_id: resolveArea(s.maturationArea),
      maturation_weeks: s.maturationWeeks,
      predispatch_area_id: resolveArea(s.predispatchArea),
      predispatch_weeks: s.predispatchWeeks,
      priority: s.priority,
      active: s.active,
      family: s.family,
      color: s.color,
    }));
    const { error } = await supabase
      .from("planner_species")
      .upsert(rows, { onConflict: "name" });
    if (error) throw new Error(`Especies: ${error.message}`);
  }
  const { data: speciesRows } = await supabase
    .from("planner_species")
    .select("id, name");
  const speciesId = new Map(
    (speciesRows ?? []).map((s) => [s.name.toLowerCase(), s.id]),
  );
  const resolveSpecies = (raw: string | null): number | null => {
    const c = canon(aliases, "species", raw);
    if (!c) return null;
    return speciesId.get(c.toLowerCase()) ?? null;
  };

  // 3. Variedades: las de la tabla + las que aparecen en demanda/lotes.
  {
    const pairs = new Map<string, { species_id: number; name: string; code: string | null }>();
    for (const v of parsed.varieties) {
      const sid = resolveSpecies(v.speciesName);
      if (!sid) continue;
      pairs.set(`${sid}::${v.name.toLowerCase()}`, {
        species_id: sid,
        name: v.name,
        code: v.code,
      });
    }
    for (const d of [...parsed.demand, ...parsed.lots]) {
      const vn = "varietyName" in d ? d.varietyName : null;
      if (!vn) continue;
      const sid = resolveSpecies(d.speciesName);
      if (!sid) continue;
      const key = `${sid}::${vn.toLowerCase()}`;
      if (!pairs.has(key)) pairs.set(key, { species_id: sid, name: vn, code: null });
    }
    for (const batch of chunks([...pairs.values()], CHUNK)) {
      const { error } = await supabase
        .from("planner_varieties")
        .upsert(batch, { onConflict: "species_id,name", ignoreDuplicates: false });
      if (error) throw new Error(`Variedades: ${error.message}`);
    }
  }
  const { data: varietyRows } = await supabase
    .from("planner_varieties")
    .select("id, species_id, name");
  const varietyId = new Map(
    (varietyRows ?? []).map((v) => [`${v.species_id}::${v.name.toLowerCase()}`, v.id]),
  );

  // 4. Calendario + parámetros
  {
    const rows = parsed.calendar.map((c) => ({
      year: c.year,
      week: c.week,
      campaign_week: c.campaignWeek,
      start_date: c.startDate,
      end_date: c.endDate,
      month_name: c.monthName,
    }));
    for (const batch of chunks(rows, CHUNK)) {
      const { error } = await supabase
        .from("planner_calendar_weeks")
        .upsert(batch, { onConflict: "year,week" });
      if (error) throw new Error(`Calendario: ${error.message}`);
    }
    const params = parsed.parameters.map((p) => ({
      key: p.key,
      value: p.value,
      comment: p.comment,
      updated_at: new Date().toISOString(),
    }));
    if (params.length) {
      const { error } = await supabase
        .from("planner_parameters")
        .upsert(params, { onConflict: "key" });
      if (error) throw new Error(`Parámetros: ${error.message}`);
    }
  }

  // 5. Registro de carga
  const { data: upload, error: uploadError } = await supabase
    .from("planner_uploads")
    .insert({
      kind: "planner",
      file_name: name,
      uploaded_by: userId,
      stats: plannerStats(parsed),
      warnings: parsed.warnings,
    })
    .select("id")
    .single();
  if (uploadError || !upload) {
    throw new Error(`Registro de carga: ${uploadError?.message}`);
  }

  // 6. Reemplazo total de demanda y lotes (los archivos se pisan)
  {
    const del1 = await supabase.from("planner_demand").delete().gte("id", 0);
    if (del1.error) throw new Error(`Limpiando demanda: ${del1.error.message}`);
    const del2 = await supabase.from("planner_lots").delete().gte("id", 0);
    if (del2.error) throw new Error(`Limpiando lotes: ${del2.error.message}`);

    let skippedDemand = 0;
    const demandRows = parsed.demand.flatMap((d) => {
      const sid = resolveSpecies(d.speciesName);
      if (!sid) {
        skippedDemand++;
        return [];
      }
      return [
        {
          upload_id: upload.id,
          year: d.year,
          month_name: d.monthName,
          week: d.week,
          species_id: sid,
          variety_id: d.varietyName
            ? (varietyId.get(`${sid}::${d.varietyName.toLowerCase()}`) ?? null)
            : null,
          plants: d.plants,
          tray_format: d.trayFormat,
          trays: d.trays,
        },
      ];
    });
    for (const batch of chunks(demandRows, CHUNK)) {
      const { error } = await supabase.from("planner_demand").insert(batch);
      if (error) throw new Error(`Demanda: ${error.message}`);
    }
    if (skippedDemand) {
      errors.push(`${skippedDemand} filas de demanda con especie desconocida — omitidas.`);
    }

    let skippedLots = 0;
    const lotRows = parsed.lots.flatMap((l) => {
      const sid = resolveSpecies(l.speciesName);
      if (!sid) {
        skippedLots++;
        return [];
      }
      return [
        {
          upload_id: upload.id,
          lot_code: l.lotCode,
          species_id: sid,
          variety_id: l.varietyName
            ? (varietyId.get(`${sid}::${l.varietyName.toLowerCase()}`) ?? null)
            : null,
          year: l.year,
          start_week: l.startWeek,
          plants: l.plants,
          tray_format: l.trayFormat,
          trays: l.trays,
          rooting_area_id: resolveArea(l.rootingArea),
          rooting_weeks: l.rootingWeeks,
          rooting_start_week: l.rootingStartWeek,
          rooting_end_week: l.rootingEndWeek,
          maturation_area_id: resolveArea(l.maturationArea),
          maturation_weeks: l.maturationWeeks,
          maturation_start_week: l.maturationStartWeek,
          maturation_end_week: l.maturationEndWeek,
          predispatch_area_id: resolveArea(l.predispatchArea),
          predispatch_weeks: l.predispatchWeeks,
          predispatch_start_week: l.predispatchStartWeek,
          predispatch_end_week: l.predispatchEndWeek,
          end_week: l.endWeek,
          status: l.status,
        },
      ];
    });
    for (const batch of chunks(lotRows, CHUNK)) {
      const { error } = await supabase.from("planner_lots").insert(batch);
      if (error) throw new Error(`Lotes: ${error.message}`);
    }
    if (skippedLots) {
      errors.push(`${skippedLots} lotes con especie desconocida — omitidos.`);
    }
  }

  return {
    ok: true,
    kind: "planner",
    fileName: name,
    stats: plannerStats(parsed),
    newMasters: {},
    warnings: parsed.warnings,
    errors,
  };
}

/* ------------------------------------------------------------------ */
/* Hotelería                                                           */
/* ------------------------------------------------------------------ */

function hoteleriaStats(parsed: ParsedHoteleriaFile): Record<string, number> {
  return {
    ubicaciones: parsed.locations.length,
    filas_snapshot: parsed.occupancy.length,
  };
}

export async function previewHoteleriaCore(
  supabase: PlannerClient,
  parsed: ParsedHoteleriaFile,
  name: string,
): Promise<ImportSummary> {
  const aliases = await loadAliases(supabase);

  const { data: dbAreas } = await supabase.from("planner_areas").select("name");
  const areaNames = new Set((dbAreas ?? []).map((a) => a.name.toLowerCase()));
  const errors = [...parsed.errors];
  if (!areaNames.size) {
    errors.push("No hay áreas cargadas — importa primero el Vivero Planner.");
  }

  const unknownAreas = new Set<string>();
  for (const l of parsed.locations) {
    const candidates = [canon(aliases, "area", l.module), canon(aliases, "area", l.sector)];
    if (!candidates.some((c) => c && areaNames.has(c.toLowerCase()))) {
      unknownAreas.add(`${l.sector} / ${l.module}`);
    }
  }

  const { data: dbSpecies } = await supabase.from("planner_species").select("name");
  const speciesNames = new Set((dbSpecies ?? []).map((s) => s.name.toLowerCase()));
  const unknownSpecies = new Set<string>();
  for (const o of parsed.occupancy) {
    const c = canon(aliases, "species", o.speciesName)!;
    if (!speciesNames.has(c.toLowerCase())) unknownSpecies.add(c);
  }

  return {
    ok: errors.length === 0,
    kind: "hoteleria",
    fileName: name,
    stats: hoteleriaStats(parsed),
    newMasters: {
      sectores_sin_area: [...unknownAreas],
      especies_solo_snapshot: [...unknownSpecies],
    },
    warnings: parsed.warnings,
    errors,
  };
}

export async function applyHoteleriaCore(
  supabase: PlannerClient,
  parsed: ParsedHoteleriaFile,
  name: string,
  userId: string | null,
): Promise<ImportSummary> {
  const warnings = [...parsed.warnings];
  const errors = [...parsed.errors];

  if (errors.length || parsed.locations.length === 0) {
    return {
      ok: false,
      kind: "hoteleria",
      fileName: name,
      stats: hoteleriaStats(parsed),
      newMasters: {},
      warnings,
      errors: errors.length ? errors : ["El archivo no contiene ubicaciones."],
    };
  }

  const aliases = await loadAliases(supabase);
  const { data: areaRows } = await supabase.from("planner_areas").select("id, name");
  const areaId = new Map((areaRows ?? []).map((a) => [a.name.toLowerCase(), a.id]));
  if (!areaId.size) {
    return {
      ok: false,
      kind: "hoteleria",
      fileName: name,
      stats: hoteleriaStats(parsed),
      newMasters: {},
      warnings,
      errors: ["No hay áreas cargadas — importa primero el Vivero Planner."],
    };
  }

  /**
   * Resuelve (sector, módulo) → { areaId, moduleName }.
   * Si el módulo mapea directo a un área (ej. "Richell Zona Clara" →
   * "Zona Clara"), el módulo toma el nombre del área y las ubicaciones
   * (Túnel 1…) cuelgan de él.
   */
  const resolvePlace = (
    sector: string,
    module: string,
  ): { areaId: number; moduleName: string } | null => {
    const fromModule = canon(aliases, "area", module)!;
    if (areaId.has(fromModule.toLowerCase())) {
      return { areaId: areaId.get(fromModule.toLowerCase())!, moduleName: fromModule };
    }
    const fromSector = canon(aliases, "area", sector)!;
    if (areaId.has(fromSector.toLowerCase())) {
      return { areaId: areaId.get(fromSector.toLowerCase())!, moduleName: module.trim() };
    }
    return null;
  };

  // 1. Módulos
  const moduleKeys = new Map<string, { area_id: number; name: string; sort: number }>();
  const skippedPlaces = new Set<string>();
  for (const l of parsed.locations) {
    const place = resolvePlace(l.sector, l.module);
    if (!place) {
      skippedPlaces.add(`${l.sector} / ${l.module}`);
      continue;
    }
    const key = `${place.areaId}::${place.moduleName.toLowerCase()}`;
    if (!moduleKeys.has(key)) {
      const numMatch = place.moduleName.match(/(\d+)\s*$/);
      moduleKeys.set(key, {
        area_id: place.areaId,
        name: place.moduleName,
        sort: numMatch ? Number(numMatch[1]) : 0,
      });
    }
  }
  if (skippedPlaces.size) {
    errors.push(
      `Sectores sin área equivalente (se omitieron): ${[...skippedPlaces].join(", ")}. Agrega un alias o el área correspondiente.`,
    );
  }
  {
    const { error } = await supabase
      .from("planner_modules")
      .upsert([...moduleKeys.values()], { onConflict: "area_id,name" });
    if (error) throw new Error(`Módulos: ${error.message}`);
  }
  const { data: moduleRows } = await supabase
    .from("planner_modules")
    .select("id, area_id, name");
  const moduleId = new Map(
    (moduleRows ?? []).map((m) => [`${m.area_id}::${m.name.toLowerCase()}`, m.id]),
  );

  // 2. Ubicaciones (upsert por módulo + código; lado/fila desde nomenclatura)
  const locKey = (mid: number, code: string) => `${mid}::${code.toLowerCase()}`;
  {
    const rows = new Map<
      string,
      {
        module_id: number;
        code: string;
        side: string | null;
        row_num: number | null;
        capacity_trays: number | null;
        tray_format: number | null;
      }
    >();
    for (const l of parsed.locations) {
      const place = resolvePlace(l.sector, l.module);
      if (!place) continue;
      const mid = moduleId.get(`${place.areaId}::${place.moduleName.toLowerCase()}`);
      if (!mid) continue;
      const m = l.code.match(/^([A-Za-zÁ-Úá-ú])\s*(\d+)$/);
      rows.set(locKey(mid, l.code), {
        module_id: mid,
        code: l.code,
        side: m ? m[1].toUpperCase() : null,
        row_num: m ? Number(m[2]) : null,
        capacity_trays: l.capacityTrays,
        tray_format: l.trayFormat,
      });
    }
    for (const batch of chunks([...rows.values()], CHUNK)) {
      const { error } = await supabase
        .from("planner_locations")
        .upsert(batch, { onConflict: "module_id,code" });
      if (error) throw new Error(`Ubicaciones: ${error.message}`);
    }
  }
  const { data: locationRows } = await supabase
    .from("planner_locations")
    .select("id, module_id, code");
  const locationId = new Map(
    (locationRows ?? []).map((l) => [locKey(l.module_id, l.code), l.id]),
  );

  // 3. Snapshot de ocupación (nueva carga = nueva foto; el histórico queda)
  const { data: upload, error: uploadError } = await supabase
    .from("planner_uploads")
    .insert({
      kind: "hoteleria",
      file_name: name,
      uploaded_by: userId,
      stats: hoteleriaStats(parsed),
      warnings,
    })
    .select("id")
    .single();
  if (uploadError || !upload) {
    throw new Error(`Registro de carga: ${uploadError?.message}`);
  }

  const { data: speciesRows } = await supabase
    .from("planner_species")
    .select("id, name");
  const speciesId = new Map(
    (speciesRows ?? []).map((s) => [s.name.toLowerCase(), s.id]),
  );

  let unknownLocation = 0;
  const unknownSpecies = new Set<string>();
  const snapshotRows = parsed.occupancy.flatMap((o) => {
    const place = resolvePlace(o.sector, o.module);
    if (!place) return [];
    const mid = moduleId.get(`${place.areaId}::${place.moduleName.toLowerCase()}`);
    const lid = mid ? locationId.get(locKey(mid, o.code)) : undefined;
    if (!lid) {
      unknownLocation++;
      return [];
    }
    const cName = canon(aliases, "species", o.speciesName)!;
    const sid = speciesId.get(cName.toLowerCase()) ?? null;
    if (!sid) unknownSpecies.add(cName);
    return [
      {
        upload_id: upload.id,
        location_id: lid,
        species_id: sid,
        species_name: cName,
        trays: o.trays,
        plants: o.plants,
      },
    ];
  });
  for (const batch of chunks(snapshotRows, CHUNK)) {
    const { error } = await supabase
      .from("planner_occupancy_snapshot")
      .insert(batch);
    if (error) throw new Error(`Snapshot: ${error.message}`);
  }
  if (unknownLocation) {
    warnings.push(
      `${unknownLocation} filas de detalle sin ubicación en el Resumen General — omitidas.`,
    );
  }
  if (unknownSpecies.size) {
    warnings.push(
      `Especies del snapshot sin ficha en el Planner (quedan solo como texto): ${[...unknownSpecies].join(", ")}.`,
    );
  }

  return {
    ok: true,
    kind: "hoteleria",
    fileName: name,
    stats: { ...hoteleriaStats(parsed), snapshot_insertado: snapshotRows.length },
    newMasters: {},
    warnings,
    errors,
  };
}

