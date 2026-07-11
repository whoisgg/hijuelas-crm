import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { parsePlannerWorkbook } from "@/lib/planner/parse-planner";
import { computeOccupancy, type CapacityLot } from "@/lib/planner/capacity";

const DIR =
  "/Users/gaspar/Library/Mobile Documents/iCloud~md~obsidian/Documents/2BGG/02 - Projects/grupohijuelas/planner";
const buf = readFileSync(`${DIR}/Vivero Planner v1.1.xlsx`);
const parsed = parsePlannerWorkbook(buf);

const norm = (s: string | null) => (s ? s.trim().toLowerCase() : null);
const lots: CapacityLot[] = parsed.lots.map((l) => ({
  trays: l.trays,
  stages: [
    { areaKey: norm(l.rootingArea), startWeek: l.rootingStartWeek, endWeek: l.rootingEndWeek },
    { areaKey: norm(l.maturationArea), startWeek: l.maturationStartWeek, endWeek: l.maturationEndWeek },
    { areaKey: norm(l.predispatchArea), startWeek: l.predispatchStartWeek, endWeek: l.predispatchEndWeek },
  ],
}));
const matrix = computeOccupancy(lots);

// Expected desde 07_Capacidad_Semanal
const wb = XLSX.read(buf, { type: "buffer" });
const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["07_Capacidad_Semanal"], {
  header: 1, defval: null, blankrows: true,
});
const AREAS = ["Góticos", "TunelTek", "Zona Oscura", "Zona Clara", "Módulo 1", "Módulo 2"];
let mismatches = 0, checked = 0;
const report: string[] = [];
for (const r of rows) {
  const label = r[0] ? String(r[0]).trim() : "";
  if (!AREAS.includes(label)) continue;
  for (let col = 2; col < r.length; col++) {
    const week = col - 1; // col 2 = semana campaña 1
    const expected = r[col] === null ? 0 : Math.round(Number(r[col]));
    const actual = matrix.get(label.toLowerCase())?.get(week) ?? 0;
    checked++;
    if (expected !== actual) {
      mismatches++;
      if (report.length < 15) report.push(`${label} S${week}: excel=${expected} motor=${actual} (diff ${actual - expected})`);
    }
  }
}
console.log(`celdas comparadas: ${checked}, mismatches: ${mismatches}`);
report.forEach((l) => console.log(" ", l));
