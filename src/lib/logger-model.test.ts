import { describe, it, expect } from 'vitest'
import { restDefaultFor, workoutDurationSec, buildWorkoutExercises, coachTargetText, lastActualFor, catalogToWorkoutExercise, blankSet, togglePause } from './logger-model'
import type { Session, Exercise } from '../data/types'
import type { Workout } from './logger-types'
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
  it('pre-fills set count from coach sets, lb from kg, reps from reps', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ sets: 3, weight: { kind: 'single', kg: 100 }, reps: '5' })]))
    expect(we.sets).toHaveLength(3)
    expect(we.sets[0].weightLb).toBe(220)
    expect(we.sets[0].reps).toBe(5)
    expect(we.sets[0].done).toBe(false)
    expect(we.sets[0].restSec).toBe(300)
  })
  it('defaults to one set when coach sets is null', () => {
    expect(buildWorkoutExercises(mkSession([ex({ sets: null })]))[0].sets).toHaveLength(1)
  })
  it('uses per-set kg/reps for a perSet scheme', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({
      weight: { kind: 'perSet', steps: [{ kg: 100, reps: 5 }, { kg: 90, reps: 8 }] }, sets: 2,
    })]))
    expect(we.sets[0].weightLb).toBe(220)
    expect(we.sets[1].weightLb).toBe(198)
    expect(we.sets[1].reps).toBe(8)
  })
  it('leaves weightLb null for bodyweight and non-numeric reps null', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ weight: { kind: 'bodyweight' }, reps: '8–12' })]))
    expect(we.sets[0].weightLb).toBeNull()
    expect(we.sets[0].reps).toBeNull()
  })
  it('uses per-index kg for a progression scheme, clamping extra sets', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ weight: { kind: 'progression', kg: [80, 90, 100] }, sets: 5 })]))
    expect(we.sets.map((s) => s.weightLb)).toEqual([176, 198, 220, 220, 220])
  })
  it('keeps every perSet step when coach sets is null', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ sets: null, weight: { kind: 'perSet', steps: [{ kg: 130, reps: 3 }, { kg: 145, reps: 3 }, { kg: 145, reps: 3 }, { kg: 145, reps: 3 }] } })]))
    expect(we.sets).toHaveLength(4)
    expect(we.sets[3].weightLb).toBe(320)
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
