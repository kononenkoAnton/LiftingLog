import { describe, it, expect } from 'vitest'
import { parseWeightInput, formatWeight } from './bodyweight-model'

describe('parseWeightInput', () => {
  it('parses a kg value as kilograms unchanged', () => {
    expect(parseWeightInput('82', 'kg')).toBeCloseTo(82, 5)
    expect(parseWeightInput('82.4', 'kg')).toBeCloseTo(82.4, 5)
  })

  it('converts an lb value to kilograms', () => {
    expect(parseWeightInput('181.7', 'lb')).toBeCloseTo(181.7 / 2.20462, 4)
  })

  it('accepts a comma decimal separator (RU locale)', () => {
    expect(parseWeightInput('82,4', 'kg')).toBeCloseTo(82.4, 5)
  })

  it('trims surrounding whitespace', () => {
    expect(parseWeightInput('  82  ', 'kg')).toBeCloseTo(82, 5)
  })

  it('rejects empty, non-numeric, zero, and negative input', () => {
    expect(parseWeightInput('', 'kg')).toBeNull()
    expect(parseWeightInput('abc', 'kg')).toBeNull()
    expect(parseWeightInput('0', 'kg')).toBeNull()
    expect(parseWeightInput('-5', 'kg')).toBeNull()
  })

  it('rejects absurd values over 500 kg', () => {
    expect(parseWeightInput('501', 'kg')).toBeNull()
    expect(parseWeightInput('1200', 'lb')).toBeNull() // ~544 kg
  })
})

describe('formatWeight', () => {
  it('formats kg to one decimal', () => {
    expect(formatWeight(82, 'kg')).toBe('82.0')
    expect(formatWeight(82.44, 'kg')).toBe('82.4')
  })

  it('formats kg as lb to one decimal', () => {
    expect(formatWeight(82, 'lb')).toBe((82 * 2.20462).toFixed(1))
  })
})
