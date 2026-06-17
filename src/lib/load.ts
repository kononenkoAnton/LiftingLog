export const KG_TO_LB = 2.20462
export const BAR_LB = 45
// Smallest plate is 5 lb — no 2.5 lb microplates (rarely stocked). The last entry
// doubles as the per-side rounding granularity in computeBarbellLoad.
export const PLATES_LB = [45, 35, 25, 10, 5]

export function kgToLb(kg: number): number {
  return kg * KG_TO_LB
}

export function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step
}

/** Round to the NEAREST multiple of step — for fixed sizes you pick (dumbbells,
 *  machine/cable stacks) rather than build, so you grab the closest weight. */
export function roundToStep(value: number, step: number): number {
  return Math.round(value / step) * step
}

export interface PlateStack {
  plate: number
  count: number
}

export interface BarbellLoad {
  targetLb: number
  totalLb: number
  perSideLb: number
  plates: PlateStack[]
}

function decompose(perSide: number): PlateStack[] {
  const out: PlateStack[] = []
  let rem = perSide
  for (const p of PLATES_LB) {
    const count = Math.floor(rem / p + 1e-9)
    if (count > 0) {
      out.push({ plate: p, count })
      rem -= count * p
    }
  }
  return out
}

export function computeBarbellLoad(kg: number): BarbellLoad {
  const targetLb = kgToLb(kg)
  // Round the PER-SIDE weight up to the smallest plate (no microplates), so the load
  // is always achievable with the plate set and never under the target.
  const step = PLATES_LB[PLATES_LB.length - 1]
  const perSideLb = Math.max(0, roundUpToStep((targetLb - BAR_LB) / 2, step)) // Math.max also normalizes -0
  const totalLb = BAR_LB + perSideLb * 2
  return { targetLb, totalLb, perSideLb, plates: decompose(perSideLb) }
}

/**
 * Per-side plate stacks for a logged PLATE weight in lb — i.e. the weight on the
 * bar EXCLUDING the 45 lb bar (how the user logs barbell lifts). Per side = half
 * the plate weight; the bar is not part of the plates.
 */
export function platesForPlateLb(plateLb: number): PlateStack[] {
  if (plateLb <= 0) return []
  return decompose(plateLb / 2)
}

/** Full barbell weight (incl. the 45 lb bar) for a logged plate weight in lb. */
export function fullBarLb(plateLb: number): number {
  return plateLb + BAR_LB
}
