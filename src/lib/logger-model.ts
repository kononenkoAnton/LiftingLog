// Pure model for the workout logger. No DOM, no storage, no Date.now() — callers
// pass `now` in so these stay deterministic and unit-testable.
import type { Equipment, Exercise, Session, Weight } from '../data/types'
import type { CatalogExercise } from '../data/catalog-types'
import { kgToLb } from './load'
import type { LoggedSet, Workout, WorkoutExercise } from './logger-types'

// Stable per-exercise identity for matching the same movement across workouts.
const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Per-lift rest defaults. MUST stay in sync with scripts/build-catalog.mjs `restFor`
// (that bakes defaultRestSec into the catalog; this resolves it for coach lifts).
export function restDefaultFor(nameEn: string, equipment: Equipment): number {
  const n = nameEn.toLowerCase()
  if (n.includes('squat')) return 90
  if (n.includes('bench')) return 150
  if (n.includes('deadlift')) return equipment === 'barbell' ? 300 : 90
  return equipment === 'barbell' ? 180 : 90
}

// kg the coach prescribes for set index i (null if not a concrete number).
function coachKgForSet(w: Weight, i: number): number | null {
  if (w.kind === 'single') return w.kg
  if (w.kind === 'range') return w.maxKg
  if (w.kind === 'progression') return w.kg.length ? w.kg[Math.min(i, w.kg.length - 1)] : null
  if (w.kind === 'perSet') return w.steps.length ? w.steps[Math.min(i, w.steps.length - 1)].kg : null
  return null // qualitative | bodyweight
}

// reps the coach prescribes for set index i (null if non-numeric like "8–12").
function coachRepsForSet(e: Exercise, i: number): number | null {
  if (e.weight.kind === 'perSet') {
    const steps = e.weight.steps
    return steps.length ? steps[Math.min(i, steps.length - 1)].reps : null
  }
  const n = parseInt(e.reps, 10)
  return Number.isFinite(n) && String(n) === e.reps.trim() ? n : null
}

// How many set rows to pre-fill. Coach `sets` wins; when it's null, derive from the
// weight scheme (perSet/progression carry their own per-set values) so we don't drop sets.
function defaultSetCount(e: Exercise): number {
  if (e.sets && e.sets > 0) return e.sets
  if (e.weight.kind === 'perSet') return e.weight.steps.length || 1
  if (e.weight.kind === 'progression') return e.weight.kg.length || 1
  return 1
}

/** Short human label of the coach's prescription, used as the reference column. */
export function coachTargetText(e: Exercise): string {
  const w = e.weight
  const reps = e.reps ? ` × ${e.reps}` : ''
  if (w.kind === 'single') return `${w.kg} kg${reps}`
  if (w.kind === 'range') return `${w.minKg}–${w.maxKg} kg${reps}`
  if (w.kind === 'progression') return `${w.kg.join('→')} kg`
  if (w.kind === 'perSet') return w.steps.map((s) => `${s.kg}×${s.reps}`).join(', ')
  if (w.kind === 'qualitative') return `${w.level[0].toUpperCase()}${w.level.slice(1)}${reps}`
  return `Bodyweight${reps}`
}

/** Seed the logger from a session's coach prescription (one WorkoutExercise each). */
export function buildWorkoutExercises(session: Session): WorkoutExercise[] {
  return session.exercises.map((e) => {
    const count = defaultSetCount(e)
    const rest = restDefaultFor(e.nameEn, e.equipment)
    const sets: LoggedSet[] = Array.from({ length: count }, (_, i) => {
      const kg = coachKgForSet(e.weight, i)
      return {
        weightLb: kg !== null ? Math.round(kgToLb(kg)) : null,
        reps: coachRepsForSet(e, i),
        done: false,
        restSec: rest,
        note: '',
      }
    })
    return {
      exerciseRef: `coach:${slugify(e.nameEn)}`,
      nameEn: e.nameEn,
      nameRu: e.nameRu,
      equipment: e.equipment,
      isCoachPrescribed: true,
      coachTarget: coachTargetText(e),
      sets,
    }
  })
}

/** Elapsed seconds, excluding paused time. Pass `nowMs` (Date.now()) from the caller. */
export function workoutDurationSec(
  w: { startedAt: string; endedAt: string | null; pausedMs: number },
  nowMs: number,
): number {
  const end = w.endedAt ? Date.parse(w.endedAt) : nowMs
  return Math.max(0, Math.round((end - Date.parse(w.startedAt) - w.pausedMs) / 1000))
}

/**
 * Done sets for `exerciseRef` from the most recent FINISHED workout that has at
 * least one done set for it — skipping newer finished workouts that logged none —
 * or null. Matches by exercise identity (the ref must be stable across sessions).
 */
export function lastActualFor(history: Workout[], exerciseRef: string): LoggedSet[] | null {
  const finished = history
    .filter((w) => w.status === 'finished')
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
  for (const w of finished) {
    const ex = w.exercises.find((x) => x.exerciseRef === exerciseRef)
    if (ex) {
      const done = ex.sets.filter((s) => s.done)
      if (done.length) return done
    }
  }
  return null
}

/** A fresh empty (not-done) set carrying the given rest default. */
export function blankSet(restSec: number): LoggedSet {
  return { weightLb: null, reps: null, done: false, restSec, note: '' }
}

/** Turn a catalog pick into a non-coach WorkoutExercise with one blank set. */
export function catalogToWorkoutExercise(c: CatalogExercise): WorkoutExercise {
  return {
    exerciseRef: c.id,
    nameEn: c.nameEn,
    nameRu: c.nameRu,
    equipment: c.equipment,
    isCoachPrescribed: false,
    coachTarget: '',
    sets: [blankSet(c.defaultRestSec)],
  }
}
