// Pure bodyweight helpers — no I/O, unit-testable like logger-model.ts.
// Bodyweight is stored as KILOGRAMS (project convention: data holds kg only);
// the screen interprets typed input in the active display unit and converts here.
import { KG_TO_LB } from './load'
import type { Unit } from './logger-model'

export interface BodyEntry {
  day: string // local calendar date, 'YYYY-MM-DD'
  weightKg: number
}

const MAX_KG = 500 // sanity cap — reject absurd input

/**
 * Parse a user-typed weight (in the active unit) into kilograms.
 * Returns null for empty / non-numeric / <= 0 / absurd (> 500 kg) input.
 * Accepts a comma decimal separator (the app is bilingual EN/RU).
 */
export function parseWeightInput(raw: string, unit: Unit): number | null {
  const n = Number(String(raw).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  const kg = unit === 'lb' ? n / KG_TO_LB : n
  if (kg > MAX_KG) return null
  return kg
}

/** Format a stored kg weight for display in the active unit (1 decimal place). */
export function formatWeight(kg: number, unit: Unit): string {
  const v = unit === 'lb' ? kg * KG_TO_LB : kg
  return v.toFixed(1)
}
