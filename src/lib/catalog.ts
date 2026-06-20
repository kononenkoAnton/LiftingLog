// Pure search/filter/group over the bilingual exercise catalog. No DOM here —
// the picker component (exercise-picker.ts) renders on top of these.
//
// Cyrillic gotcha: JS \w/\b do NOT match Cyrillic. We avoid regex word classes
// entirely and use toLowerCase() (which lowercases Cyrillic) + substring match.
import catalog from '../data/exercises.json'
import type { CatalogExercise } from '../data/catalog-types'
import type { Equipment } from '../data/types'

export type { CatalogExercise }

export function loadCatalog(): CatalogExercise[] {
  return catalog as CatalogExercise[]
}

/**
 * Lowercase, fold Russian ё→е (common spelling drift), trim.
 * toLowerCase() runs first, so an uppercase Ё becomes ё then е — both cases covered.
 */
export function normalizeForSearch(s: string): string {
  return s.toLowerCase().replace(/ё/g, 'е').trim()
}

export function searchCatalog(all: CatalogExercise[], query: string): CatalogExercise[] {
  const q = normalizeForSearch(query)
  if (!q) return all
  return all.filter((e) =>
    [e.nameEn, e.nameRu, ...e.aliasesEn, ...e.aliasesRu]
      .some((s) => normalizeForSearch(s).includes(q)),
  )
}

export interface CatalogFilter { equipment?: Equipment; bodyPart?: string }

export function filterCatalog(all: CatalogExercise[], f: CatalogFilter): CatalogExercise[] {
  return all.filter((e) =>
    (!f.equipment || e.equipment === f.equipment) &&
    (!f.bodyPart || e.bodyPart === f.bodyPart),
  )
}

export interface AlphaGroup { letter: string; items: CatalogExercise[] }

/** Sort by the active-language name and bucket by its first letter. */
export function groupAlphabetical(list: CatalogExercise[], lang: 'en' | 'ru'): AlphaGroup[] {
  const nameOf = (e: CatalogExercise) => (lang === 'ru' ? e.nameRu : e.nameEn)
  const locale = lang === 'ru' ? 'ru' : 'en'
  const sorted = [...list].sort((a, b) => nameOf(a).localeCompare(nameOf(b), locale))
  const groups: AlphaGroup[] = []
  for (const e of sorted) {
    const letter = nameOf(e).charAt(0).toUpperCase()
    const last = groups[groups.length - 1]
    if (!last || last.letter !== letter) groups.push({ letter, items: [e] })
    else last.items.push(e)
  }
  return groups
}

/**
 * Build a resolver mapping a logged exercise → the catalog id it belongs to (or null).
 * Tries exact `exerciseRef` (picker-added lifts store the catalog id), then a normalized
 * name match on nameEn, then nameRu, across every name + alias — so coach-prescribed lifts
 * (which use a `coach:<slug>` ref, not a catalog id) still resolve. First catalog entry
 * wins on a duplicate normalized name. Structural param keeps this decoupled from the
 * logger types.
 */
export function makeUsageResolver(
  catalog: CatalogExercise[],
): (we: { exerciseRef: string; nameEn: string; nameRu: string }) => string | null {
  const ids = new Set(catalog.map((e) => e.id))
  const byName = new Map<string, string>()
  for (const e of catalog) {
    for (const n of [e.nameEn, e.nameRu, ...e.aliasesEn, ...e.aliasesRu]) {
      const key = normalizeForSearch(n)
      if (key && !byName.has(key)) byName.set(key, e.id)
    }
  }
  return (we) => {
    if (ids.has(we.exerciseRef)) return we.exerciseRef
    return byName.get(normalizeForSearch(we.nameEn))
      ?? byName.get(normalizeForSearch(we.nameRu))
      ?? null
  }
}
