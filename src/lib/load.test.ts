import { describe, it, expect } from 'vitest'
import { kgToLb, roundUpToStep } from './load'

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
