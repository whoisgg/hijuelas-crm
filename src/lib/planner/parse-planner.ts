import * as XLSX from "xlsx";

/**
 * Parser del archivo "Vivero Planner" (v1.x). Lee las hojas 01–06 y
 * devuelve datos normalizados + advertencias de calidad. No toca la BD.
 *
 * Reglas de calidad (masterplan §3):
 *  - trim de nombres (corrige "Arandano " con espacio final)
 *  - bandejas decimales → ceil
 *  - duraciones 0 / fechas invertidas → warning, no bloquea
 */

export type ParsedArea = {
  name: string;
  stage: "enraizamiento" | "maduracion" | "predespacho";
  capacityTrays: number;
  type: string | null;
  priority: number;
  active: boolean;
};

export type ParsedSpecies = {
  name: string;
  code: string | null;
  trayFormat: number;
  rootingArea: string | null;
  rootingWeeks: number;
  maturationArea: string | null;
  maturationWeeks: number;
  predispatchArea: string | null;
  predispatchWeeks: number;
  priority: number;
  active: boolean;
  family: string | null;
  color: string | null;
};

export type ParsedVariety = { speciesName: string; name: string; code: string | null };

export type ParsedCalendarWeek = {
  campaignWeek: number | null;
  week: number;
  year: number;
  startDate: string | null;
  endDate: string | null;
  monthName: string | null;
};

export type ParsedDemand = {
  year: number;
  monthName: string | null;
  week: number;
  speciesName: string;
  varietyName: string | null;
  plants: number;
  trayFormat: number | null;
  trays: number | null;
};

export type ParsedLot = {
  lotCode: string;
  speciesName: string;
  varietyName: string | null;
  year: number;
  startWeek: number;
  plants: number;
  trayFormat: number | null;
  trays: number | null;
  rootingArea: string | null;
  rootingWeeks: number;
  rootingStartWeek: number | null;
  rootingEndWeek: number | null;
  maturationArea: string | null;
  maturationWeeks: number;
  maturationStartWeek: number | null;
  maturationEndWeek: number | null;
  predispatchArea: string | null;
  predispatchWeeks: number;
  predispatchStartWeek: number | null;
  predispatchEndWeek: number | null;
  endWeek: number | null;
  status: string;
};

export type ParsedPlannerFile = {
  parameters: { key: string; value: string; comment: string | null }[];
  areas: ParsedArea[];
  species: ParsedSpecies[];
  varieties: ParsedVariety[];
  calendar: ParsedCalendarWeek[];
  demand: ParsedDemand[];
  lots: ParsedLot[];
  warnings: string[];
  errors: string[];
};

const REQUIRED_SHEETS = [
  "01_Parametros",
  "02_Especies",
  "03_Areas",
  "04_Demanda",
  "05_Lotes",
  "06_Calendario",
];

function cleanStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrZero(v: unknown): number {
  return Math.trunc(num(v) ?? 0);
}

function normalizeStage(raw: string | null): ParsedArea["stage"] | null {
  const s = (raw ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (s.startsWith("enra")) return "enraizamiento";
  if (s.startsWith("madur")) return "maduracion";
  if (s.startsWith("predesp") || s.startsWith("pre desp")) return "predespacho";
  return null;
}

function boolSi(v: unknown): boolean {
  const s = (cleanStr(v) ?? "").toLowerCase();
  return s === "si" || s === "sí" || s === "true" || s === "1";
}

function toISODate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    return v.toISOString().slice(0, 10);
  }
  const s = cleanStr(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function rows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: true,
  });
}

