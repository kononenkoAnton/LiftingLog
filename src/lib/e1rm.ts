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
 * Best estimated 1RM as PRECISE full lb (incl. the 45 lb bar) over FINISHED workouts
 * for barbell lifts whose English name matches `match`, or null if no qualifying set.
 * Logged barbell weight is plates-only, so the bar is added back before applying
 * Epley. Internal — callers round ONCE into the unit they display (avoids the
 * double-rounding drift of converting a rounded kg back to lb).
 * `match` must be a non-global RegExp (reused across sets; the g flag is stateful).
 */
function bestE1rmFullLb(history: Workout[], match: RegExp): number | null {
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
  return maxLb > 0 ? maxLb : null
}

/** Best estimated 1RM in kg over finished workouts for lifts matching `match`, or null. */
export function bestE1rmKg(history: Workout[], match: RegExp): number | null {
  const lb = bestE1rmFullLb(history, match)
  return lb === null ? null : Math.round(lb / KG_TO_LB)
}

/** Best estimated 1RM in lb (full, incl. the 45 lb bar) over finished workouts, or null. */
export function bestE1rmLb(history: Workout[], match: RegExp): number | null {
  const lb = bestE1rmFullLb(history, match)
  return lb === null ? null : Math.round(lb)
}
