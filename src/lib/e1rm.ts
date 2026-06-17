// Estimated 1-rep max (Epley) + best-e1RM-per-lift over logged history. Pure: no
// DOM, no storage. Mirrors the tested-pure-model pattern of load.ts/logger-model.ts.
import { KG_TO_LB, BAR_LB } from './load'
import type { Workout } from './logger-types'

/**
 * Epley estimated 1-rep max in the same unit as `weight`: weight * (1 + reps/30).
 * Raw formula — note Epley slightly overestimates at exactly 1 rep (×1.033).
 */
export function epley1rm(weight: number, reps: number): number {
  return weight * (1 + reps / 30)
}

/**
 * Best estimated 1RM in kg over FINISHED workouts for barbell lifts whose English
 * name matches `match`, or null if no qualifying logged set. Logged barbell weight
 * is plates-only, so the 45 lb bar is added back before applying Epley. Computes the
 * max in lb and converts once at the end to avoid per-set rounding drift.
 * `match` must be a non-global RegExp (reused across sets; the g flag is stateful).
 */
export function bestE1rmKg(history: Workout[], match: RegExp): number | null {
  let maxLb = 0
  for (const w of history) {
    if (w.status !== 'finished') continue
    for (const exr of w.exercises) {
      if (exr.equipment !== 'barbell' || !match.test(exr.nameEn)) continue
      for (const s of exr.sets) {
        if (!s.done || s.weightLb === null || s.reps === null) continue
        if (!Number.isInteger(s.reps) || s.reps < 1) continue
        maxLb = Math.max(maxLb, epley1rm(s.weightLb + BAR_LB, s.reps))
      }
    }
  }
  return maxLb > 0 ? Math.round(maxLb / KG_TO_LB) : null
}
