import type { Equipment } from './types'

/** One entry in the bilingual exercise catalog (src/data/exercises.json). */
export interface CatalogExercise {
  id: string             // stable slug, e.g. "squat-barbell"
  nameEn: string
  nameRu: string         // = nameEn when wger has no RU translation
  ruIsFallback: boolean  // true when nameRu was filled from nameEn
  equipment: Equipment
  bodyPart: string       // wger category name: "Legs", "Chest", "Back", …
  aliasesEn: string[]
  aliasesRu: string[]
  defaultRestSec: number
  thumb?: string
}
