import { describe, it, expect } from 'vitest'
import { restDefaultFor, workoutDurationSec, buildWorkoutExercises, coachTargetText, lastActualFor, catalogToWorkoutExercise, blankSet, togglePause, withLastActual, trainerLog, setWeightDisplay, completeProblem, canComplete, timedSeconds, altFromNotes, swapVariant, fillEmptySets, allSetsForRef, exerciseVolumeLb, workoutVolumeLb, isRestElapsed, tallyUsage } from './logger-model'
import type { Session, Exercise } from '../data/types'
import type { Workout, LoggedSet, WorkoutExercise } from './logger-types'
import type { CatalogExercise } from '../data/catalog-types'

const mkSession = (exercises: Exercise[]): Session => ({
  num: 7, date: '2026-06-16', dateLabel: 'Tue Jun 16', focus: 'Squat', exercises,
})

describe('restDefaultFor', () => {
  it('gives squats 5:00', () => { expect(restDefaultFor('Back Squat')).toBe(300) })
  it('gives deadlifts 5:00', () => { expect(restDefaultFor('Conventional Deadlift')).toBe(300) })
  it('gives bench 2:30', () => { expect(restDefaultFor('Bench Press')).toBe(150) })
  it('gives barbell accessory work 1:30', () => { expect(restDefaultFor('Barbell Row')).toBe(90) })
  it('gives other accessory work 1:30', () => { expect(restDefaultFor('Lat Pulldown')).toBe(90) })
})

describe('workoutDurationSec', () => {
  const base = { startedAt: '2026-06-15T12:00:00.000Z', endedAt: null, pausedMs: 0 }
  it('uses now when not ended', () => {
    const now = Date.parse('2026-06-15T12:01:40.000Z') // +100s
    expect(workoutDurationSec(base, now)).toBe(100)
  })
  it('excludes paused time', () => {
    const now = Date.parse('2026-06-15T12:01:40.000Z') // +100s
    expect(workoutDurationSec({ ...base, pausedMs: 30_000 }, now)).toBe(70)
  })
  it('uses endedAt when finished (now ignored)', () => {
    const w = { ...base, endedAt: '2026-06-15T12:00:50.000Z' } // +50s
    expect(workoutDurationSec(w, Date.parse('2026-06-15T13:00:00.000Z'))).toBe(50)
  })
  it('never goes negative', () => {
    expect(workoutDurationSec({ ...base, pausedMs: 999_999 }, Date.parse(base.startedAt))).toBe(0)
  })
})

describe('coachTargetText', () => {
  const ex = (over: Partial<Exercise>): Exercise => ({
    order: 1, nameEn: 'Squat', nameRu: 'Присед', descEn: '', descRu: '',
    equipment: 'barbell', weight: { kind: 'single', kg: 100 }, sets: 3, reps: '5', ...over,
  })
  it('single weight', () => { expect(coachTargetText(ex({}))).toBe('100 kg × 5') })
  it('range weight', () => { expect(coachTargetText(ex({ weight: { kind: 'range', minKg: 90, maxKg: 100 } }))).toBe('90–100 kg × 5') })
  it('bodyweight', () => { expect(coachTargetText(ex({ weight: { kind: 'bodyweight' }, reps: '12' }))).toBe('Bodyweight × 12') })
})

