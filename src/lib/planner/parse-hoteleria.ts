import * as XLSX from "xlsx";

/**
 * Parser del archivo "Hotelería" (snapshot de ocupación real).
 *
 * Usa dos fuentes dentro del workbook:
 *  - "Resumen General": una fila por ubicación física (sector / módulo /
 *    ubicación) con bandejas, plantas, capacidad y formato. Es la fuente
 *    de las ubicaciones y sus capacidades.
 *  - La hoja de detalle (la que tenga columna "Especie", hoy "Richell ZC"):
 *    una fila por ubicación × especie. Es la fuente del snapshot con especie.
 *
 * Las hojas pivot (Goticos, Richell ZO) llegan vacías vía parser — se
 * ignoran a propósito.
 */

export type ParsedLocation = {
  sector: string; // col A, ej. "Góticos" / "Gótico" / "Richell"
  module: string; // col B, ej. "Gótico 1" / "Richell Zona Clara"
  code: string; // col C, ej. "A1" / "Túnel 12"
  trays: number;
  plants: number;
  capacityTrays: number | null;
  trayFormat: number | null;
};

export type ParsedOccupancy = {
  sector: string;
  module: string;
  code: string;
  speciesName: string;
  trays: number;
  plants: number;
};

export type ParsedHoteleriaFile = {
  locations: ParsedLocation[];
  occupancy: ParsedOccupancy[];
  warnings: string[];
  errors: string[];
};

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

function rows(ws: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: false,
  });
}

/** Busca la fila de encabezado que contenga las columnas esperadas. */
function findHeader(
  data: unknown[][],
  required: string[],
): { index: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(data.length, 10); i++) {
    const cells = data[i].map((c) => (cleanStr(c) ?? "").toLowerCase());
    const cols: Record<string, number> = {};
    let ok = true;
    for (const name of required) {
      const idx = cells.findIndex((c) => c.startsWith(name.toLowerCase()));
      if (idx < 0) {
        ok = false;
        break;
      }
      cols[name] = idx;
    }
    if (ok) return { index: i, cols };
  }
  return null;
}

export function parseHoteleriaWorkbook(
  buffer: Buffer | ArrayBuffer,
): ParsedHoteleriaFile {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const warnings: string[] = [];
  const errors: string[] = [];
  const locations: ParsedLocation[] = [];
  const occupancy: ParsedOccupancy[] = [];

  // ---- Resumen General → ubicaciones + capacidad
  const resumenName = wb.SheetNames.find((n) =>
    n.toLowerCase().includes("resumen"),
  );
  if (!resumenName) {
    errors.push(
      'El archivo no parece ser de Hotelería: falta la hoja "Resumen General".',
    );
    return { locations, occupancy, warnings, errors };
  }
  const resumen = rows(wb.Sheets[resumenName]);
  const resumenHeader = findHeader(resumen, [
    "ubicación",
    "módulo",
    "ubicacion actual",
    "suma de bandejas",
  ]);
  if (!resumenHeader) {
    errors.push(`"${resumenName}": no se encontró el encabezado esperado.`);
    return { locations, occupancy, warnings, errors };
  }
  {
    const c = resumenHeader.cols;
    const cells = resumen[resumenHeader.index].map((x) =>
      (cleanStr(x) ?? "").toLowerCase(),
    );
    const capIdx = cells.findIndex((x) => x.startsWith("capacidad bandej"));
    const fmtIdx = cells.findIndex((x) => x.startsWith("formato"));
    const plantsIdx = cells.findIndex((x) => x.startsWith("suma de plantas"));
    for (const r of resumen.slice(resumenHeader.index + 1)) {
      const sector = cleanStr(r[c["ubicación"]]);
      const moduleName = cleanStr(r[c["módulo"]]);
      const code = cleanStr(r[c["ubicacion actual"]]);
      if (!sector || !moduleName || !code) continue;
      locations.push({
        sector,
        module: moduleName,
        code,
        trays: intOrZero(r[c["suma de bandejas"]]),
        plants: plantsIdx >= 0 ? intOrZero(r[plantsIdx]) : 0,
        capacityTrays: capIdx >= 0 ? intOrNull(r[capIdx]) : null,
        trayFormat: fmtIdx >= 0 ? intOrNull(r[fmtIdx]) : null,
      });
    }
  }

  // ---- Hoja de detalle (con columna Especie) → snapshot por especie
  let detailFound = false;
  for (const name of wb.SheetNames) {
    if (name === resumenName) continue;
    const data = rows(wb.Sheets[name]);
    if (!data.length) continue;
    const header = findHeader(data, [
      "ubicación",
      "módulo",
      "ubicacion actual",
      "especie",
      "suma de bandejas",
    ]);
    if (!header) continue;
    detailFound = true;
    const c = header.cols;
    const cells = data[header.index].map((x) =>
      (cleanStr(x) ?? "").toLowerCase(),
    );
    const plantsIdx = cells.findIndex((x) => x.startsWith("suma de plantas"));
    for (const r of data.slice(header.index + 1)) {
      const sector = cleanStr(r[c["ubicación"]]);
      const moduleName = cleanStr(r[c["módulo"]]);
      const code = cleanStr(r[c["ubicacion actual"]]);
      const speciesName = cleanStr(r[c["especie"]]);
      if (!sector || !moduleName || !code || !speciesName) continue;
      occupancy.push({
        sector,
        module: moduleName,
        code,
        speciesName,
        trays: intOrZero(r[c["suma de bandejas"]]),
        plants: plantsIdx >= 0 ? intOrZero(r[plantsIdx]) : 0,
      });
    }
    break;
  }
  if (!detailFound) {
    warnings.push(
      "No se encontró hoja de detalle con especies — el snapshot quedará solo a nivel ubicación.",
    );
  }

  const negatives = locations.filter(
    (l) => l.capacityTrays !== null && l.capacityTrays < 0,
  );
  if (negatives.length) {
    warnings.push(
      `${negatives.length} ubicaciones con capacidad negativa (sobrecupo en origen): ${negatives
        .map((l) => `${l.module}/${l.code}`)
        .slice(0, 5)
        .join(", ")}${negatives.length > 5 ? "…" : ""}.`,
    );
  }

  return { locations, occupancy, warnings, errors };
}
