import { describe, it, expect } from 'vitest'
import { epley1rm, bestE1rmKg, bestE1rmLb, e1rmSeries } from './e1rm'
import type { Workout, WorkoutExercise, LoggedSet } from './logger-types'
import type { Equipment } from '../data/types'

describe('epley1rm', () => {
  it('applies the Epley formula weight*(1+reps/30)', () => {
    expect(epley1rm(100, 5)).toBeCloseTo(116.667, 3)
    expect(epley1rm(100, 1)).toBeCloseTo(103.333, 3)
  })

  it('rewards reps: a strong 5-rep set out-ranks a heavier single', () => {
    expect(epley1rm(140, 5)).toBeGreaterThan(epley1rm(142, 1))
  })
})

const set = (weightLb: number | null, reps: number | null, done = true): LoggedSet =>
  ({ weightLb, reps, done, restSec: 90 })

const ex = (nameEn: string, equipment: Equipment, sets: LoggedSet[]): WorkoutExercise => ({
  exerciseRef: nameEn.toLowerCase().replace(/\s+/g, '-'), nameEn, nameRu: nameEn,
  equipment, isCoachPrescribed: false, coachTarget: '', sets,
})

const wk = (over: Partial<Workout>): Workout => ({
  id: 'x', sessionNum: 1, startedAt: '2026-06-01T00:00:00.000Z', endedAt: null,
  pausedMs: 0, pausedAt: null, status: 'finished', coachMessage: '', exercises: [], ...over,
})

describe('bestE1rmKg', () => {
  it('returns null when no workout has a matching done set', () => {
    expect(bestE1rmKg([], /squat/i)).toBeNull()
  })

  it('picks the highest Epley e1RM, not the heaviest weight', () => {
    // 5x140 plates → (140+45)*(1+5/30)=215.83 lb → 97.9 kg → 98
    // 1x150 plates → (150+45)*(1+1/30)=201.50 lb → 91.4 kg → 91
    const w = wk({ exercises: [ex('Back Squat', 'barbell', [set(140, 5), set(150, 1)])] })
    expect(bestE1rmKg([w], /squat/i)).toBe(98)
  })

  it('adds the 45 lb bar back before converting (logged weight is plates only)', () => {
    // 1x135 plates → (135+45)*(1+1/30)=186.0 lb → 84.4 kg → 84
    const w = wk({ exercises: [ex('Bench Press', 'barbell', [set(135, 1)])] })
    expect(bestE1rmKg([w], /bench/i)).toBe(84)
  })

  it('ignores non-barbell, non-matching, not-done, and invalid-rep sets', () => {
    const w = wk({ exercises: [
      ex('Goblet Squat', 'dumbbell', [set(200, 5)]),     // non-barbell
      ex('Bench Press', 'barbell', [set(300, 5)]),        // non-matching for /squat/
      ex('Back Squat', 'barbell', [set(999, 5, false)]),  // not done
      ex('Front Squat', 'barbell', [set(100, 0)]),        // reps < 1
    ] })
    expect(bestE1rmKg([w], /squat/i)).toBeNull()
  })

  it('skips active (unfinished) workouts', () => {
    const active = wk({ status: 'active', exercises: [ex('Back Squat', 'barbell', [set(999, 5)])] })
    expect(bestE1rmKg([active], /squat/i)).toBeNull()
  })
})

describe('bestE1rmLb', () => {
  it('returns null when nothing qualifies', () => {
    expect(bestE1rmLb([], /squat/i)).toBeNull()
  })

  it('returns the best full e1RM in lb, rounded once (bar added back)', () => {
    // 1x135 plates → (135+45)*(1+1/30)=186.0 lb → 186
    const w = wk({ exercises: [ex('Bench Press', 'barbell', [set(135, 1)])] })
    expect(bestE1rmLb([w], /bench/i)).toBe(186)
  })

  it('does not double-round (lb is rounded from precise lb, not from rounded kg)', () => {
    // 5x140 → (140+45)*(1+5/30)=215.833 lb → bestE1rmLb=216; kg path = round(215.833/2.20462)=98
    const w = wk({ exercises: [ex('Back Squat', 'barbell', [set(140, 5)])] })
    expect(bestE1rmLb([w], /squat/i)).toBe(216)
    expect(bestE1rmKg([w], /squat/i)).toBe(98)
  })
})

describe('e1rmSeries', () => {
  it('returns [] when nothing qualifies', () => {
    expect(e1rmSeries([], /squat/i)).toEqual([])
  })

  it('emits one point per finished workout: date + driving set (plates) + precise full e1RM', () => {
    const w = wk({ startedAt: '2026-06-01T00:00:00.000Z', exercises: [ex('Back Squat', 'barbell', [set(140, 5)])] })
    const s = e1rmSeries([w], /squat/i)
    expect(s).toHaveLength(1)
    expect(s[0].dateIso).toBe('2026-06-01T00:00:00.000Z')
    expect(s[0].weightLb).toBe(140)   // plates only — bar added back inside the e1RM
    expect(s[0].reps).toBe(5)
    expect(s[0].e1rmFullLb).toBeCloseTo(215.833, 3) // (140+45)*(1+5/30)
  })

  it("picks the workout's BEST-e1RM set, not its heaviest", () => {
    // 1x150 plates → (195)*(1+1/30)=201.5 ; 5x140 plates → 215.83 → best is the 5x140
    const w = wk({ exercises: [ex('Back Squat', 'barbell', [set(150, 1), set(140, 5)])] })
    const s = e1rmSeries([w], /squat/i)
    expect(s).toHaveLength(1)
    expect(s[0].weightLb).toBe(140)
    expect(s[0].reps).toBe(5)
    expect(s[0].e1rmFullLb).toBeCloseTo(215.833, 3)
  })

  it('sorts points ascending by date regardless of input order', () => {
    const later = wk({ id: 'a', startedAt: '2026-06-10T00:00:00.000Z', exercises: [ex('Back Squat', 'barbell', [set(150, 5)])] })
    const earlier = wk({ id: 'b', startedAt: '2026-06-01T00:00:00.000Z', exercises: [ex('Back Squat', 'barbell', [set(140, 5)])] })
    const s = e1rmSeries([later, earlier], /squat/i)
    expect(s.map((p) => p.dateIso)).toEqual(['2026-06-01T00:00:00.000Z', '2026-06-10T00:00:00.000Z'])
    expect(s.map((p) => p.weightLb)).toEqual([140, 150])
  })

  it('skips unfinished workouts and workouts with no qualifying set', () => {
    const finishedNoSquat = wk({ id: 'a', exercises: [ex('Bench Press', 'barbell', [set(200, 5)])] })
    const active = wk({ id: 'b', status: 'active', exercises: [ex('Back Squat', 'barbell', [set(999, 5)])] })
    const invalidReps = wk({ id: 'c', exercises: [ex('Back Squat', 'barbell', [set(100, 0)])] })
    expect(e1rmSeries([finishedNoSquat, active, invalidReps], /squat/i)).toEqual([])
  })

  it('ignores non-barbell, non-matching, and not-done sets within a counted workout', () => {
    const w = wk({ exercises: [
      ex('Goblet Squat', 'dumbbell', [set(300, 5)]),               // non-barbell
      ex('Back Squat', 'barbell', [set(135, 5), set(999, 5, false)]), // 2nd not done
    ] })
    const s = e1rmSeries([w], /squat/i)
    expect(s).toHaveLength(1)
    expect(s[0].weightLb).toBe(135)
    expect(s[0].reps).toBe(5)
  })
})