describe('buildWorkoutExercises', () => {
  const ex = (over: Partial<Exercise>): Exercise => ({
    order: 1, nameEn: 'Squat', nameRu: 'Присед', descEn: '', descRu: '',
    equipment: 'barbell', weight: { kind: 'single', kg: 100 }, sets: 3, reps: '5', ...over,
  })
  it('makes one WorkoutExercise per coach exercise, ref by name slug', () => {
    const out = buildWorkoutExercises(mkSession([ex({ nameEn: 'Squat (Barbell)' })]))
    expect(out).toHaveLength(1)
    expect(out[0].exerciseRef).toBe('coach:squat-barbell')
    expect(out[0].isCoachPrescribed).toBe(true)
  })
  it('pre-fills barbell lb as PLATE weight (loadable round-up total − 45 bar), reps from reps', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ sets: 3, weight: { kind: 'single', kg: 100 }, reps: '5' })]))
    expect(we.sets).toHaveLength(3)
    expect(we.sets[0].weightLb).toBe(180) // 100kg → 225 lb loadable total − 45 bar (2×45/side)
    expect(we.sets[0].reps).toBe(5)
    expect(we.sets[0].done).toBe(false)
    expect(we.sets[0].restSec).toBe(300)
  })
  it('does NOT subtract the bar for non-barbell equipment', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ equipment: 'dumbbell', weight: { kind: 'single', kg: 30 } })]))
    expect(we.sets[0].weightLb).toBe(65) // nearest 5 of kgToLb(30)=66.1 → 65, no bar
  })
  it('defaults to one set when coach sets is null', () => {
    expect(buildWorkoutExercises(mkSession([ex({ sets: null })]))[0].sets).toHaveLength(1)
  })
  it('uses per-set kg/reps for a perSet scheme (barbell plate weight)', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({
      weight: { kind: 'perSet', steps: [{ kg: 100, reps: 5 }, { kg: 90, reps: 8 }] }, sets: 2,
    })]))
    expect(we.sets[0].weightLb).toBe(180) // 100kg → 225 − 45
    expect(we.sets[1].weightLb).toBe(160) // 90kg → 205 − 45
    expect(we.sets[1].reps).toBe(8)
  })
  it('leaves weightLb null for bodyweight and non-numeric reps null', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ weight: { kind: 'bodyweight' }, reps: '8–12' })]))
    expect(we.sets[0].weightLb).toBeNull()
    expect(we.sets[0].reps).toBeNull()
  })
  it('uses per-index kg for a progression scheme, clamping extra sets (barbell plate weight)', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ weight: { kind: 'progression', kg: [80, 90, 100] }, sets: 5 })]))
    expect(we.sets.map((s) => s.weightLb)).toEqual([140, 160, 180, 180, 180]) // 80/90/100kg loadable totals − 45 bar
  })
  it('keeps every perSet step when coach sets is null', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ sets: null, weight: { kind: 'perSet', steps: [{ kg: 130, reps: 3 }, { kg: 145, reps: 3 }, { kg: 145, reps: 3 }, { kg: 145, reps: 3 }] } })]))
    expect(we.sets).toHaveLength(4)
    expect(we.sets[3].weightLb).toBe(280) // 145kg → 325 lb total − 45 bar
  })
  it('flags timed holds and pre-fills reps with the duration in seconds', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ nameEn: 'Plank', equipment: 'bodyweight', weight: { kind: 'bodyweight' }, sets: 4, reps: '45s' })]))
    expect(we.isTimed).toBe(true)
    expect(we.sets).toHaveLength(4)
    expect(we.sets[0].weightLb).toBeNull()
    expect(we.sets[0].reps).toBe(45)
  })
  it('uses the upper bound for a duration range; rep schemes are not timed', () => {
    const [hold] = buildWorkoutExercises(mkSession([ex({ equipment: 'bodyweight', weight: { kind: 'bodyweight' }, sets: 3, reps: '35-40s' })]))
    expect(hold.isTimed).toBe(true)
    expect(hold.sets[0].reps).toBe(40)
    expect(buildWorkoutExercises(mkSession([ex({ reps: '5' })]))[0].isTimed).toBe(false)
  })
  it('attaches a populated alternative when the note has a recognised swap', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ nameEn: 'Plank', equipment: 'bodyweight', weight: { kind: 'bodyweight' }, sets: 4, reps: '45s', notesEn: 'Or hanging leg raises (4×8)' })]))
    expect(we.isTimed).toBe(true)              // primary: timed plank
    expect(we.alt?.nameEn).toBe('Hanging Leg Raises')
    expect(we.alt?.isTimed).toBe(false)        // alt: rep-based
    expect(we.alt?.sets).toHaveLength(4)
    expect(we.alt?.sets[0].reps).toBe(8)
    expect(we.alt?.sets[0].weightLb).toBeNull()
  })
  it('carries the coach perImplement flag onto the WorkoutExercise', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ equipment: 'dumbbell', perImplement: true, weight: { kind: 'single', kg: 20 } })]))
    expect(we.perImplement).toBe(true)
    const [plain] = buildWorkoutExercises(mkSession([ex({ equipment: 'barbell' })]))
    expect(plain.perImplement).toBeUndefined()
  })
})

describe('altFromNotes', () => {
  it('parses recognised swaps with their sets/reps', () => {
    expect(altFromNotes('Or hanging leg raises 3x8')).toEqual({ nameEn: 'Hanging Leg Raises', nameRu: 'Подъём ног к перекладине', equipment: 'bodyweight', sets: 3, reps: '8' })
    expect(altFromNotes('Or hanging leg raises (4×8)')).toMatchObject({ sets: 4, reps: '8' })
    expect(altFromNotes('Or hanging leg raises 3x8-12')).toMatchObject({ sets: 3, reps: '8-12' })
    expect(altFromNotes('Or plank: 3x45s')).toMatchObject({ nameEn: 'Plank', sets: 3, reps: '45s' })
  })
  it('handles a swap with no sets/reps', () => {
    expect(altFromNotes('Or hanging leg raises.')).toMatchObject({ nameEn: 'Hanging Leg Raises', sets: null, reps: '' })
  })
  it('ignores non-swap "or" notes and empty notes', () => {
    expect(altFromNotes('Light knee wraps or sleeves allowed.')).toBeNull()
    expect(altFromNotes('Medium or heavy load.')).toBeNull()
    expect(altFromNotes(undefined)).toBeNull()
    expect(altFromNotes('')).toBeNull()
  })
})

