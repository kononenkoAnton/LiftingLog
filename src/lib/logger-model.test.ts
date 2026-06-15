import { describe, it, expect } from 'vitest'
import { restDefaultFor, workoutDurationSec, buildWorkoutExercises, coachTargetText } from './logger-model'
import type { Session, Exercise } from '../data/types'

const mkSession = (exercises: Exercise[]): Session => ({
  num: 7, date: '2026-06-16', dateLabel: 'Tue Jun 16', focus: 'Squat', exercises,
})

describe('restDefaultFor', () => {
  it('gives squats 90s', () => { expect(restDefaultFor('Back Squat', 'barbell')).toBe(90) })
  it('gives bench 150s', () => { expect(restDefaultFor('Bench Press', 'barbell')).toBe(150) })
  it('gives barbell deadlift 300s', () => { expect(restDefaultFor('Deadlift', 'barbell')).toBe(300) })
  it('does not give a dumbbell deadlift 300s', () => { expect(restDefaultFor('Single-Leg Deadlift', 'dumbbell')).toBe(90) })
  it('gives other barbell work 180s', () => { expect(restDefaultFor('Barbell Row', 'barbell')).toBe(180) })
  it('gives other non-barbell work 90s', () => { expect(restDefaultFor('Lat Pulldown', 'cable')).toBe(90) })
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
  it('makes one WorkoutExercise per coach exercise, ref by order', () => {
    const out = buildWorkoutExercises(mkSession([ex({ order: 2 })]))
    expect(out).toHaveLength(1)
    expect(out[0].exerciseRef).toBe('coach:2')
    expect(out[0].isCoachPrescribed).toBe(true)
  })
  it('pre-fills set count from coach sets, lb from kg, reps from reps', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ sets: 3, weight: { kind: 'single', kg: 100 }, reps: '5' })]))
    expect(we.sets).toHaveLength(3)
    expect(we.sets[0].weightLb).toBe(220)
    expect(we.sets[0].reps).toBe(5)
    expect(we.sets[0].done).toBe(false)
    expect(we.sets[0].restSec).toBe(90)
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