export function parsePlannerWorkbook(buffer: Buffer | ArrayBuffer): ParsedPlannerFile {
  const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const warnings: string[] = [];
  const errors: string[] = [];

  const missing = REQUIRED_SHEETS.filter((s) => !wb.SheetNames.includes(s));
  if (missing.length) {
    return {
      parameters: [],
      areas: [],
      species: [],
      varieties: [],
      calendar: [],
      demand: [],
      lots: [],
      warnings,
      errors: [
        `El archivo no parece ser un Vivero Planner: faltan las hojas ${missing.join(", ")}.`,
      ],
    };
  }

  // ---- 01_Parametros: pares clave/valor hasta la primera fila en blanco.
  const parameters: ParsedPlannerFile["parameters"] = [];
  for (const r of rows(wb.Sheets["01_Parametros"]).slice(1)) {
    const key = cleanStr(r[0]);
    if (!key) break;
    if (key.toLowerCase() === "área" || key.toLowerCase() === "area") break;
    parameters.push({ key, value: cleanStr(r[1]) ?? "", comment: cleanStr(r[2]) });
  }

  // ---- 03_Areas
  const areas: ParsedArea[] = [];
  for (const r of rows(wb.Sheets["03_Areas"]).slice(1)) {
    const name = cleanStr(r[1]);
    if (!name) continue;
    const stage = normalizeStage(cleanStr(r[2]));
    if (!stage) {
      errors.push(`03_Areas: etapa desconocida "${r[2]}" en área "${name}".`);
      continue;
    }
    areas.push({
      name,
      stage,
      capacityTrays: intOrZero(r[3]),
      type: cleanStr(r[4]),
      priority: intOrZero(r[5]) || 1,
      active: boolSi(r[6]),
    });
  }

  // ---- 02_Especies: tabla de especies arriba, tabla de variedades abajo.
  const species: ParsedSpecies[] = [];
  const varieties: ParsedVariety[] = [];
  const speciesRows = rows(wb.Sheets["02_Especies"]);
  let varietyHeaderIdx = -1;
  for (let i = 1; i < speciesRows.length; i++) {
    const r = speciesRows[i];
    if (cleanStr(r[1]) === "Especie" && cleanStr(r[2]) === "Variedad") {
      varietyHeaderIdx = i;
      break;
    }
    const id = num(r[0]);
    const name = cleanStr(r[1]);
    if (id === null || !name) continue;
    species.push({
      name,
      code: cleanStr(r[2]),
      trayFormat: intOrZero(r[3]) || 50,
      rootingArea: cleanStr(r[4]),
      rootingWeeks: intOrZero(r[5]),
      maturationArea: cleanStr(r[6]),
      maturationWeeks: intOrZero(r[7]),
      predispatchArea: cleanStr(r[8]),
      predispatchWeeks: intOrZero(r[9]),
      priority: intOrZero(r[10]) || 1,
      active: boolSi(r[11]),
      family: cleanStr(r[12]),
      color: cleanStr(r[15]),
    });
  }
  if (varietyHeaderIdx >= 0) {
    for (const r of speciesRows.slice(varietyHeaderIdx + 1)) {
      const speciesName = cleanStr(r[1]);
      const name = cleanStr(r[2]);
      if (!speciesName || !name) continue;
      varieties.push({ speciesName, name, code: cleanStr(r[3]) });
    }
  } else {
    warnings.push("02_Especies: no se encontró la tabla de variedades.");
  }

  // ---- 06_Calendario
  const calendar: ParsedCalendarWeek[] = [];
  for (const r of rows(wb.Sheets["06_Calendario"]).slice(1)) {
    const week = num(r[1]);
    const year = num(r[5]);
    if (week === null || year === null) continue;
    calendar.push({
      campaignWeek: num(r[0]),
      week: Math.trunc(week),
      year: Math.trunc(year),
      startDate: toISODate(r[2]),
      endDate: toISODate(r[3]),
      monthName: cleanStr(r[4]),
    });
  }

  // ---- 04_Demanda
  const demand: ParsedDemand[] = [];
  let decimalTrays = 0;
  for (const [i, r] of rows(wb.Sheets["04_Demanda"]).slice(1).entries()) {
    const year = num(r[0]);
    const week = num(r[2]);
    const speciesName = cleanStr(r[3]);
    const plants = num(r[5]);
    if (year === null && !speciesName) continue;
    if (year === null || week === null || !speciesName || plants === null) {
      errors.push(`04_Demanda fila ${i + 2}: fila incompleta.`);
      continue;
    }
    const format = num(r[6]);
    const rawTrays = num(r[7]);
    if (rawTrays !== null && !Number.isInteger(rawTrays)) decimalTrays++;
    const trays =
      rawTrays !== null
        ? Math.ceil(rawTrays)
        : format
          ? Math.ceil(plants / format)
          : null;
    demand.push({
      year: Math.trunc(year),
      monthName: cleanStr(r[1]),
      week: Math.trunc(week),
      speciesName,
      varietyName: cleanStr(r[4]),
      plants: Math.trunc(plants),
      trayFormat: format ? Math.trunc(format) : null,
      trays,
    });
  }
  if (decimalTrays) {
    warnings.push(
      `04_Demanda: ${decimalTrays} filas con bandejas decimales — se redondearon hacia arriba (ceil).`,
    );
  }

  // ---- 05_Lotes
  const lots: ParsedLot[] = [];
  let invertedDates = 0;
  const dupCodes = new Set<string>();
  const seenCodes = new Set<string>();
  for (const [i, r] of rows(wb.Sheets["05_Lotes"]).slice(1).entries()) {
    const lotCode = cleanStr(r[0]);
    const speciesName = cleanStr(r[1]);
    if (!lotCode) continue;
    if (!speciesName) {
      errors.push(`05_Lotes fila ${i + 2}: lote ${lotCode} sin especie.`);
      continue;
    }
    // El código de lote puede repetirse: el pool reparte un mismo pedido en
    // asignaciones parciales a áreas distintas (ej. mitad a Góticos, mitad a
    // TunelTek). Cada fila es una asignación independiente y se conserva.
    if (seenCodes.has(lotCode)) dupCodes.add(lotCode);
    seenCodes.add(lotCode);
    const rawTrays = num(r[7]);
    const startWeek = intOrZero(r[4]);
    const endWeek = num(r[14]);
    if (endWeek !== null && endWeek < startWeek) invertedDates++;
    const lot: ParsedLot = {
      lotCode,
      speciesName,
      varietyName: cleanStr(r[2]),
      year: intOrZero(r[3]),
      startWeek,
      plants: intOrZero(r[5]),
      trayFormat: num(r[6]) ? Math.trunc(num(r[6])!) : null,
      trays: rawTrays !== null ? Math.ceil(rawTrays) : null,
      rootingArea: cleanStr(r[8]),
      rootingWeeks: intOrZero(r[9]),
      maturationArea: cleanStr(r[10]),
      maturationWeeks: intOrZero(r[11]),
      predispatchArea: cleanStr(r[12]),
      predispatchWeeks: intOrZero(r[13]),
      endWeek: endWeek !== null ? Math.trunc(endWeek) : null,
      status: cleanStr(r[15]) ?? "ACTIVO",
      rootingStartWeek: num(r[18]) !== null ? Math.trunc(num(r[18])!) : null,
      rootingEndWeek: num(r[19]) !== null ? Math.trunc(num(r[19])!) : null,
      maturationStartWeek: num(r[20]) !== null ? Math.trunc(num(r[20])!) : null,
      maturationEndWeek: num(r[21]) !== null ? Math.trunc(num(r[21])!) : null,
      predispatchStartWeek: num(r[22]) !== null ? Math.trunc(num(r[22])!) : null,
      predispatchEndWeek: num(r[23]) !== null ? Math.trunc(num(r[23])!) : null,
    };
    lots.push(lot);
  }
  if (dupCodes.size) {
    warnings.push(
      `05_Lotes: ${dupCodes.size} códigos de lote con asignaciones parciales (filas repetidas en áreas distintas) — se conservan todas.`,
    );
  }
  if (invertedDates) {
    warnings.push(
      `05_Lotes: ${invertedDates} lotes con semana fin < semana inicio (duraciones 0, caso Castaño) — revisar duraciones de esas especies.`,
    );
  }

  return { parameters, areas, species, varieties, calendar, demand, lots, warnings, errors };
}