describe('swapVariant', () => {
  const swapSession = mkSession([{ order: 1, nameEn: 'Plank', nameRu: 'Планка', descEn: '', descRu: '', equipment: 'bodyweight', weight: { kind: 'bodyweight' }, sets: 4, reps: '45s', notesEn: 'Or hanging leg raises (4×8)' }])
  it('toggles to the alternative and back, keeping each variant', () => {
    const [plank] = buildWorkoutExercises(swapSession)
    const legRaises = swapVariant(plank)
    expect(legRaises.nameEn).toBe('Hanging Leg Raises')
    expect(legRaises.alt?.nameEn).toBe('Plank')
    const back = swapVariant(legRaises)
    expect(back.nameEn).toBe('Plank')
    expect(back.alt?.nameEn).toBe('Hanging Leg Raises')
  })
  it('is a no-op without an alternative', () => {
    const [squat] = buildWorkoutExercises(mkSession([{ order: 1, nameEn: 'Squat', nameRu: 'Присед', descEn: '', descRu: '', equipment: 'barbell', weight: { kind: 'single', kg: 100 }, sets: 3, reps: '5' }]))
    expect(swapVariant(squat)).toBe(squat)
  })
})

describe('timedSeconds', () => {
  it('parses durations (upper bound for ranges), null otherwise', () => {
    expect(timedSeconds('45s')).toBe(45)
    expect(timedSeconds('35-40s')).toBe(40)
    expect(timedSeconds('70-80s')).toBe(80)
    expect(timedSeconds('5')).toBeNull()
    expect(timedSeconds('6-8')).toBeNull()
    expect(timedSeconds('8–12')).toBeNull()
  })
})

const wk = (over: Partial<Workout>): Workout => ({
  id: 'x', sessionNum: 1, startedAt: '2026-06-01T00:00:00.000Z', endedAt: null,
  pausedMs: 0, pausedAt: null, status: 'finished', coachMessage: '', exercises: [], ...over,
})
const doneSet = (lb: number, reps: number) => ({ weightLb: lb, reps, done: true, restSec: 90 })

describe('lastActualFor', () => {
  it('returns null when no finished workout has the exercise', () => {
    expect(lastActualFor([], 'coach:1')).toBeNull()
  })
  it('returns the done sets from the most recent finished workout with that exercise', () => {
    const older = wk({ startedAt: '2026-06-01T00:00:00.000Z', exercises: [{ exerciseRef: 'coach:1', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(200, 5)] }] })
    const newer = wk({ startedAt: '2026-06-08T00:00:00.000Z', exercises: [{ exerciseRef: 'coach:1', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(225, 5)] }] })
    expect(lastActualFor([older, newer], 'coach:1')![0].weightLb).toBe(225)
  })
  it('ignores active/cancelled workouts', () => {
    const active = wk({ status: 'active', startedAt: '2026-06-09T00:00:00.000Z', exercises: [{ exerciseRef: 'coach:1', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(999, 1)] }] })
    const finished = wk({ status: 'finished', startedAt: '2026-06-08T00:00:00.000Z', exercises: [{ exerciseRef: 'coach:1', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(225, 5)] }] })
    expect(lastActualFor([active, finished], 'coach:1')![0].weightLb).toBe(225)
  })
  it('skips exercises with no done sets', () => {
    const w = wk({ exercises: [{ exerciseRef: 'coach:1', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [{ weightLb: 200, reps: 5, done: false, restSec: 90 }] }] })
    expect(lastActualFor([w], 'coach:1')).toBeNull()
  })
  it('falls through to an older workout when the newest has no done sets for it', () => {
    const newer = wk({ startedAt: '2026-06-08T00:00:00.000Z', exercises: [{ exerciseRef: 'coach:s', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [{ weightLb: 999, reps: 1, done: false, restSec: 90 }] }] })
    const older = wk({ startedAt: '2026-06-01T00:00:00.000Z', exercises: [{ exerciseRef: 'coach:s', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(205, 5)] }] })
    expect(lastActualFor([newer, older], 'coach:s')![0].weightLb).toBe(205)
  })
  it('returns null when finished workouts exist but none contain the exercise', () => {
    const w = wk({ exercises: [{ exerciseRef: 'coach:other', nameEn: 'O', nameRu: 'O', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(100, 5)] }] })
    expect(lastActualFor([w], 'coach:s')).toBeNull()
  })
  it('matches the ref that buildWorkoutExercises produces (round-trip)', () => {
    const session = mkSession([{ order: 1, nameEn: 'Squat (Barbell)', nameRu: 'Присед', descEn: '', descRu: '', equipment: 'barbell', weight: { kind: 'single', kg: 100 }, sets: 1, reps: '5' }])
    const [we] = buildWorkoutExercises(session)
    const finished = wk({ status: 'finished', exercises: [{ ...we, sets: [{ weightLb: 225, reps: 5, done: true, restSec: 90 }] }] })
    expect(lastActualFor([finished], we.exerciseRef)![0].weightLb).toBe(225)
  })
})

describe('blankSet', () => {
  it('is an empty, not-done set carrying the given rest', () => {
    expect(blankSet(120)).toEqual({ weightLb: null, reps: null, done: false, restSec: 120 })
  })
})

