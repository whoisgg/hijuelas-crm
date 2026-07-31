/**
 * Geometría del "estadio" de un mesón.
 *
 * El bloque de sillas tiene que cerrar un RECTÁNGULO completo dentro de su
 * card: con `flex-wrap` la última fila quedaba mocha y el plano se leía como
 * una mancha irregular en vez de un mesón (reporte del usuario, Góticos).
 *
 * Dos decisiones para que el módulo se vea parejo:
 *  - Las filas se eligen UNA vez por módulo (`seatRowsFor`), no por mesón.
 *  - El ancho de silla se calcula sobre el mesón más grande del módulo
 *    (`seatWidthCss` con `maxCols`), así un mesón más chico dibuja un
 *    rectángulo más ANGOSTO —proporcional a su capacidad— y no sillas más
 *    grandes que las del vecino.
 *
 * Lo que sobra para cerrar la última fila (`pad`, a lo más filas-1 celdas) se
 * pinta como "sin capacidad": completa la figura sin inflar la ocupación.
 */

const ROW_CANDIDATES = [3, 4, 5, 6, 7, 8, 9, 10];

/** Castigo por cada mesón que no cierra exacto con ese número de filas. */
const PAD_PENALTY = 0.15;

/** Proporción (columnas por fila / filas) que se busca según cuántas cards
 *  entran a lo ancho del módulo: mientras más cards por fila, más angosta
 *  cada una y menos columnas caben. */
export function targetAspectFor(cardsPerRow: number) {
  return 14 / Math.max(1, cardsPerRow);
}

function median(nums: number[]) {
  const s = [...nums].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Filas del módulo: la proporción manda (que un mesón se vea mesón, largo y
 * angosto) y la divisibilidad exacta desempata. En Góticos da 6 filas.
 */
export function seatRowsFor(seatCounts: number[], targetAspect: number): number {
  const counts = seatCounts.filter((n) => n > 0);
  if (!counts.length) return 4;
  let best = ROW_CANDIDATES[0];
  let bestScore = Infinity;
  for (const rows of ROW_CANDIDATES) {
    const aspect = median(counts.map((n) => Math.ceil(n / rows))) / rows;
    const ragged = counts.filter((n) => n % rows !== 0).length / counts.length;
    const score =
      Math.abs(Math.log(aspect / targetAspect)) + PAD_PENALTY * ragged;
    if (score < bestScore) {
      bestScore = score;
      best = rows;
    }
  }
  return best;
}

/** Columnas que ocupa un mesón de `total` sillas con `rows` filas. */
export function seatColsFor(total: number, rows: number) {
  return Math.max(1, Math.ceil(Math.max(1, total) / Math.max(1, rows)));
}

/** Celdas de relleno para cerrar la última fila (0 si ya cierra exacto). */
export function seatPadFor(total: number, rows: number) {
  return seatColsFor(total, rows) * rows - Math.max(1, total);
}

/** Separación entre sillas, en px. Con mesones de ~50 columnas dentro de una
 *  card, 2px dejaban la figura más aire que silla. */
export const SEAT_GAP = 1;

/** Tope de tamaño de silla. Sin él, en pantallas anchas un mesón de pocas
 *  columnas infla las sillas hasta parecer otra cosa. */
const SEAT_MAX_PX = 12;

/** Padding + borde de la card del mesón (`p-1.5` + `border`), en px. */
const MESON_CHROME_PX = 6 * 2 + 1 * 2;

/**
 * Ancho que necesita la CARD de un mesón para contener su bloque de sillas sin
 * sobrar. Con las sillas topadas en `SEAT_MAX_PX`, el bloque deja de crecer y
 * una columna de ancho libre le dejaba media card vacía a la derecha (reporte
 * del usuario: "los rectángulos podrían ser menos anchos").
 *
 * Se usa como TOPE (`minmax(0, …)`), no como ancho fijo: en pantallas angostas
 * la columna sigue pudiendo encoger y `seatWidthCss` achica las sillas como
 * antes.
 */
export function mesonBoxWidthPx(maxCols: number) {
  const cols = Math.max(1, maxCols);
  return cols * (SEAT_MAX_PX + SEAT_GAP) - SEAT_GAP + MESON_CHROME_PX;
}

/**
 * Ancho de silla como fracción del ancho de la card, fijado por el mesón más
 * grande del módulo (`maxCols`) para que todas las sillas midan igual.
 * Con el tope, el bloque deja de crecer y queda alineado a la izquierda.
 */
export function seatWidthCss(maxCols: number) {
  const cols = Math.max(1, maxCols);
  return `min(${SEAT_MAX_PX}px, calc((100% - ${(cols - 1) * SEAT_GAP}px) / ${cols}))`;
}
