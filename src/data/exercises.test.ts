import { describe, it, expect } from 'vitest'
import data from './exercises.json'
import type { CatalogExercise } from './catalog-types'

const all = data as CatalogExercise[]
const EQUIPMENT = new Set(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight'])

describe('exercises.json', () => {
  it('holds a full catalog (hundreds of entries)', () => {
    expect(all.length).toBeGreaterThan(100)
  })

  it('every entry has both names, a valid equipment, a body part, and a positive rest', () => {
    for (const e of all) {
      expect(e.nameEn, e.id).toBeTruthy()
      expect(e.nameRu, e.id).toBeTruthy()
      expect(EQUIPMENT.has(e.equipment), `${e.id}: bad equipment "${e.equipment}"`).toBe(true)
      expect(e.bodyPart, e.id).toBeTruthy()
      expect(e.defaultRestSec, e.id).toBeGreaterThan(0)
    }
  })

  it('ids are unique', () => {
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length)
  })

  it('includes the powerlifting competition lifts', () => {
    expect(all.some((e) => /squat/i.test(e.nameEn)), 'squat').toBe(true)
    expect(all.some((e) => /bench press/i.test(e.nameEn)), 'bench').toBe(true)
    expect(all.some((e) => /deadlift/i.test(e.nameEn)), 'deadlift').toBe(true)
  })

  it('only dumbbell entries are flagged per-implement', () => {
    for (const e of all) {
      if (e.perImplement) expect(e.equipment, e.id).toBe('dumbbell')
    }
  })
  it('never flags goblet / single-arm / one-arm dumbbell lifts', () => {
    for (const e of all) {
      if (/goblet|single[-\s]?arm|one[-\s]?arm/i.test(e.nameEn)) {
        expect(e.perImplement, e.id).toBeFalsy()
      }
    }
  })
  it('flags at least some dumbbell movements', () => {
    expect(all.some((e) => e.perImplement)).toBe(true)
  })
})
