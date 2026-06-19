// Pure model for the workout logger. No DOM, no storage, no Date.now() — callers
// pass `now` in so these stay deterministic and unit-testable.
import type { Equipment, Exercise, Session, Weight } from '../data/types'
import type { CatalogExercise } from '../data/catalog-types'
import { kgToLb, KG_TO_LB, BAR_LB, computeBarbellLoad, roundToStep } from './load'
import type { LoggedSet, Workout, WorkoutExercise } from './logger-types'

export type Unit = 'kg' | 'lb'

/**
 * Display label for a logged set's weight in the chosen unit. Bodyweight shows "BW"
 * (or "BW +N u" for added weight). A barbell log is the PLATE weight (excl. bar), so
 * it shows "<plates> u (<full> w/ bar)". Other equipment shows the weight as-is.
 * null (no weight) → '–'.
 */
export function setWeightDisplay(lb: number | null, equipment: string, unit: Unit): string {
  const conv = (x: number) => (unit === 'kg' ? Math.round(x / KG_TO_LB) : x)
  if (equipment === 'bodyweight') return lb === null || lb <= 0 ? 'BW' : `BW +${conv(lb)} ${unit}`
  if (lb === null) return '–'
  if (equipment === 'barbell') return `${conv(lb)} ${unit} (${conv(lb + BAR_LB)} w/ bar)`
  return `${conv(lb)} ${unit}`
}

/**
 * Why a set can't be marked done yet, or null if it can. Needs a weight (0 allowed —
 * empty bar / loadless) and a whole number of reps ≥ 1. Applies to every exercise.
 */
export function completeProblem(st: LoggedSet, repsLabel = 'reps'): string | null {
  const w = st.weightLb, r = st.reps
  if (w === null && r === null) return `Enter weight and ${repsLabel} first`
  if (w !== null && w < 0) return "Weight can't be negative"
  if (w === null) return 'Enter weight first'
  if (r === null) return `Enter ${repsLabel} first`
  if (!Number.isInteger(r) || r < 1) return `${repsLabel[0].toUpperCase()}${repsLabel.slice(1)} must be a whole number (1+)`
  return null
}

export const canComplete = (st: LoggedSet): boolean => completeProblem(st) === null

