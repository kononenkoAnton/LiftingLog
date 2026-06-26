import { describe, it, expect } from 'vitest'
import { perImplementFor } from './build-catalog.mjs'

describe('perImplementFor', () => {
  it('flags two-dumbbell movements', () => {
    expect(perImplementFor('Dumbbell Bench Press', 'dumbbell')).toBe(true)
    expect(perImplementFor('Incline Dumbbell Press', 'dumbbell')).toBe(true)
  })
  it('excludes goblet and single/one-arm dumbbell movements', () => {
    expect(perImplementFor('Dumbbell Goblet Squat', 'dumbbell')).toBe(false)
    expect(perImplementFor('Single-Arm Dumbbell Row', 'dumbbell')).toBe(false)
    expect(perImplementFor('Single Arm Dumbbell Row', 'dumbbell')).toBe(false)
    expect(perImplementFor('One-Arm Dumbbell Row', 'dumbbell')).toBe(false)
  })
  it('is false for non-dumbbell equipment', () => {
    expect(perImplementFor('Barbell Bench Press', 'barbell')).toBe(false)
    expect(perImplementFor('Goblet Squat', 'bodyweight')).toBe(false)
  })
  it('excludes kettlebell movements (classified as dumbbell, mostly single-bell)', () => {
    expect(perImplementFor('Kettlebell Swing', 'dumbbell')).toBe(false)
    expect(perImplementFor('2 Handed Kettlebell Swing', 'dumbbell')).toBe(false)
    expect(perImplementFor('Double Kettlebell Front Squat', 'dumbbell')).toBe(false)
  })
})
