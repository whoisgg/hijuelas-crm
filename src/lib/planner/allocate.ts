/**
 * Relleno simulado del plano de un sector para una semana del plan.
 *
 * FIFO: los lotes se ordenan por semana de llegada a la etapa (lo que llegó
 * antes ya está puesto) y van llenando los mesones en el orden físico del
 * sector. Lo que no cabe queda como sobrecupo — así un 246% de plan se ve
 * como "todo lleno + N bandejas sin espacio".
 */

export type AllocLot = {
  label: string; // "Avellano Yamhill · 2026-36-AVE-YAM"
  trays: number;
  arrivalWeek: number; // semana de inicio de la etapa en esta área
  /** referencia opcional para identificar el lote (id + etapa) al mover */
  ref?: { lotId: number; stage: "rooting" | "maturation" | "predispatch" };
};

export type AllocLocation = {
  id: number;
  capacityTrays: number;
};

type AllocPart = {
  label: string;
  trays: number;
  ref?: AllocLot["ref"];
};

export type AllocationResult = {
  /** location id → { total, parts } */
  byLocation: Map<number, { trays: number; parts: AllocPart[] }>;
  /** lotes (o restos de lote) que no cupieron */
  overflow: AllocPart[];
  totalTrays: number;
  overflowTrays: number;
};

export function allocateFifo(
  locations: AllocLocation[],
  lots: AllocLot[],
): AllocationResult {
  const byLocation: AllocationResult["byLocation"] = new Map();
  const overflow: AllocationResult["overflow"] = [];

  const queue = lots
    .slice()
    .sort((a, b) => a.arrivalWeek - b.arrivalWeek || a.label.localeCompare(b.label));

  let locIdx = 0;
  let usedInLoc = 0;
  let totalTrays = 0;
  let overflowTrays = 0;

  for (const lot of queue) {
    let remaining = lot.trays;
    totalTrays += lot.trays;
    while (remaining > 0) {
      if (locIdx >= locations.length) {
        overflow.push({ label: lot.label, trays: remaining, ref: lot.ref });
        overflowTrays += remaining;
        break;
      }
      const loc = locations[locIdx];
      const free = Math.max(0, (loc.capacityTrays ?? 0) - usedInLoc);
      if (free === 0) {
        locIdx++;
        usedInLoc = 0;
        continue;
      }
      const take = Math.min(free, remaining);
      let entry = byLocation.get(loc.id);
      if (!entry) {
        entry = { trays: 0, parts: [] };
        byLocation.set(loc.id, entry);
      }
      entry.trays += take;
      entry.parts.push({ label: lot.label, trays: take, ref: lot.ref });
      usedInLoc += take;
      remaining -= take;
    }
  }

  return { byLocation, overflow, totalTrays, overflowTrays };
}