describe('catalogToWorkoutExercise', () => {
  const c: CatalogExercise = {
    id: 'leg-press', nameEn: 'Leg Press', nameRu: 'Жим ногами', ruIsFallback: false,
    equipment: 'machine', bodyPart: 'Legs', aliasesEn: [], aliasesRu: [], defaultRestSec: 90,
  }
  it('maps a catalog entry to a non-coach WorkoutExercise with one blank set', () => {
    const we = catalogToWorkoutExercise(c)
    expect(we.exerciseRef).toBe('leg-press')
    expect(we.isCoachPrescribed).toBe(false)
    expect(we.coachTarget).toBe('')
    expect(we.nameRu).toBe('Жим ногами')
    expect(we.sets).toHaveLength(1)
    expect(we.sets[0]).toEqual({ weightLb: null, reps: null, done: false, restSec: 90 })
  })
  it('carries the catalog perImplement flag', () => {
    const db: CatalogExercise = { ...c, id: 'db-press', nameEn: 'DB Press', equipment: 'dumbbell', perImplement: true }
    expect(catalogToWorkoutExercise(db).perImplement).toBe(true)
    expect(catalogToWorkoutExercise(c).perImplement).toBeUndefined()
  })
})

describe('workoutDurationSec while paused', () => {
  it('freezes at the pause moment', () => {
    const w = { startedAt: '2026-06-15T12:00:00.000Z', endedAt: null, pausedMs: 0, pausedAt: '2026-06-15T12:00:40.000Z' }
    expect(workoutDurationSec(w, Date.parse('2026-06-15T12:05:00.000Z'))).toBe(40)
  })
})

describe('togglePause', () => {
  it('pausing stamps pausedAt', () => {
    const w = wk({ pausedAt: null, status: 'active' })
    const now = Date.parse('2026-06-15T12:00:40.000Z')
    const p = togglePause(w, now)
    expect(p.pausedAt).toBe('2026-06-15T12:00:40.000Z')
    expect(p.pausedMs).toBe(0)
  })
  it('resuming clears pausedAt and accrues paused time', () => {
    const w = wk({ pausedAt: '2026-06-15T12:00:40.000Z', pausedMs: 5000, status: 'active' })
    const now = Date.parse('2026-06-15T12:01:10.000Z')
    const r = togglePause(w, now)
    expect(r.pausedAt).toBeNull()
    expect(r.pausedMs).toBe(35000)
  })
})

describe('withLastActual', () => {
  const we = (over: Partial<import('./logger-types').WorkoutExercise> = {}) => ({
    exerciseRef: 'back-extension', nameEn: 'Back Extension', nameRu: 'Гиперэкстензия',
    equipment: 'machine' as const, isCoachPrescribed: false, coachTarget: '',
    sets: [{ weightLb: null, reps: null, done: false, restSec: 90 }], ...over,
  })
  it('returns the exercise unchanged when there is no history', () => {
    const x = we()
    expect(withLastActual(x, null)).toBe(x)
    expect(withLastActual(x, [])).toBe(x)
  })
  it('an added exercise adopts last session full sets (weight, reps, count), not done', () => {
    const last = [doneSet(44, 10), doneSet(44, 10), doneSet(44, 10)]
    const out = withLastActual(we(), last)
    expect(out.sets).toHaveLength(3)
    expect(out.sets[0]).toEqual({ weightLb: 44, reps: 10, done: false, restSec: 90 })
    expect(out.sets.every((s) => !s.done)).toBe(true)
  })
  it('a coach exercise fills only missing weights, keeps reps/count', () => {
    const coach = we({ isCoachPrescribed: true, sets: [
      { weightLb: null, reps: 10, done: false, restSec: 150 },
      { weightLb: null, reps: 10, done: false, restSec: 150 },
    ] })
    const out = withLastActual(coach, [doneSet(80, 12)])
    expect(out.sets).toHaveLength(2)        // keeps coach set count
    expect(out.sets[0].weightLb).toBe(80)   // filled from last
    expect(out.sets[0].reps).toBe(10)       // keeps coach reps
  })
  it('a coach exercise does NOT override a weight the coach already set', () => {
    const coach = we({ isCoachPrescribed: true, sets: [{ weightLb: 220, reps: 5, done: false, restSec: 90 }] })
    expect(withLastActual(coach, [doneSet(999, 1)]).sets[0].weightLb).toBe(220)
  })
  it('a coach exercise fills reps the coach left blank (e.g. a rep range) from last', () => {
    const coach = we({ isCoachPrescribed: true, sets: [{ weightLb: null, reps: null, done: false, restSec: 150 }] })
    const out = withLastActual(coach, [doneSet(80, 12)])
    expect(out.sets[0].weightLb).toBe(80) // filled from last
    expect(out.sets[0].reps).toBe(12)     // reps filled from last (coach left it blank)
    expect(out.sets[0].done).toBe(false)  // still needs confirming
  })
  it('a coach exercise does NOT override reps the coach already set', () => {
    const coach = we({ isCoachPrescribed: true, sets: [{ weightLb: null, reps: 5, done: false, restSec: 90 }] })
    expect(withLastActual(coach, [doneSet(80, 12)]).sets[0].reps).toBe(5)
  })
})

