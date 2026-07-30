/**
 * Ubicación vigente de un lote: cuál de sus 3 etapas (enraizamiento,
 * maduración, predespacho) está activa en la semana de campaña dada, según
 * sus propias ventanas de semanas. Si la semana no cae en ninguna ventana
 * (aún no empieza, o ya despachó), cae a la última etapa con área conocida
 * — mismo criterio que ya usa movimientos-data.ts para casos sin match.
 */

export type LotStageWindow = {
  name: string | null;
  startWeek: number | null;
  endWeek: number | null;
};

export function currentLotLocation(
  stages: {
    rooting: LotStageWindow;
    maturation: LotStageWindow;
    predispatch: LotStageWindow;
  },
  currentWeek: number | null,
): string | null {
  const ordered = [stages.predispatch, stages.maturation, stages.rooting];
  if (currentWeek !== null) {
    for (const s of ordered) {
      if (
        s.name &&
        s.startWeek !== null &&
        s.endWeek !== null &&
        currentWeek >= s.startWeek &&
        currentWeek <= s.endWeek
      ) {
        return s.name;
      }
    }
    // Sin match: si aún no llega a enraizamiento (su primera etapa), la
    // ubicación relevante es esa — a dónde va, no a dónde terminaría. Si ya
    // pasó todas sus ventanas conocidas, cae al último tramo con área.
    if (stages.rooting.startWeek !== null && currentWeek < stages.rooting.startWeek) {
      return stages.rooting.name ?? stages.maturation.name ?? stages.predispatch.name ?? null;
    }
  }
  return stages.predispatch.name ?? stages.maturation.name ?? stages.rooting.name ?? null;
}
