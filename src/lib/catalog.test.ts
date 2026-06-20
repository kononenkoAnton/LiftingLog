import { describe, it, expect } from 'vitest'
import { searchCatalog, filterCatalog, groupAlphabetical, normalizeForSearch, makeUsageResolver, groupByUsage } from './catalog'
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
  it('returns everything when no filter is given', () => {
    expect(filterCatalog(FX, {}).length).toBe(3)
  })
})

describe('groupAlphabetical', () => {
  it('groups English names by first letter, sorted', () => {
    expect(groupAlphabetical(FX, 'en').map(g => g.letter)).toEqual(['B', 'L', 'S'])
  })
  it('groups Russian names with Cyrillic letters', () => {
    expect(groupAlphabetical(FX, 'ru').map(g => g.letter)).toEqual(['Ж', 'П'])
  })
  it('returns an empty array for an empty list', () => {
    expect(groupAlphabetical([], 'en')).toEqual([])
  })
})

describe('makeUsageResolver', () => {
  const resolve = makeUsageResolver(FX)
  it('matches an exact catalog id (picker-added lift)', () => {
    expect(resolve({ exerciseRef: 'leg-press', nameEn: 'whatever', nameRu: 'нечто' })).toBe('leg-press')
  })
  it('falls back to the English name for a coach ref', () => {
    expect(resolve({ exerciseRef: 'coach:bench', nameEn: 'Bench Press (Barbell)', nameRu: '' })).toBe('bench-press-barbell')
  })
  it('falls back to the Russian name', () => {
    expect(resolve({ exerciseRef: 'coach:bench', nameEn: 'no-match', nameRu: 'Жим лёжа' })).toBe('bench-press-barbell')
  })
  it('matches across the ё/е spelling drift', () => {
    expect(resolve({ exerciseRef: 'coach:bench', nameEn: 'no-match', nameRu: 'жим лежа' })).toBe('bench-press-barbell')
  })
  it('matches an alias', () => {
    expect(resolve({ exerciseRef: 'coach:sq', nameEn: 'back squat', nameRu: '' })).toBe('squat-barbell')
  })
  it('returns null on no match', () => {
    expect(resolve({ exerciseRef: 'coach:unknown', nameEn: 'Nordic Curl', nameRu: '' })).toBeNull()
  })
  it('first catalog entry wins on a duplicate normalized name', () => {
    const dup: CatalogExercise[] = [
      { id: 'curl-a', nameEn: 'Curl', nameRu: 'Сгибание', ruIsFallback: false, equipment: 'dumbbell', bodyPart: 'Arms', aliasesEn: [], aliasesRu: [], defaultRestSec: 60 },
      { id: 'curl-b', nameEn: 'Curl', nameRu: 'Сгибание', ruIsFallback: false, equipment: 'cable', bodyPart: 'Arms', aliasesEn: [], aliasesRu: [], defaultRestSec: 60 },
    ]
    expect(makeUsageResolver(dup)({ exerciseRef: 'coach:curl', nameEn: 'Curl', nameRu: '' })).toBe('curl-a')
  })
})

describe('groupByUsage', () => {
  it('returns no frequent and everything in A–Z when usage is empty', () => {
    const { frequent, groups } = groupByUsage(FX, 'en', {})
    expect(frequent).toEqual([])
    expect(groups.map((g) => g.letter)).toEqual(['B', 'L', 'S'])
  })
  it('pins used items to frequent and removes them from A–Z (dedup)', () => {
    const usage = { 'bench-press-barbell': { count: 3, lastUsedAt: '2026-06-10T00:00:00.000Z' } }
    const { frequent, groups } = groupByUsage(FX, 'en', usage)
    expect(frequent.map((e) => e.id)).toEqual(['bench-press-barbell'])
    expect(groups.flatMap((g) => g.items.map((e) => e.id))).not.toContain('bench-press-barbell')
    expect(groups.map((g) => g.letter)).toEqual(['L', 'S']) // B is gone
  })
  it('sorts frequent by count desc, then most-recent, then name', () => {
    const usage = {
      'squat-barbell': { count: 5, lastUsedAt: '2026-06-01T00:00:00.000Z' },
      'bench-press-barbell': { count: 5, lastUsedAt: '2026-06-20T00:00:00.000Z' }, // same count, newer
      'leg-press': { count: 2, lastUsedAt: '2026-06-20T00:00:00.000Z' },
    }
    const { frequent } = groupByUsage(FX, 'en', usage)
    expect(frequent.map((e) => e.id)).toEqual(['bench-press-barbell', 'squat-barbell', 'leg-press'])
  })
})