describe('trainerLog', () => {
  it('adds the 45 lb bar to barbell sets, then kg, grouping consecutive sets', () => {
    const w = wk({ exercises: [
      { exerciseRef: 'b', nameEn: 'Bench', nameRu: 'Жим лёжа', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(225, 2), doneSet(225, 2), doneSet(225, 2), doneSet(225, 2)] },
      { exerciseRef: 'd', nameEn: 'DL', nameRu: 'Становая', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(295, 3), doneSet(315, 3), doneSet(315, 3), doneSet(315, 3)] },
    ] })
    // 225+45=270→122, 295+45=340→154, 315+45=360→163
    expect(trainerLog(w)).toBe('Жим лёжа\n122 × 2 — 4\n\nСтановая\n154 × 3 — 1\n163 × 3 — 3')
  })
  it('does NOT add the bar for non-barbell equipment', () => {
    const w = wk({ exercises: [{ exerciseRef: 'i', nameEn: 'Incline DB', nameRu: 'Жим гантелей', equipment: 'dumbbell', isCoachPrescribed: false, coachTarget: '', sets: [doneSet(44, 3)] }] })
    expect(trainerLog(w)).toBe('Жим гантелей\n20 × 3 — 1') // 44/2.20462 → 20
  })
  it('uses б/в for bodyweight sets', () => {
    const w = wk({ exercises: [{ exerciseRef: 'p', nameEn: 'Pushup', nameRu: 'Отжимания', equipment: 'bodyweight', isCoachPrescribed: false, coachTarget: '', sets: [{ weightLb: null, reps: 20, done: true, restSec: 90 }] }] })
    expect(trainerLog(w)).toBe('Отжимания\nб/в × 20 — 1')
  })
  it('appends the coach message when present', () => {
    const w = wk({ coachMessage: 'Колено побаливало', exercises: [{ exerciseRef: 'b', nameEn: 'Bench', nameRu: 'Жим лёжа', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(225, 2)] }] })
    expect(trainerLog(w)).toBe('Жим лёжа\n122 × 2 — 1\n\nКолено побаливало')
  })
  it('appends с (seconds) for timed holds', () => {
    const w = wk({ exercises: [{ exerciseRef: 'pl', nameEn: 'Plank', nameRu: 'Планка', equipment: 'bodyweight', isCoachPrescribed: true, coachTarget: '', isTimed: true, sets: [doneSet(0, 45), doneSet(0, 45), doneSet(0, 45), doneSet(0, 45)] }] })
    expect(trainerLog(w)).toBe('Планка\nб/в × 45с — 4')
  })
  it('bodyweight prints б/в for 0/empty weight, б/в +Nkg for added weight', () => {
    const w = wk({ exercises: [
      { exerciseRef: 'pl', nameEn: 'Plank', nameRu: 'Планка', equipment: 'bodyweight', isCoachPrescribed: false, coachTarget: '', sets: [doneSet(0, 1)] },
      { exerciseRef: 'wp', nameEn: 'Weighted Pull-up', nameRu: 'Подтягивания с весом', equipment: 'bodyweight', isCoachPrescribed: false, coachTarget: '', sets: [doneSet(30, 8)] },
    ] })
    expect(trainerLog(w)).toBe('Планка\nб/в × 1 — 1\n\nПодтягивания с весом\nб/в +14 × 8 — 1') // 30 lb → 14 kg added
  })
  it('marks a per-implement (two-dumbbell) set with (кажд.), no doubling', () => {
    const w = wk({ exercises: [{ exerciseRef: 'i', nameEn: 'Incline DB', nameRu: 'Жим гантелей', equipment: 'dumbbell', isCoachPrescribed: true, coachTarget: '', perImplement: true, sets: [doneSet(44, 3)] }] })
    expect(trainerLog(w)).toBe('Жим гантелей\n20 (кажд.) × 3 — 1')
  })
})

