import * as XLSX from "xlsx";

/**
 * Parser del archivo "Inventario Hrd 2026" — el inventario real de hardening.
 *
 * Reemplaza al de Hotelería como fuente de la ocupación real. La diferencia es
 * de grano: hotelería venía pre-agregado en tablas dinámicas (ubicación × especie,
 * 97 filas) y este trae **una fila por barcode** (1.292 filas) con delivery note,
 * variedad, medio de cultivo, formato y fecha de plantación.
 *
 * Se lee solo la hoja "Inventario 2026". Las otras (Rendimiento cutting,
 * PLANTAS EN CUARENTENA, Gráficos, Analisis de Inventario, Florida, Hoja1) se
 * ignoran a propósito.
 *
 * Verificado sobre el archivo real: `Plantas` = `Bandejas` × `Formato` + `Saldos`
 * en las 1.236 filas con cantidad, sin una sola excepción. `Saldos` son las
 * plantas sueltas que no llenan una bandeja completa.
 */

export type MaterialMedio = "TC" | "RT" | "MP";
export type MaterialTamano = "Grande" | "Chico";
export type MaterialEstado = "PRE" | "TRASPLANTE";

export type ParsedInventarioRow = {
  /** módulo tal como viene ("Gótico 3", "Richel ZO", "Túnel TEK", "HFM") */
  module: string;
  /** ubicación dentro del módulo ("E1", "Túnel 8", "1-A Cama 2", "RACK 1") */
  code: string;
  deliveryNote: string | null;
  barcode: string | null;
  speciesName: string;
  varietyName: string | null;
  medio: MaterialMedio | null;
  tamano: MaterialTamano | null;
  clump: boolean;
  sustrato: boolean;
  estado: MaterialEstado | null;
  materialRaw: string | null;
  trays: number;
  saldos: number;
  plants: number;
  trayFormat: number | null;
  /** ISO (yyyy-mm-dd) o null si falta / es inválida */
  plantedAt: string | null;
  week: number | null;
  ageWeeks: number | null;
  observacion: string | null;
};

export type ParsedInventarioFile = {
  rows: ParsedInventarioRow[];
  warnings: string[];
  errors: string[];
};

const SHEET = "Inventario 2026";

/** Rango razonable para una fecha de plantación; fuera de esto es dato corrupto. */
const MIN_YEAR = 2015;
const MAX_YEAR = 2035;

function cleanStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function intOrZero(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function intOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** Excel serial (base 1899-12-30) → Date. Solo se usa si no vino como Date. */
function fromExcelSerial(n: number): Date {
  return new Date(Math.round((n - 25569) * 86400 * 1000));
}

function toIsoDate(v: unknown): { iso: string | null; invalid: boolean } {
  if (v === null || v === undefined || v === "") return { iso: null, invalid: false };
  let d: Date | null = null;
  if (v instanceof Date) d = v;
  else if (typeof v === "number" && Number.isFinite(v)) d = fromExcelSerial(v);
  else {
    const parsed = new Date(String(v));
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d || Number.isNaN(d.getTime())) return { iso: null, invalid: true };
  const y = d.getFullYear();
  if (y < MIN_YEAR || y > MAX_YEAR) return { iso: null, invalid: true };
  // Fecha local sin hora — evita corrimientos de zona al serializar.
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return { iso: `${y}-${mm}-${dd}`, invalid: false };
}

/**
 * `Tipo Material` mezcla cinco dimensiones. Vocabulario confirmado por el
 * usuario: RT = rooting y MP = multiplicación son el MEDIO DE CULTIVO con que
 * las plantas salieron del laboratorio (junto con TC son las tres de origen
 * vitro — RT NO significa cutting); G / C / Clump describen el FORMATO del
 * material, y Clump se COMBINA con el tamaño (existen `RT-Clumps-G` y
 * `RT-Clumps-C`), no lo excluye.
 *
 * Cubre 1.286 de 1.292 filas; el resto sin interpretar queda en `materialRaw`.
 */
export function parseTipoMaterial(raw: string | null): {
  medio: MaterialMedio | null;
  tamano: MaterialTamano | null;
  clump: boolean;
  sustrato: boolean;
  estado: MaterialEstado | null;
  resto: string | null;
} {
  let t = (raw ?? "").trim();
  if (!t) {
    return { medio: null, tamano: null, clump: false, sustrato: false, estado: null, resto: null };
  }

  let estado: MaterialEstado | null = null;
  if (/^pre\s+/i.test(t)) {
    estado = "PRE";
    t = t.replace(/^pre\s+/i, "");
  } else if (/^trasplante\b/i.test(t)) {
    estado = "TRASPLANTE";
    t = t.replace(/^trasplante\s*/i, "");
  }

  let medio: MaterialMedio | null = null;
  const m = t.match(/^(TC|RT|MP)\b/i);
  if (m) {
    medio = m[1].toUpperCase() as MaterialMedio;
    t = t.slice(m[1].length);
  }

  const clump = /clumps?/i.test(t);
  t = t.replace(/-?\s*clumps?/i, "");

  const sustrato = /sustrato/i.test(t);
  t = t.replace(/-?\s*sustrato/i, "");

  let tamano: MaterialTamano | null = null;
  const s = t.match(/-\s*(G|C)\b/i);
  if (s) {
    tamano = s[1].toUpperCase() === "G" ? "Grande" : "Chico";
    t = t.replace(s[0], "");
  }

  const resto = t.replace(/^[-\s]+/, "").trim();
  return { medio, tamano, clump, sustrato, estado, resto: resto || null };
}

function rows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });
}

