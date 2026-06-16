import { describe, it, expect } from 'vitest'
import { restDefaultFor, workoutDurationSec, buildWorkoutExercises, coachTargetText, lastActualFor, catalogToWorkoutExercise, blankSet, togglePause, withLastActual, trainerLog, setWeightDisplay, completeProblem, canComplete } from './logger-model'
import type { Session, Exercise } from '../data/types'
import type { Workout, LoggedSet } from './logger-types'
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
  it('pre-fills barbell lb as PLATE weight (coach total − 45 bar), reps from reps', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ sets: 3, weight: { kind: 'single', kg: 100 }, reps: '5' })]))
    expect(we.sets).toHaveLength(3)
    expect(we.sets[0].weightLb).toBe(175) // 100kg = 220 lb total − 45 bar
    expect(we.sets[0].reps).toBe(5)
    expect(we.sets[0].done).toBe(false)
    expect(we.sets[0].restSec).toBe(300)
  })
  it('does NOT subtract the bar for non-barbell equipment', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ equipment: 'dumbbell', weight: { kind: 'single', kg: 30 } })]))
    expect(we.sets[0].weightLb).toBe(66) // round(kgToLb(30)), no bar
  })
  it('defaults to one set when coach sets is null', () => {
    expect(buildWorkoutExercises(mkSession([ex({ sets: null })]))[0].sets).toHaveLength(1)
  })
  it('uses per-set kg/reps for a perSet scheme (barbell plate weight)', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({
      weight: { kind: 'perSet', steps: [{ kg: 100, reps: 5 }, { kg: 90, reps: 8 }] }, sets: 2,
    })]))
    expect(we.sets[0].weightLb).toBe(175) // 220 − 45
    expect(we.sets[1].weightLb).toBe(153) // 198 − 45
    expect(we.sets[1].reps).toBe(8)
  })
  it('leaves weightLb null for bodyweight and non-numeric reps null', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ weight: { kind: 'bodyweight' }, reps: '8–12' })]))
    expect(we.sets[0].weightLb).toBeNull()
    expect(we.sets[0].reps).toBeNull()
  })
  it('uses per-index kg for a progression scheme, clamping extra sets (barbell plate weight)', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ weight: { kind: 'progression', kg: [80, 90, 100] }, sets: 5 })]))
    expect(we.sets.map((s) => s.weightLb)).toEqual([131, 153, 175, 175, 175]) // each − 45 bar
  })
  it('keeps every perSet step when coach sets is null', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ sets: null, weight: { kind: 'perSet', steps: [{ kg: 130, reps: 3 }, { kg: 145, reps: 3 }, { kg: 145, reps: 3 }, { kg: 145, reps: 3 }] } })]))
    expect(we.sets).toHaveLength(4)
    expect(we.sets[3].weightLb).toBe(275) // 145kg = 320 lb total − 45 bar
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
  it('bodyweight prints б/в for 0/empty weight, б/в +Nkg for added weight', () => {
    const w = wk({ exercises: [
      { exerciseRef: 'pl', nameEn: 'Plank', nameRu: 'Планка', equipment: 'bodyweight', isCoachPrescribed: false, coachTarget: '', sets: [doneSet(0, 1)] },
      { exerciseRef: 'wp', nameEn: 'Weighted Pull-up', nameRu: 'Подтягивания с весом', equipment: 'bodyweight', isCoachPrescribed: false, coachTarget: '', sets: [doneSet(30, 8)] },
    ] })
    expect(trainerLog(w)).toBe('Планка\nб/в × 1 — 1\n\nПодтягивания с весом\nб/в +14 × 8 — 1') // 30 lb → 14 kg added
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
})