describe('setWeightDisplay', () => {
  it('barbell shows plate weight + full (w/ bar), in kg', () => {
    expect(setWeightDisplay(220, 'barbell', 'kg')).toBe('100 kg (120 w/ bar)')
  })
  it('barbell shows plate weight + full (w/ bar), in lb', () => {
    expect(setWeightDisplay(220, 'barbell', 'lb')).toBe('220 lb (265 w/ bar)')
  })
  it('non-barbell shows the weight as-is, no bar', () => {
    expect(setWeightDisplay(44, 'dumbbell', 'kg')).toBe('20 kg')
    expect(setWeightDisplay(44, 'dumbbell', 'lb')).toBe('44 lb')
  })
  it('null weight → dash', () => {
    expect(setWeightDisplay(null, 'barbell', 'kg')).toBe('–')
  })
  it('bodyweight: 0/empty → BW, added weight → BW +N', () => {
    expect(setWeightDisplay(0, 'bodyweight', 'kg')).toBe('BW')
    expect(setWeightDisplay(null, 'bodyweight', 'lb')).toBe('BW')
    expect(setWeightDisplay(30, 'bodyweight', 'kg')).toBe('BW +14 kg')
    expect(setWeightDisplay(30, 'bodyweight', 'lb')).toBe('BW +30 lb')
  })
  it('appends "each" for a per-implement (two-dumbbell) set', () => {
    expect(setWeightDisplay(44, 'dumbbell', 'kg', true)).toBe('20 kg each')
    expect(setWeightDisplay(44, 'dumbbell', 'lb', true)).toBe('44 lb each')
  })
  it('omits "each" when perImplement is false/absent (regression)', () => {
    expect(setWeightDisplay(44, 'dumbbell', 'kg', false)).toBe('20 kg')
    expect(setWeightDisplay(44, 'dumbbell', 'kg')).toBe('20 kg')
  })
})

describe('completeProblem / canComplete', () => {
  const set = (weightLb: number | null, reps: number | null): LoggedSet => ({ weightLb, reps, done: false, restSec: 90 })
  it('blocks empty weight and/or reps', () => {
    expect(completeProblem(set(null, null))).toBe('Enter weight and reps first')
    expect(completeProblem(set(null, 5))).toBe('Enter weight first')
    expect(completeProblem(set(100, null))).toBe('Enter reps first')
  })
  it('blocks 0 / decimal / negative reps', () => {
    expect(completeProblem(set(100, 0))).toBe('Reps must be a whole number (1+)')
    expect(completeProblem(set(100, 3.5))).toBe('Reps must be a whole number (1+)')
    expect(completeProblem(set(100, -2))).toBe('Reps must be a whole number (1+)')
  })
  it('blocks negative weight', () => {
    expect(completeProblem(set(-5, 3))).toBe("Weight can't be negative")
  })
  it('allows weight 0 (empty bar / loadless) with reps ≥ 1', () => {
    expect(completeProblem(set(0, 1))).toBeNull()
    expect(canComplete(set(0, 1))).toBe(true)
  })
  it('allows a normal weighted set', () => {
    expect(canComplete(set(100, 5))).toBe(true)
  })
  it('labels the rep field per the second arg (e.g. seconds for holds)', () => {
    expect(completeProblem(set(0, null), 'seconds')).toBe('Enter seconds first')
    expect(completeProblem(set(0, 0), 'seconds')).toBe('Seconds must be a whole number (1+)')
  })
})

describe('fillEmptySets', () => {
  const set = (weightLb: number | null, reps: number | null, done = false): LoggedSet => ({ weightLb, reps, done, restSec: 90 })
  it('fills every other blank set with the completed set, left not done', () => {
    const out = fillEmptySets([set(100, 6, true), set(null, null), set(null, null), set(null, null)], 0)
    expect(out.slice(1)).toEqual([
      { weightLb: 100, reps: 6, done: false, restSec: 90 },
      { weightLb: 100, reps: 6, done: false, restSec: 90 },
      { weightLb: 100, reps: 6, done: false, restSec: 90 },
    ])
  })
  it('fills only empty fields, keeping coach-prefilled reps', () => {
    const out = fillEmptySets([set(30, 10, true), set(null, 10), set(null, 10)], 0)
    expect(out[1]).toEqual({ weightLb: 30, reps: 10, done: false, restSec: 90 })
    expect(out[2]).toEqual({ weightLb: 30, reps: 10, done: false, restSec: 90 })
  })
  it('never overwrites an already-entered value', () => {
    expect(fillEmptySets([set(100, 6, true), set(95, null)], 0)[1])
      .toEqual({ weightLb: 95, reps: 6, done: false, restSec: 90 })
  })
  it('leaves already-done sets untouched', () => {
    expect(fillEmptySets([set(100, 6, true), set(50, 8, true)], 0)[1])
      .toEqual({ weightLb: 50, reps: 8, done: true, restSec: 90 })
  })
  it('is a no-op (same ref) when the source set has a null field', () => {
    const sets = [set(null, 6, true), set(null, null)]
    expect(fillEmptySets(sets, 0)).toBe(sets)
  })
  it('does not mutate the input array', () => {
    const sets = [set(100, 6, true), set(null, null)]
    const before = JSON.parse(JSON.stringify(sets))
    fillEmptySets(sets, 0)
    expect(sets).toEqual(before)
  })
})

