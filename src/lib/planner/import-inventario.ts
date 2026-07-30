import {
  CHUNK,
  canon,
  chunks,
  loadAliases,
  type AliasMap,
  type ImportSummary,
  type PlannerClient,
} from "@/lib/planner/import-core";
import type { ParsedInventarioFile } from "@/lib/planner/parse-inventario";
import { reconcileLotsWithInventory } from "@/lib/planner/reconcile-lots";

/**
 * Importador del inventario real de hardening ("Inventario Hrd 2026").
 *
 * Reemplaza al de Hotelería como fuente de la ocupación real, con dos ventajas:
 * cubre todo el vivero (189 ubicaciones contra 78) y trae el grano fino —
 * delivery note, variedad, medio de cultivo y fecha de plantación.
 *
 * Escribe en dos lugares:
 *  1. `planner_inventory_items` — el detalle, una fila por línea del archivo.
 *  2. `planner_occupancy_snapshot` — el agregado ubicación × especie, para que
 *     Ocupación y el plano de sector sigan funcionando **sin cambios**.
 */

/** Sin acentos, sin espacios, minúsculas — para comparar nombres de área/especie. */
function normName(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[áàäâ]/g, "a")
    .replace(/[éèëê]/g, "e")
    .replace(/[íìïî]/g, "i")
    .replace(/[óòöô]/g, "o")
    .replace(/[úùüû]/g, "u")
    .replace(/ñ/g, "n")
    .replace(/\s+/g, "");
}

/** Igual pero conservando un espacio simple — para códigos de ubicación. */
function normCode(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[áàäâ]/g, "a")
    .replace(/[éèëê]/g, "e")
    .replace(/[íìïî]/g, "i")
    .replace(/[óòöô]/g, "o")
    .replace(/[úùüû]/g, "u")
    .replace(/ñ/g, "n")
    .replace(/\s+/g, " ");
}

function inventarioStats(parsed: ParsedInventarioFile): Record<string, number> {
  return {
    filas: parsed.rows.length,
    ubicaciones: new Set(parsed.rows.map((r) => `${r.module}|${r.code}`)).size,
    delivery_notes: new Set(parsed.rows.map((r) => r.deliveryNote).filter(Boolean)).size,
    bandejas: parsed.rows.reduce((s, r) => s + r.trays, 0),
    plantas: parsed.rows.reduce((s, r) => s + r.plants, 0),
    con_fecha_plantacion: parsed.rows.filter((r) => r.plantedAt).length,
  };
}

type Area = { id: number; name: string };

/**
 * Módulo del archivo → (área, nombre de módulo canónico). Los tres casos que
 * hay que acertar para NO duplicar ubicaciones:
 *  · "Gótico 1"  → área Góticos, módulo "Gótico 1"   (el área sale de quitar el número)
 *  · "Richel"    → área Zona Clara, módulo "Zona Clara"  (vía alias kind=module)
 *  · "Túnel TEK" → área TunelTek, módulo "TunelTek"  (calza por nombre normalizado)
 */
function makePlaceResolver(aliases: AliasMap, areaByNorm: Map<string, Area>) {
  return (rawModule: string): { areaId: number; moduleName: string } | null => {
    const viaModuleAlias = canon(aliases, "module", rawModule)!;
    const direct = areaByNorm.get(normName(viaModuleAlias));
    if (direct) return { areaId: direct.id, moduleName: direct.name };

    const viaAreaAlias = canon(aliases, "area", rawModule)!;
    const byAlias = areaByNorm.get(normName(viaAreaAlias));
    if (byAlias) return { areaId: byAlias.id, moduleName: rawModule.trim() };

    const stripped = rawModule.replace(/\s*\d+\s*$/, "").trim();
    if (stripped && stripped !== rawModule.trim()) {
      const viaStripped = canon(aliases, "area", stripped)!;
      const hit =
        areaByNorm.get(normName(viaStripped)) ?? areaByNorm.get(normName(stripped));
      if (hit) return { areaId: hit.id, moduleName: rawModule.trim() };
    }
    return null;
  };
}

