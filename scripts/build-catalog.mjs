#!/usr/bin/env node
// Build src/data/exercises.json from the wger open exercise DB.
// Data © wger.de contributors, licensed CC-BY-SA 4.0 (https://wger.de).
// Usage: node scripts/build-catalog.mjs   (npm run build:catalog)
import { writeFileSync, readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src/data/exercises.json')
const EXTRAS = join(ROOT, 'scripts/catalog-extras.json')
const EN = 2, RU = 5
const API = 'https://wger.de/api/v2/exerciseinfo/?format=json&limit=100'

// wger equipment name → our Equipment enum. Unmapped/"none" → bodyweight.
const EQUIP = {
  'Barbell': 'barbell', 'SZ-Bar': 'barbell',
  'Dumbbell': 'dumbbell', 'Kettlebell': 'dumbbell',
  'Cable': 'cable',
  'Machine (weights)': 'machine', 'Machine': 'machine',
}
// Classify into our Equipment enum. The exercise NAME is the strongest signal
// (wger has no machine/cable concept), then wger's equipment field, else bodyweight.
function classifyEquip(nameEn, wgerNames) {
  const n = nameEn.toLowerCase()
  // 'hack ' keeps the trailing space so it matches "Hack Squat" but not unrelated words.
  if (n.includes('smith') || n.includes('machine') || n.includes('hack ')) return 'machine'
  if (n.includes('cable') || n.includes('pulldown') || n.includes('pull down') || n.includes('pushdown') || n.includes('push down')) return 'cable'
  if (n.includes('barbell') || n.includes('ez-bar') || n.includes('ez bar') || n.includes('sz-bar')) return 'barbell'
  if (n.includes('dumbbell') || n.includes('kettlebell')) return 'dumbbell'
  const fromWger = wgerNames.map((w) => EQUIP[w]).find(Boolean)
  return fromWger || 'bodyweight'
}
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const aliasList = (arr) => (arr || []).map((a) => a.alias || a).filter((s) => typeof s === 'string')

function restFor(nameEn, equip) {
  const n = nameEn.toLowerCase()
  if (n.includes('squat')) return 90
  if (n.includes('bench')) return 150
  if (n.includes('deadlift')) return equip === 'barbell' ? 300 : 90
  return equip === 'barbell' ? 180 : 90
}

async function fetchAll() {
  const out = []
  let url = API
  while (url) {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`wger ${r.status} for ${url}`)
    const j = await r.json()
    out.push(...j.results)
    url = j.next
    process.stdout.write(`\rfetched ${out.length}/${j.count}`)
  }
  process.stdout.write('\n')
  return out
}

function build(raw) {
  const seen = new Set()
  const items = []
  const ruFallback = []
  for (const ex of raw) {
    const en = ex.translations?.find((t) => t.language === EN && t.name)
    if (!en) continue
    const id = slug(en.name)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const equip = classifyEquip(en.name, (ex.equipment || []).map((e) => e.name))
    const ru = ex.translations.find((t) => t.language === RU && t.name)
    if (!ru) ruFallback.push(id)
    items.push({
      id,
      nameEn: en.name.trim(),
      nameRu: (ru ? ru.name : en.name).trim(),
      ruIsFallback: !ru,
      equipment: equip,
      bodyPart: ex.category?.name || 'Other',
      aliasesEn: aliasList(en.aliases),
      aliasesRu: aliasList(ru?.aliases),
      defaultRestSec: restFor(en.name, equip),
    })
  }
  return { items, ruFallback }
}

const raw = await fetchAll()
let { items, ruFallback } = build(raw)

if (existsSync(EXTRAS)) {
  const extras = JSON.parse(readFileSync(EXTRAS, 'utf8'))
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const e of extras) {
    if (!e.id) throw new Error(`catalog-extras.json: entry missing 'id': ${JSON.stringify(e)}`)
    byId.set(e.id, e)
  }
  items = [...byId.values()]
}

items.sort((a, b) => a.nameEn.localeCompare(b.nameEn, 'en'))
writeFileSync(OUT, JSON.stringify(items, null, 2) + '\n')
console.log(`wrote ${items.length} exercises → src/data/exercises.json`)
console.log(`RU fallback (nameRu = nameEn): ${ruFallback.length}`)
if (ruFallback.length) console.log('  e.g.:', ruFallback.slice(0, 30).join(', '))