describe('allSetsForRef', () => {
  const set = (weightLb: number | null, reps: number | null, done = true): LoggedSet => ({ weightLb, reps, done, restSec: 90 })
  const wex = (over: Partial<WorkoutExercise> & { exerciseRef: string; sets: LoggedSet[] }): WorkoutExercise => ({
    nameEn: 'Back Squat', nameRu: 'Присед', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', ...over,
  })
  const wk = (over: Partial<Workout>): Workout => ({
    id: 'x', sessionNum: 1, startedAt: '2026-06-01T00:00:00.000Z', endedAt: null,
    pausedMs: 0, pausedAt: null, status: 'finished', coachMessage: '', exercises: [], ...over,
  })

  it('returns [] when no finished workout has the ref', () => {
    expect(allSetsForRef([], 'coach:back-squat')).toEqual([])
  })

  it('returns one entry per finished workout with the ref, newest first', () => {
    const older = wk({ id: 'a', startedAt: '2026-06-01T00:00:00.000Z', exercises: [wex({ exerciseRef: 'coach:back-squat', sets: [set(135, 5)] })] })
    const newer = wk({ id: 'b', startedAt: '2026-06-10T00:00:00.000Z', exercises: [wex({ exerciseRef: 'coach:back-squat', sets: [set(145, 5)] })] })
    const out = allSetsForRef([older, newer], 'coach:back-squat')
    expect(out.map((o) => o.dateIso)).toEqual(['2026-06-10T00:00:00.000Z', '2026-06-01T00:00:00.000Z'])
    expect(out[0].sets[0].weightLb).toBe(145)
  })

  it('includes only DONE sets and skips workouts with none done', () => {
    const mixed = wk({ exercises: [wex({ exerciseRef: 'coach:back-squat', sets: [set(135, 5, true), set(155, 3, false)] })] })
    const noneDone = wk({ id: 'z', startedAt: '2026-05-01T00:00:00.000Z', exercises: [wex({ exerciseRef: 'coach:back-squat', sets: [set(200, 5, false)] })] })
    const out = allSetsForRef([mixed, noneDone], 'coach:back-squat')
    expect(out).toHaveLength(1)
    expect(out[0].sets.map((s) => s.weightLb)).toEqual([135])
  })

  it('matches the exact ref only (a different variant ref is excluded)', () => {
    const w = wk({ exercises: [
      wex({ exerciseRef: 'coach:bench-press', sets: [set(135, 5)] }),
      wex({ exerciseRef: 'coach:bench-press-1s-pause-on-chest', nameEn: 'Bench Press, 1s pause on chest', sets: [set(115, 5)] }),
    ] })
    const out = allSetsForRef([w], 'coach:bench-press')
    expect(out).toHaveLength(1)
    expect(out[0].sets[0].weightLb).toBe(135)
  })

  it('skips unfinished workouts', () => {
    const active = wk({ status: 'active', exercises: [wex({ exerciseRef: 'coach:back-squat', sets: [set(225, 5)] })] })
    expect(allSetsForRef([active], 'coach:back-squat')).toEqual([])
  })

  it('carries the exercise metadata (name, equipment, isTimed)', () => {
    const w = wk({ exercises: [wex({ exerciseRef: 'coach:plank', nameEn: 'Plank', nameRu: 'Планка', equipment: 'bodyweight', isTimed: true, sets: [set(0, 45)] })] })
    const out = allSetsForRef([w], 'coach:plank')
    expect(out[0]).toMatchObject({ nameEn: 'Plank', nameRu: 'Планка', equipment: 'bodyweight', isTimed: true })
  })
  it('surfaces perImplement on the occurrence', () => {
    const w = wk({ exercises: [wex({ exerciseRef: 'db', nameEn: 'DB Press', equipment: 'dumbbell', perImplement: true, sets: [set(40, 10)] })] })
    expect(allSetsForRef([w], 'db')[0].perImplement).toBe(true)
    const plain = wk({ exercises: [wex({ exerciseRef: 'bb', sets: [set(135, 5)] })] })
    expect(allSetsForRef([plain], 'bb')[0].perImplement).toBe(false)
  })
})

