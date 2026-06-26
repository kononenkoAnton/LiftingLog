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

/** One point on a lift's estimated-1RM trend: a finished workout's best-e1RM set. */
export interface E1rmPoint {
  /** `workout.startedAt` (ISO). */
  dateIso: string
  /** PRECISE full lb (incl. the 45 lb bar) — callers round ONCE into their display unit. */
  e1rmFullLb: number
  /** The driving set's PLATES weight (excl. bar) — feed to `setWeightDisplay(_, 'barbell', unit)`. */
  weightLb: number
  /** The driving set's reps. */
  reps: number
}

/**
 * Estimated-1RM trend for barbell lifts whose English name matches `match`: one point
 * per FINISHED workout that has a qualifying set, sorted ascending by date. Each point
 * is that workout's BEST-e1RM qualifying set (`done`, barbell, integer reps ≥ 1).
 * Logged weight is plates-only, so the 45 lb bar is added back before Epley. Pure.
 * `match` must be a non-global RegExp (reused across sets; the g flag is stateful).
 */
export function e1rmSeries(history: Workout[], match: RegExp): E1rmPoint[] {
  const points: E1rmPoint[] = []
  for (const w of history) {
    if (w.status !== 'finished') continue
    let best: E1rmPoint | null = null
    for (const exr of w.exercises) {
      // Barbell-only: perImplement (dumbbell ×2 volume) intentionally never reaches e1RM — strength is per-implement.
      if (exr.equipment !== 'barbell' || !match.test(exr.nameEn)) continue
      for (const s of exr.sets) {
        if (!s.done || s.weightLb === null || s.reps === null) continue
        if (!Number.isInteger(s.reps) || s.reps < 1) continue
        const e1rmFullLb = epley1rm(s.weightLb + BAR_LB, s.reps)
        if (!best || e1rmFullLb > best.e1rmFullLb) {
          best = { dateIso: w.startedAt, e1rmFullLb, weightLb: s.weightLb, reps: s.reps }
        }
      }
    }
    if (best) points.push(best)
  }
  return points.sort((a, b) => Date.parse(a.dateIso) - Date.parse(b.dateIso))
}

/**
 * Best estimated 1RM as PRECISE full lb (incl. the 45 lb bar) over FINISHED workouts
 * for barbell lifts matching `match`, or null if no qualifying set. Internal — callers
 * round ONCE into the unit they display (avoids double-rounding drift). Derived from
 * `e1rmSeries` so the chips and the Progress screen share one definition.
 */
function bestE1rmFullLb(history: Workout[], match: RegExp): number | null {
  const series = e1rmSeries(history, match)
  return series.length ? Math.max(...series.map((p) => p.e1rmFullLb)) : null
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
