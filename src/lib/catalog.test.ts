import { describe, it, expect } from 'vitest'
import { searchCatalog, filterCatalog, groupAlphabetical, normalizeForSearch } from './catalog'
import type { CatalogExercise } from '../data/catalog-types'

const FX: CatalogExercise[] = [
  { id: 'squat-barbell', nameEn: 'Squat (Barbell)', nameRu: 'Приседания со штангой', ruIsFallback: false, equipment: 'barbell', bodyPart: 'Legs', aliasesEn: ['back squat'], aliasesRu: ['присед'], defaultRestSec: 90 },
  { id: 'bench-press-barbell', nameEn: 'Bench Press (Barbell)', nameRu: 'Жим лёжа', ruIsFallback: false, equipment: 'barbell', bodyPart: 'Chest', aliasesEn: [], aliasesRu: [], defaultRestSec: 150 },
  { id: 'leg-press', nameEn: 'Leg Press', nameRu: 'Жим ногами', ruIsFallback: false, equipment: 'machine', bodyPart: 'Legs', aliasesEn: [], aliasesRu: [], defaultRestSec: 90 },
]

describe('normalizeForSearch', () => {
  it('lowercases and folds ё→е', () => {
    expect(normalizeForSearch('Жим Лёжа')).toBe('жим лежа')
  })
})

describe('searchCatalog', () => {
  it('matches English name (case-insensitive)', () => {
    expect(searchCatalog(FX, 'BENCH').map(e => e.id)).toEqual(['bench-press-barbell'])
  })
  it('matches Russian name', () => {
    expect(searchCatalog(FX, 'присед').map(e => e.id)).toEqual(['squat-barbell'])
  })
  it('matches across the ё/е spelling', () => {
    expect(searchCatalog(FX, 'жим лежа').map(e => e.id)).toEqual(['bench-press-barbell'])
  })
  it('matches an English alias', () => {
    expect(searchCatalog(FX, 'back squat').map(e => e.id)).toEqual(['squat-barbell'])
  })
  it('empty query returns everything', () => {
    expect(searchCatalog(FX, '   ').length).toBe(3)
  })
})

describe('filterCatalog', () => {
  it('filters by equipment', () => {
    expect(filterCatalog(FX, { equipment: 'machine' }).map(e => e.id)).toEqual(['leg-press'])
  })
  it('filters by body part', () => {
    expect(filterCatalog(FX, { bodyPart: 'Legs' }).map(e => e.id)).toEqual(['squat-barbell', 'leg-press'])
  })
  it('combines filters', () => {
    expect(filterCatalog(FX, { bodyPart: 'Legs', equipment: 'barbell' }).map(e => e.id)).toEqual(['squat-barbell'])
  })
})

describe('groupAlphabetical', () => {
  it('groups English names by first letter, sorted', () => {
    expect(groupAlphabetical(FX, 'en').map(g => g.letter)).toEqual(['B', 'L', 'S'])
  })
  it('groups Russian names with Cyrillic letters', () => {
    expect(groupAlphabetical(FX, 'ru').map(g => g.letter)).toEqual(['Ж', 'П'])
  })
})