async function loadAreas(supabase: PlannerClient): Promise<Map<string, Area>> {
  const { data } = await supabase
    .from("planner_areas")
    .select("id, name")
    .eq("active", true);
  return new Map((data ?? []).map((a) => [normName(a.name), { id: a.id, name: a.name }]));
}

export async function previewInventarioCore(
  supabase: PlannerClient,
  parsed: ParsedInventarioFile,
  name: string,
): Promise<ImportSummary> {
  const aliases = await loadAliases(supabase);
  const errors = [...parsed.errors];
  const areaByNorm = await loadAreas(supabase);
  if (!areaByNorm.size) errors.push("No hay áreas cargadas en el Planner.");
  const resolvePlace = makePlaceResolver(aliases, areaByNorm);

  const sinArea = new Map<string, number>();
  for (const r of parsed.rows) {
    if (!resolvePlace(r.module)) {
      sinArea.set(r.module, (sinArea.get(r.module) ?? 0) + 1);
    }
  }

  const { data: dbSpecies } = await supabase.from("planner_species").select("name");
  const speciesByNorm = new Set((dbSpecies ?? []).map((s) => normName(s.name)));
  const sinFicha = new Set<string>();
  for (const r of parsed.rows) {
    const c = canon(aliases, "species", r.speciesName)!;
    if (!speciesByNorm.has(normName(c))) sinFicha.add(c);
  }

  return {
    ok: errors.length === 0,
    kind: "inventario",
    fileName: name,
    stats: inventarioStats(parsed),
    newMasters: {
      modulos_sin_area: [...sinArea.entries()].map(([m, n]) => `${m} (${n} filas)`),
      especies_sin_ficha: [...sinFicha],
    },
    warnings: parsed.warnings,
    errors,
  };
}

