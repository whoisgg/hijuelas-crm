/**
 * Paleta categórica para pintar cada lote en el "mapa de asientos" del
 * sector (barra segmentada por mesón). Colores estables por orden de
 * aparición; más allá de la paleta, gris.
 */
const PALETTE = [
  "#7F77DD", // púrpura
  "#1D9E75", // teal
  "#D85A30", // coral
  "#D4537E", // rosa
  "#378ADD", // azul
  "#639922", // verde
  "#BA7517", // ámbar
  "#E24B4A", // rojo
  "#AFA9EC",
  "#5DCAA5",
  "#F0997B",
  "#ED93B1",
  "#85B7EB",
  "#97C459",
] as const;

const OTHER = "#888780";

export function buildLotColors(labels: string[]): Map<string, string> {
  const map = new Map<string, string>();
  let i = 0;
  for (const label of labels) {
    if (map.has(label)) continue;
    map.set(label, PALETTE[i] ?? OTHER);
    i++;
  }
  return map;
}

export const LOT_COLOR_OTHER = OTHER;