// Stable per-exercise identity for matching the same movement across workouts.
const slugify = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Per-lift rest defaults. MUST stay in sync with scripts/build-catalog.mjs `restFor`
// (that bakes defaultRestSec into the catalog; this resolves it for coach lifts).
export function restDefaultFor(nameEn: string): number {
  const n = nameEn.toLowerCase()
  if (n.includes('squat')) return 300
  if (n.includes('deadlift')) return 300
  if (n.includes('bench')) return 150
  return 90
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

/** Hold duration in seconds if `reps` is a duration like "45s" / "35-40s" (upper
 *  bound), else null. Used to flag timed exercises (planks/holds). */
export function timedSeconds(reps: string): number | null {
  const m = reps.trim().match(/^(\d+)(?:\s*-\s*(\d+))?\s*s$/i)
  return m ? Number(m[2] ?? m[1]) : null
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

/** Build one WorkoutExercise (pre-filled sets) from a coach Exercise. */
function buildOne(e: Exercise): WorkoutExercise {
  const count = defaultSetCount(e)
  const rest = restDefaultFor(e.nameEn)
  // Barbell lifts are logged as PLATE weight (excl. the bar), so pre-fill the
  // plates needed to hit the coach's total: total lb − bar. Other equipment is
  // logged as-is. Timed holds (e.g. plank "45s") pre-fill `reps` with the seconds.
  const isBarbell = e.equipment === 'barbell'
  const secs = timedSeconds(e.reps)
  const isTimed = secs !== null
  const sets: LoggedSet[] = Array.from({ length: count }, (_, i) => {
    const kg = coachKgForSet(e.weight, i)
    // Barbell: pre-fill the nearest LOADABLE plate weight that meets the coach's kg —
    // round UP via computeBarbellLoad (same total the schedule screen shows), then
    // drop the bar. This keeps the pre-fill a real plate config (chips sum exactly)
    // and makes the coach-facing kg ≥ the prescription (never less). Others: as-is.
    const weightLb = kg === null ? null
      : isBarbell ? computeBarbellLoad(kg).totalLb - BAR_LB
      : roundToStep(kgToLb(kg), 5) // dumbbell/machine/cable: round to the nearest fixed 5 lb size
    return {
      weightLb,
      reps: isTimed ? secs : coachRepsForSet(e, i),
      done: false,
      restSec: rest,
    }
  })
  return {
    exerciseRef: `coach:${slugify(e.nameEn)}`,
    nameEn: e.nameEn,
    nameRu: e.nameRu,
    equipment: e.equipment,
    isCoachPrescribed: true,
    coachTarget: coachTargetText(e),
    isTimed,
    sets,
  }
}

/** Curated "(or …)" alternatives we recognise from the English note. The coach's
 *  notes are free text; we only act on ones that START with a known swap so loose
 *  "knee sleeves / heavy load" notes never trigger a selector. */
const ALT_PATTERNS: { test: RegExp; nameEn: string; nameRu: string; equipment: Equipment }[] = [
  { test: /^or\s+hanging\s+leg\s+raises/i, nameEn: 'Hanging Leg Raises', nameRu: 'Подъём ног к перекладине', equipment: 'bodyweight' },
  { test: /^or\s+plank/i, nameEn: 'Plank', nameRu: 'Планка', equipment: 'bodyweight' },
]

/** Parse a coach exercise's note into a structured alternative, or null. */
export function altFromNotes(notesEn: string | undefined): { nameEn: string; nameRu: string; equipment: Equipment; sets: number | null; reps: string } | null {
  const note = (notesEn ?? '').trim()
  for (const p of ALT_PATTERNS) {
    if (!p.test.test(note)) continue
    const m = note.match(/(\d+)\s*[x×]\s*(\d+(?:\s*[-–]\s*\d+)?\s*s?)/i) // e.g. 3x8, 4×8, 3x8-12, 3x45s
    return {
      nameEn: p.nameEn, nameRu: p.nameRu, equipment: p.equipment,
      sets: m ? Number(m[1]) : null,
      reps: m ? m[2].replace(/\s+/g, '') : '',
    }
  }
  return null
}

/** Seed the logger from a session's coach prescription (one WorkoutExercise each).
 *  An exercise with a recognised "(or …)" note also carries its alternative in `alt`. */
export function buildWorkoutExercises(session: Session): WorkoutExercise[] {
  return session.exercises.map((e) => {
    const we = buildOne(e)
    const alt = altFromNotes(e.notesEn)
    if (alt) {
      we.alt = buildOne({
        order: e.order, nameEn: alt.nameEn, nameRu: alt.nameRu, descEn: '', descRu: '',
        equipment: alt.equipment, weight: { kind: 'bodyweight' }, sets: alt.sets, reps: alt.reps,
      })
    }
    return we
  })
}

/** Toggle between an exercise and its "(or …)" alternative; each keeps its own sets. */
export function swapVariant(we: WorkoutExercise): WorkoutExercise {
  if (!we.alt) return we
  return { ...we.alt, alt: { ...we, alt: undefined } }
}

/** Elapsed seconds, excluding paused time; frozen while paused. Pass `nowMs`. */
export function workoutDurationSec(
  w: { startedAt: string; endedAt: string | null; pausedMs: number; pausedAt?: string | null },
  nowMs: number,
): number {
  const end = w.endedAt ? Date.parse(w.endedAt) : w.pausedAt ? Date.parse(w.pausedAt) : nowMs
  return Math.max(0, Math.round((end - Date.parse(w.startedAt) - w.pausedMs) / 1000))
}

/** Has a rest period ending at `endMs` elapsed by `nowMs`? Wall-clock; used by the
 *  logger's visibility catch-up after the page was suspended (iOS screen-lock). */
export const isRestElapsed = (endMs: number, nowMs: number): boolean => nowMs >= endMs

/** Toggle pause: pausing stamps pausedAt; resuming folds the gap into pausedMs. */
export function togglePause(w: Workout, nowMs: number): Workout {
  if (w.pausedAt) {
    return { ...w, pausedMs: w.pausedMs + Math.max(0, nowMs - Date.parse(w.pausedAt)), pausedAt: null }
  }
  return { ...w, pausedAt: new Date(nowMs).toISOString() }
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

/** One finished workout's done sets for an exercise — the per-exercise history view. */
export interface ExerciseOccurrence {
  dateIso: string            // workout.startedAt
  nameEn: string
  nameRu: string
  equipment: Equipment
  isTimed: boolean
  sets: LoggedSet[]          // that workout's DONE sets for the ref
}

/**
 * Every finished workout's DONE sets for `exerciseRef`, newest first — the all-time
 * generalization of `lastActualFor` (which returns only the latest). Matches the exact
 * ref (per-variant); skips workouts with no done set for it.
 */
export function allSetsForRef(history: Workout[], exerciseRef: string): ExerciseOccurrence[] {
  return history
    .filter((w) => w.status === 'finished')
    .map((w) => {
      const ex = w.exercises.find((x) => x.exerciseRef === exerciseRef)
      if (!ex) return null
      const sets = ex.sets.filter((s) => s.done)
      if (!sets.length) return null
      return { dateIso: w.startedAt, nameEn: ex.nameEn, nameRu: ex.nameRu, equipment: ex.equipment, isTimed: !!ex.isTimed, sets }
    })
    .filter((o): o is ExerciseOccurrence => o !== null)
    .sort((a, b) => Date.parse(b.dateIso) - Date.parse(a.dateIso))
}

/** Full lifted lb for one set: barbell adds the 45 lb bar, other equipment as-is; null plates → 0. */
function setLoadLb(weightLb: number | null, equipment: Equipment): number {
  const w = weightLb ?? 0
  return equipment === 'barbell' ? w + BAR_LB : w
}

/**
 * Total weight lifted (Σ full-weight × reps) over an exercise's DONE sets, in lb.
 * Barbell includes the 45 lb bar; dumbbell/machine/cable count the weight as-is; bodyweight
 * counts only added load. Timed holds → 0 (weight × seconds isn't volume); sets with null /
 * non-integer / <1 reps are skipped; null plates count as 0 (an empty bar still = 45 lb).
 */
export function exerciseVolumeLb(ex: WorkoutExercise): number {
  if (ex.isTimed) return 0
  let v = 0
  for (const s of ex.sets) {
    if (!s.done || s.reps === null || !Number.isInteger(s.reps) || s.reps < 1) continue
    v += setLoadLb(s.weightLb, ex.equipment) * s.reps
  }
  return v
}

/** Total weight lifted across all of a workout's exercises, in lb. */
export function workoutVolumeLb(w: Workout): number {
  return w.exercises.reduce((sum, ex) => sum + exerciseVolumeLb(ex), 0)
}

/**
 * Pre-fill a WorkoutExercise from the user's last actual sets for it.
 * Added (non-coach) exercises adopt last session's full sets; coach exercises only
 * fill in weights the coach left unspecified (keeping the prescribed reps/set count).
 */
export function withLastActual(we: WorkoutExercise, last: LoggedSet[] | null): WorkoutExercise {
  if (!last || !last.length) return we
  const restSec = we.sets[0]?.restSec ?? 90
  if (!we.isCoachPrescribed) {
    return { ...we, sets: last.map((s) => ({ weightLb: s.weightLb, reps: s.reps, done: false, restSec })) }
  }
  return {
    ...we,
    sets: we.sets.map((s, i) =>
      s.weightLb === null ? { ...s, weightLb: last[Math.min(i, last.length - 1)].weightLb } : s,
    ),
  }
}

/** A fresh empty (not-done) set carrying the given rest default. */
export function blankSet(restSec: number): LoggedSet {
  return { weightLb: null, reps: null, done: false, restSec }
}

/**
 * Fill-down on complete: when set `srcIdx` is marked done, copy its weight/reps into
 * every OTHER set's empty (null) fields, so the remaining sets pre-fill to the same
 * numbers. Filled sets stay NOT done — the user still confirms (or tweaks) each.
 * Never overwrites an entered value or touches an already-done set. Returns a new
 * array (no mutation); a no-op if the source set itself has a null field.
 */
export function fillEmptySets(sets: LoggedSet[], srcIdx: number): LoggedSet[] {
  const src = sets[srcIdx]
  if (!src || src.weightLb === null || src.reps === null) return sets
  return sets.map((s, i) =>
    i === srcIdx || s.done || (s.weightLb !== null && s.reps !== null)
      ? s
      : { ...s, weightLb: s.weightLb ?? src.weightLb, reps: s.reps ?? src.reps },
  )
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

/** Russian-only log of a finished workout for sending to the coach (weights in kg). */
export function trainerLog(w: Workout): string {
  const body = w.exercises
    .map((ex) => {
      // Report the full lifted weight in kg. Barbell logs are plate weight, so add
      // the bar back. Bodyweight has no load → 'б/в' (or 'б/в +Nkg' for added weight).
      const wt = (lb: number | null): string => {
        if (ex.equipment === 'bodyweight') return lb === null || lb <= 0 ? 'б/в' : `б/в +${Math.round(lb / KG_TO_LB)}`
        if (lb === null) return 'б/в'
        const full = ex.equipment === 'barbell' ? lb + BAR_LB : lb
        return String(Math.round(full / KG_TO_LB))
      }
      const lines: string[] = []
      let i = 0
      while (i < ex.sets.length) {
        const s = ex.sets[i]
        let n = 1
        while (i + n < ex.sets.length && ex.sets[i + n].weightLb === s.weightLb && ex.sets[i + n].reps === s.reps) n++
        const rep = s.reps === null ? '?' : `${s.reps}${ex.isTimed ? 'с' : ''}` // 'с' = seconds for timed holds
        lines.push(`${wt(s.weightLb)} × ${rep} — ${n}`)
        i += n
      }
      return [ex.nameRu, ...lines].join('\n')
    })
    .join('\n\n')
  const msg = (w.coachMessage ?? '').trim()
  return msg ? `${body}\n\n${msg}` : body
}