describe('exerciseVolumeLb / workoutVolumeLb', () => {
  const set = (weightLb: number | null, reps: number | null, done = true): LoggedSet => ({ weightLb, reps, done, restSec: 90 })
  const wex = (over: Partial<WorkoutExercise> & { sets: LoggedSet[] }): WorkoutExercise => ({
    exerciseRef: 'r', nameEn: 'X', nameRu: 'X', equipment: 'barbell', isCoachPrescribed: false, coachTarget: '', ...over,
  })
  const wk = (exercises: WorkoutExercise[]): Workout => ({
    id: 'x', sessionNum: 1, startedAt: '2026-06-01T00:00:00.000Z', endedAt: null,
    pausedMs: 0, pausedAt: null, status: 'finished', coachMessage: '', exercises,
  })

  it('sums full weight × reps for a barbell lift, including the 45 lb bar', () => {
    expect(exerciseVolumeLb(wex({ equipment: 'barbell', sets: [set(135, 5), set(135, 5)] }))).toBe((135 + 45) * 5 * 2) // 1800
  })

  it('uses the weight as-is for non-barbell (no bar added)', () => {
    expect(exerciseVolumeLb(wex({ equipment: 'dumbbell', sets: [set(50, 10)] }))).toBe(500)
  })

  it('counts only added weight for bodyweight (plain BW contributes 0)', () => {
    expect(exerciseVolumeLb(wex({ equipment: 'bodyweight', sets: [set(0, 15), set(25, 8)] }))).toBe(25 * 8) // 200
  })

  it('skips not-done, null-rep, and non-integer-rep sets', () => {
    const ex = wex({ equipment: 'barbell', sets: [set(100, 5, false), set(100, null), set(100, 2.5), set(100, 3)] })
    expect(exerciseVolumeLb(ex)).toBe((100 + 45) * 3) // only the 3-rep done set
  })

  it('counts an empty-bar barbell set as the bar weight (null/0 plates → 45)', () => {
    expect(exerciseVolumeLb(wex({ equipment: 'barbell', sets: [set(0, 5), set(null, 5)] }))).toBe(45 * 5 + 45 * 5) // 450
  })

  it('returns 0 for a timed hold (weight × seconds is not volume)', () => {
    expect(exerciseVolumeLb(wex({ equipment: 'bodyweight', isTimed: true, sets: [set(0, 45)] }))).toBe(0)
  })

  it('doubles the load for a per-implement (two-dumbbell) movement', () => {
    expect(exerciseVolumeLb(wex({ equipment: 'dumbbell', perImplement: true, sets: [set(50, 10)] }))).toBe(1000)
  })
  it('a non-per-implement dumbbell still counts one bell', () => {
    expect(exerciseVolumeLb(wex({ equipment: 'dumbbell', sets: [set(50, 10)] }))).toBe(500)
  })

  it('workoutVolumeLb sums volume across all exercises', () => {
    const w = wk([
      wex({ equipment: 'barbell', sets: [set(135, 5)] }),   // 180 * 5 = 900
      wex({ equipment: 'dumbbell', sets: [set(40, 10)] }),  // 400
      wex({ equipment: 'bodyweight', isTimed: true, sets: [set(0, 45)] }), // 0
    ])
    expect(workoutVolumeLb(w)).toBe(900 + 400)
  })
})

describe('isRestElapsed', () => {
  it('is false before the end', () => { expect(isRestElapsed(1000, 999)).toBe(false) })
  it('is true at the exact end', () => { expect(isRestElapsed(1000, 1000)).toBe(true) })
  it('is true after the end', () => { expect(isRestElapsed(1000, 1001)).toBe(true) })
})

describe('tallyUsage', () => {
  const ex = (ref: string) => ({ exerciseRef: ref, nameEn: 'X', nameRu: 'X', equipment: 'barbell' as const, isCoachPrescribed: false, coachTarget: '', sets: [doneSet(100, 5)] })
  const keyOf = (we: WorkoutExercise) => we.exerciseRef

  it('returns {} for empty history', () => {
    expect(tallyUsage([], keyOf)).toEqual({})
  })
  it('counts one occurrence per finished workout that has the exercise', () => {
    const w1 = wk({ id: 'a', endedAt: '2026-06-01T00:00:00.000Z', exercises: [ex('bench')] })
    const w2 = wk({ id: 'b', endedAt: '2026-06-08T00:00:00.000Z', exercises: [ex('bench')] })
    expect(tallyUsage([w1, w2], keyOf)['bench'].count).toBe(2)
  })
  it('adds the amount when the same exercise appears twice in one workout', () => {
    const w = wk({ exercises: [ex('bench'), ex('bench')] })
    expect(tallyUsage([w], keyOf)['bench'].count).toBe(2)
  })
  it('ignores active and cancelled workouts', () => {
    const active = wk({ status: 'active', exercises: [ex('bench')] })
    const cancelled = wk({ status: 'cancelled', exercises: [ex('bench')] })
    const finished = wk({ status: 'finished', exercises: [ex('bench')] })
    expect(tallyUsage([active, cancelled, finished], keyOf)['bench'].count).toBe(1)
  })
  it('tracks lastUsedAt as the most recent endedAt', () => {
    const older = wk({ id: 'a', endedAt: '2026-06-01T00:00:00.000Z', exercises: [ex('bench')] })
    const newer = wk({ id: 'b', endedAt: '2026-06-20T00:00:00.000Z', exercises: [ex('bench')] })
    expect(tallyUsage([newer, older], keyOf)['bench'].lastUsedAt).toBe('2026-06-20T00:00:00.000Z')
  })
  it('falls back to startedAt when endedAt is null', () => {
    const w = wk({ endedAt: null, startedAt: '2026-06-05T00:00:00.000Z', exercises: [ex('bench')] })
    expect(tallyUsage([w], keyOf)['bench'].lastUsedAt).toBe('2026-06-05T00:00:00.000Z')
  })
  it('skips exercises whose key resolves to null', () => {
    const w = wk({ exercises: [ex('bench'), ex('coach:unknown')] })
    const out = tallyUsage([w], (we) => (we.exerciseRef === 'coach:unknown' ? null : we.exerciseRef))
    expect(out['coach:unknown']).toBeUndefined()
    expect(out['bench'].count).toBe(1)
  })
})