export async function applyInventarioCore(
  supabase: PlannerClient,
  parsed: ParsedInventarioFile,
  name: string,
  userId: string | null,
): Promise<ImportSummary> {
  const warnings = [...parsed.warnings];
  const errors = [...parsed.errors];

  if (errors.length || !parsed.rows.length) {
    return {
      ok: false,
      kind: "inventario",
      fileName: name,
      stats: inventarioStats(parsed),
      newMasters: {},
      warnings,
      errors: errors.length ? errors : ["El archivo no contiene filas de inventario."],
    };
  }

  const aliases = await loadAliases(supabase);
  const areaByNorm = await loadAreas(supabase);
  if (!areaByNorm.size) {
    return {
      ok: false,
      kind: "inventario",
      fileName: name,
      stats: inventarioStats(parsed),
      newMasters: {},
      warnings,
      errors: ["No hay áreas cargadas en el Planner."],
    };
  }
  const resolvePlace = makePlaceResolver(aliases, areaByNorm);

  // ── 1. Módulos ────────────────────────────────────────────────────────────
  const sinArea = new Map<string, number>();
  const moduleKeys = new Map<string, { area_id: number; name: string; sort: number }>();
  for (const r of parsed.rows) {
    const place = resolvePlace(r.module);
    if (!place) {
      sinArea.set(r.module, (sinArea.get(r.module) ?? 0) + 1);
      continue;
    }
    const key = `${place.areaId}::${place.moduleName.toLowerCase()}`;
    if (!moduleKeys.has(key)) {
      const num = place.moduleName.match(/(\d+)\s*$/);
      moduleKeys.set(key, {
        area_id: place.areaId,
        name: place.moduleName,
        sort: num ? Number(num[1]) : 0,
      });
    }
  }
  if (moduleKeys.size) {
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

  // ── 2. Ubicaciones ────────────────────────────────────────────────────────
  // Se reusan las existentes comparando el código NORMALIZADO, para no crear
  // variantes: "RACK 1" viene aliaseada a "RACK ZO 1", y "Tunel 7" calzaría con
  // "Túnel 7".
  const { data: existingLocs } = await supabase
    .from("planner_locations")
    .select("id, module_id, code");
  const existingByNorm = new Map<string, { id: number; code: string }>();
  for (const l of existingLocs ?? []) {
    existingByNorm.set(`${l.module_id}::${normCode(l.code)}`, { id: l.id, code: l.code });
  }

  const canonCode = (mid: number, raw: string): string => {
    const viaAlias = canon(aliases, "location", raw)!;
    const hit = existingByNorm.get(`${mid}::${normCode(viaAlias)}`);
    return hit ? hit.code : viaAlias.trim();
  };

  const nuevas: {
    module_id: number;
    code: string;
    side: string | null;
    row_num: number | null;
  }[] = [];
  const seen = new Set<string>();
  for (const r of parsed.rows) {
    const place = resolvePlace(r.module);
    if (!place) continue;
    const mid = moduleId.get(`${place.areaId}::${place.moduleName.toLowerCase()}`);
    if (!mid) continue;
    const code = canonCode(mid, r.code);
    const key = `${mid}::${normCode(code)}`;
    if (seen.has(key) || existingByNorm.has(key)) continue;
    seen.add(key);
    const m = code.match(/^([A-Za-zÁ-Úá-ú])\s*(\d+)$/);
    nuevas.push({
      module_id: mid,
      code,
      side: m ? m[1].toUpperCase() : null,
      row_num: m ? Number(m[2]) : null,
    });
  }
  for (const batch of chunks(nuevas, CHUNK)) {
    const { error } = await supabase
      .from("planner_locations")
      .upsert(batch, { onConflict: "module_id,code" });
    if (error) throw new Error(`Ubicaciones: ${error.message}`);
  }

  const { data: locRows } = await supabase
    .from("planner_locations")
    .select("id, module_id, code");
  const locationId = new Map(
    (locRows ?? []).map((l) => [`${l.module_id}::${normCode(l.code)}`, l.id]),
  );

  // ── 3. Catálogo: se VINCULA a lo existente, nunca se crea ────────────────
  const [{ data: spRows }, { data: vaRows }] = await Promise.all([
    supabase.from("planner_species").select("id, name"),
    supabase.from("planner_varieties").select("id, name, species_id").limit(3000),
  ]);
  const speciesId = new Map((spRows ?? []).map((s) => [normName(s.name), s.id]));
  const varietyId = new Map(
    (vaRows ?? []).map((v) => [`${v.species_id}::${normName(v.name)}`, v.id]),
  );

  // ── 4. Registro de carga ─────────────────────────────────────────────────
  const { data: upload, error: uploadError } = await supabase
    .from("planner_uploads")
    .insert({
      kind: "inventario",
      file_name: name,
      uploaded_by: userId,
      stats: inventarioStats(parsed),
      warnings,
    })
    .select("id")
    .single();
  if (uploadError || !upload) {
    throw new Error(`Registro de carga: ${uploadError?.message}`);
  }

  // ── 5. Detalle ───────────────────────────────────────────────────────────
  const sinEspecieFicha = new Set<string>();
  const sinVariedadFicha = new Set<string>();
  let sinUbicacion = 0;

  const items = parsed.rows.flatMap((r) => {
    const place = resolvePlace(r.module);
    if (!place) return [];
    const mid = moduleId.get(`${place.areaId}::${place.moduleName.toLowerCase()}`);
    const lid = mid
      ? locationId.get(`${mid}::${normCode(canonCode(mid, r.code))}`)
      : undefined;
    if (!lid) {
      sinUbicacion++;
      return [];
    }
    const spName = canon(aliases, "species", r.speciesName)!;
    const sid = speciesId.get(normName(spName)) ?? null;
    if (!sid) sinEspecieFicha.add(spName);

    const vName = r.varietyName ? canon(aliases, "variety", r.varietyName)! : null;
    const vid = sid && vName ? (varietyId.get(`${sid}::${normName(vName)}`) ?? null) : null;
    if (vName && !vid) sinVariedadFicha.add(`${spName} / ${vName}`);

    return [
      {
        upload_id: upload.id,
        location_id: lid,
        delivery_note: r.deliveryNote,
        barcode: r.barcode,
        species_id: sid,
        species_name: spName,
        variety_id: vid,
        variety_name: vName,
        medio: r.medio,
        tamano: r.tamano,
        clump: r.clump,
        sustrato: r.sustrato,
        estado: r.estado,
        material_raw: r.materialRaw,
        trays: r.trays,
        saldos: r.saldos,
        plants: r.plants,
        tray_format: r.trayFormat,
        planted_at: r.plantedAt,
        week: r.week,
        age_weeks: r.ageWeeks,
        observacion: r.observacion,
      },
    ];
  });

  for (const batch of chunks(items, CHUNK)) {
    const { error } = await supabase.from("planner_inventory_items").insert(batch);
    if (error) throw new Error(`Detalle de inventario: ${error.message}`);
  }

  // ── 6. Snapshot agregado (ubicación × especie) ───────────────────────────
  const agg = new Map<
    string,
    {
      location_id: number;
      species_id: number | null;
      species_name: string;
      trays: number;
      plants: number;
    }
  >();
  for (const it of items) {
    const key = `${it.location_id}::${normName(it.species_name)}`;
    const prev = agg.get(key);
    if (prev) {
      prev.trays += it.trays;
      prev.plants += it.plants;
    } else {
      agg.set(key, {
        location_id: it.location_id,
        species_id: it.species_id,
        species_name: it.species_name,
        trays: it.trays,
        plants: it.plants,
      });
    }
  }
  const snapshotRows = [...agg.values()].map((a) => ({ ...a, upload_id: upload.id }));
  for (const batch of chunks(snapshotRows, CHUNK)) {
    const { error } = await supabase.from("planner_occupancy_snapshot").insert(batch);
    if (error) throw new Error(`Snapshot: ${error.message}`);
  }

  // ── 7. Reconciliación plan ↔ realidad ("la realidad manda") ─────────────
  // Material presente cuyo lote figura entrando a futuro → se adelanta la
  // semana del lote automáticamente (≤4 sem de horizonte), con registro en
  // el historial. Un fallo acá no invalida la carga: se reporta y sigue.
  let lotesReconciliados = 0;
  try {
    const rec = await reconcileLotsWithInventory(supabase, upload.id, userId);
    lotesReconciliados = rec.adjusted.length;
    warnings.push(...rec.warnings);
    if (rec.adjusted.length) {
      warnings.push(
        `Reconciliación automática: ${rec.adjusted
          .map((a) => `${a.lotCode} (${a.area}, S${a.fromWeek}→S${a.toWeek})`)
          .join(", ")} — material ya presente, el plan se ajustó a la realidad.`,
      );
    }
  } catch (e) {
    warnings.push(
      `Reconciliación automática falló (la carga quedó bien): ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (sinArea.size) {
    warnings.push(
      `Módulos sin área equivalente (se omitieron): ${[...sinArea.entries()]
        .map(([m, n]) => `${m} (${n} filas)`)
        .join(", ")}. Creá el área o agregá un alias.`,
    );
  }
  if (sinUbicacion) {
    warnings.push(`${sinUbicacion} filas cuya ubicación no se pudo resolver — omitidas.`);
  }
  if (sinEspecieFicha.size) {
    warnings.push(
      `Especies sin ficha en el Planner (quedan como texto): ${[...sinEspecieFicha].join(", ")}.`,
    );
  }
  if (sinVariedadFicha.size) {
    const l = [...sinVariedadFicha];
    warnings.push(
      `${l.length} variedades sin ficha en el Planner (quedan como texto): ${l.slice(0, 12).join(", ")}${l.length > 12 ? "…" : ""}.`,
    );
  }

  return {
    ok: true,
    kind: "inventario",
    fileName: name,
    stats: {
      ...inventarioStats(parsed),
      detalle_insertado: items.length,
      snapshot_insertado: snapshotRows.length,
      ubicaciones_nuevas: nuevas.length,
      lotes_reconciliados: lotesReconciliados,
    },
    newMasters: {},
    warnings,
    errors,
  };
}
