// Pure model for the workout logger. No DOM, no storage, no Date.now() — callers
// pass `now` in so these stay deterministic and unit-testable.
import type { Equipment, Exercise, Session, Weight } from '../data/types'
import { kgToLb } from './load'
import type { LoggedSet, WorkoutExercise } from './logger-types'

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
  if (w.kind === 'progression') return w.kg[Math.min(i, w.kg.length - 1)]
  if (w.kind === 'perSet') return w.steps[Math.min(i, w.steps.length - 1)].kg
  return null // qualitative | bodyweight
}

// reps the coach prescribes for set index i (null if non-numeric like "8–12").
function coachRepsForSet(e: Exercise, i: number): number | null {
  if (e.weight.kind === 'perSet') {
    return e.weight.steps[Math.min(i, e.weight.steps.length - 1)].reps
  }
  const n = parseInt(e.reps, 10)
  return Number.isFinite(n) && String(n) === e.reps.trim() ? n : null
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
    const count = e.sets && e.sets > 0 ? e.sets : 1
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
      exerciseRef: `coach:${e.order}`,
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
