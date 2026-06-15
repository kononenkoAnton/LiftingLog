import { describe, it, expect } from 'vitest'
import { restDefaultFor, workoutDurationSec } from './logger-model'

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
