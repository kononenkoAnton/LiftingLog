export const KG_TO_LB = 2.20462
export const BAR_LB = 45
export const PLATES_LB = [45, 35, 25, 10, 5, 2.5]

export function kgToLb(kg: number): number {
  return kg * KG_TO_LB
}

export function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step
}
