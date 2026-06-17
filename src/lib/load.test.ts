import { describe, it, expect } from 'vitest'
import { kgToLb, roundUpToStep, computeBarbellLoad, platesForPlateLb, fullBarLb } from './load'

describe('kgToLb', () => {
  it('converts kilograms to pounds', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 3)
    expect(kgToLb(75)).toBeCloseTo(165.3465, 3)
  })
})

describe('roundUpToStep', () => {
  it('rounds up to the nearest step', () => {
    expect(roundUpToStep(165.3, 5)).toBe(170)
    expect(roundUpToStep(166, 5)).toBe(170)
  })
  it('keeps exact multiples unchanged', () => {
    expect(roundUpToStep(170, 5)).toBe(170)
  })
})

describe('computeBarbellLoad', () => {
  it('rounds per side up to 5 lb and breaks plates per side (75kg)', () => {
    const r = computeBarbellLoad(75) // 165.35 lb → per side 60.17 → 65 → 175 total
    expect(r.totalLb).toBe(175)
    expect(r.perSideLb).toBe(65)
    expect(r.plates).toEqual([
      { plate: 45, count: 1 },
      { plate: 10, count: 2 },
    ])
  })

  it('returns an empty bar when target is at/below bar weight (20kg)', () => {
    const r = computeBarbellLoad(20) // ~44.09 lb -> 45 total
    expect(r.totalLb).toBe(45)
    expect(r.perSideLb).toBe(0)
    expect(r.plates).toEqual([])
  })

  it('handles a clean mid load (60kg)', () => {
    const r = computeBarbellLoad(60) // ~132.28 -> 135 total -> 45/side
    expect(r.totalLb).toBe(135)
    expect(r.perSideLb).toBe(45)
    expect(r.plates).toEqual([{ plate: 45, count: 1 }])
  })

  it('always rounds up, never under target (120kg)', () => {
    const r = computeBarbellLoad(120) // 264.55 -> 265 total
    expect(r.totalLb).toBe(265)
    expect(r.totalLb).toBeGreaterThanOrEqual(kgToLb(120))
  })
})

describe('platesForPlateLb', () => {
  it('splits a plate weight evenly per side (220 plates -> 110/side)', () => {
    expect(platesForPlateLb(220)).toEqual([{ plate: 45, count: 2 }, { plate: 10, count: 2 }])
  })
  it('splits a loadable plate weight (150 -> 75/side)', () => {
    expect(platesForPlateLb(150)).toEqual([
      { plate: 45, count: 1 }, { plate: 25, count: 1 }, { plate: 5, count: 1 },
    ])
  })
  it('is empty for a bare bar (0 plates)', () => {
    expect(platesForPlateLb(0)).toEqual([])
    expect(platesForPlateLb(-5)).toEqual([])
  })
})

describe('fullBarLb', () => {
  it('adds the 45 lb bar to a plate weight', () => {
    expect(fullBarLb(220)).toBe(265)
    expect(fullBarLb(0)).toBe(45)
  })
})
