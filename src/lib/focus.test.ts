import { describe, it, expect } from 'vitest'
import { deriveFocus } from './focus'
import type { Exercise } from '../data/types'

const ex = (nameEn: string, order: number): Exercise => ({
  order, nameEn, nameRu: '', descEn: '', descRu: '',
  equipment: 'barbell', weight: { kind: 'single', kg: 100 }, sets: 3, reps: '4',
})

describe('deriveFocus', () => {
  it('joins the first two distinct primary movements', () => {
    expect(deriveFocus([ex('Bench Press, 1s pause', 1), ex('Conventional Deadlift', 2), ex('DB Shrugs', 3)]))
      .toBe('Bench + Deadlift')
  })
  it('labels squat + overhead press days', () => {
    expect(deriveFocus([ex('Squat in knee sleeves', 1), ex('Overhead Press', 2)]))
      .toBe('Squat + Press')
  })
  it('falls back to Accessory when no primary movement matches', () => {
    expect(deriveFocus([ex('Cable Triceps Pushdown', 1), ex('Plank', 2)]))
      .toBe('Accessory')
  })
})