export function parseInventarioWorkbook(
  buffer: Buffer | ArrayBuffer,
): ParsedInventarioFile {
  // cellDates para que `Fecha Plantacion` llegue como Date y no como serial.
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const warnings: string[] = [];
  const errors: string[] = [];
  const out: ParsedInventarioRow[] = [];

  const sheetName = wb.SheetNames.find(
    (n) => n.trim().toLowerCase() === SHEET.toLowerCase(),
  );
  if (!sheetName) {
    errors.push(
      `El archivo no parece ser el Inventario de hardening: falta la hoja "${SHEET}". Hojas encontradas: ${wb.SheetNames.join(", ")}.`,
    );
    return { rows: out, warnings, errors };
  }

  const data = rows(wb.Sheets[sheetName]);
  // La primera fila es de totales; el encabezado real arranca con "Módulo".
  const headerIdx = data.findIndex(
    (r) => (cleanStr(r[0]) ?? "").toLowerCase() === "módulo",
  );
  if (headerIdx < 0) {
    errors.push(`"${sheetName}": no se encontró la fila de encabezado (columna "Módulo").`);
    return { rows: out, warnings, errors };
  }

  const header = data[headerIdx].map((c) => (cleanStr(c) ?? "").toLowerCase());
  const col = (name: string) => header.findIndex((h) => h === name.toLowerCase());
  const idx = {
    module: col("Módulo"),
    code: col("Ubicacion"),
    barcode: col("Barcode"),
    deliveryNote: col("Delivery note"),
    species: col("Especie"),
    variety: col("Variedad"),
    material: col("Tipo Material"),
    plantedAt: col("Fecha Plantacion"),
    week: col("wk"),
    age: col("Edad"),
    format: col("Formato"),
    trays: col("Bandejas"),
    saldos: col("Saldos"),
    plants: col("Plantas"),
    observacion: col("Observacion"),
  };

  const faltantes = Object.entries(idx)
    .filter(([, v]) => v < 0)
    .map(([k]) => k);
  if (idx.module < 0 || idx.code < 0 || idx.plants < 0) {
    errors.push(
      `"${sheetName}": faltan columnas obligatorias (${faltantes.join(", ")}).`,
    );
    return { rows: out, warnings, errors };
  }

  let sinEspecie = 0;
  let fechaInvalida = 0;
  let descuadre = 0;
  const restos = new Set<string>();

  for (const r of data.slice(headerIdx + 1)) {
    const moduleName = cleanStr(r[idx.module]);
    if (!moduleName) continue; // filas de totales / vacías al final

    const speciesName = cleanStr(r[idx.species]);
    if (!speciesName) {
      sinEspecie++;
      continue;
    }
    const code = cleanStr(r[idx.code]);
    if (!code) continue;

    const trays = intOrZero(r[idx.trays]);
    const saldos = idx.saldos >= 0 ? intOrZero(r[idx.saldos]) : 0;
    const plants = intOrZero(r[idx.plants]);
    const trayFormat = idx.format >= 0 ? intOrNull(r[idx.format]) : null;

    // Chequeo de coherencia contra la fórmula verificada del archivo.
    if (plants > 0 && trayFormat !== null && plants !== trays * trayFormat + saldos) {
      descuadre++;
    }

    const fecha = idx.plantedAt >= 0 ? toIsoDate(r[idx.plantedAt]) : { iso: null, invalid: false };
    if (fecha.invalid) fechaInvalida++;

    const mat = parseTipoMaterial(idx.material >= 0 ? cleanStr(r[idx.material]) : null);
    if (mat.resto) restos.add(mat.resto);

    out.push({
      module: moduleName,
      code,
      deliveryNote: idx.deliveryNote >= 0 ? cleanStr(r[idx.deliveryNote]) : null,
      barcode: idx.barcode >= 0 ? cleanStr(r[idx.barcode]) : null,
      speciesName,
      varietyName: idx.variety >= 0 ? cleanStr(r[idx.variety]) : null,
      medio: mat.medio,
      tamano: mat.tamano,
      clump: mat.clump,
      sustrato: mat.sustrato,
      estado: mat.estado,
      materialRaw: idx.material >= 0 ? cleanStr(r[idx.material]) : null,
      trays,
      saldos,
      plants,
      trayFormat,
      plantedAt: fecha.iso,
      week: idx.week >= 0 ? intOrNull(r[idx.week]) : null,
      ageWeeks: idx.age >= 0 ? intOrNull(r[idx.age]) : null,
      observacion: idx.observacion >= 0 ? cleanStr(r[idx.observacion]) : null,
    });
  }

  if (!out.length) {
    errors.push(`"${sheetName}": no se encontró ninguna fila de inventario válida.`);
  }
  if (sinEspecie) {
    warnings.push(
      `${sinEspecie} filas sin especie — se omitieron (vienen así en el archivo).`,
    );
  }
  if (fechaInvalida) {
    warnings.push(
      `${fechaInvalida} filas con fecha de plantación inválida o fuera de rango (${MIN_YEAR}-${MAX_YEAR}) — quedan sin fecha, así no distorsionan la antigüedad.`,
    );
  }
  if (descuadre) {
    warnings.push(
      `${descuadre} filas donde Plantas ≠ Bandejas × Formato + Saldos — se respeta el valor de Plantas del archivo.`,
    );
  }
  if (restos.size) {
    warnings.push(
      `Variantes de "Tipo Material" no interpretadas (se guardan crudas): ${[...restos].join(", ")}.`,
    );
  }

  return { rows: out, warnings, errors };
}
