#!/usr/bin/env node
// Parse the trainer's Google Doc (markdown export) into src/data/program.json.
//
// Usage:
//   node scripts/parse-program.mjs            # fetch the doc and write program.json
//   node scripts/parse-program.mjs --file x.md  # parse a local markdown file
//   node scripts/parse-program.mjs --stdout   # print JSON instead of writing
//
// Design: deterministic. Equipment/naming, weights, sets/reps, and notes are
// derived from rules below. Anything the rules can't confidently resolve is
// emitted to stderr as a WARN line (with session/exercise) for a human or a
// cheap model to fix using references/parsing-rules.md. Cheap because the happy
// path needs no model at all.

import { writeFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const DOC_URL =
  'https://docs.google.com/document/d/1b5RGwxGWkxLRidCiblM07hcqnTFrgxQrkpkXyMuN81E/export?format=md'

const __dir = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dir, '..', 'src', 'data', 'program.json')
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const warnings = []
const warn = (num, msg) => warnings.push(`WARN session ${num}: ${msg}`)

// ── Exercise glossary: ordered, first match wins. More specific patterns first.
// eq = equipment; per = perImplement (two dumbbells, weight is per-dumbbell).
const GLOSSARY = [
  { re: /жим\s+гантел[а-яё]*\s+(?:лежа|лёжа)/i, en: 'DB Bench Press', eq: 'dumbbell', per: true },
  { re: /жим\s+гантел[а-яё]*\s+сидя/i, en: 'Seated DB Press', eq: 'dumbbell', per: true },
  { re: /французск[а-яё]*\s+жим\s+(?:лежа|лёжа)/i, en: 'Lying Triceps Extension (Skullcrusher)', eq: 'barbell' },
  { re: /французск[а-яё]*\s+жим\s+стоя/i, en: 'Overhead DB Triceps Extension', eq: 'dumbbell' },
  { re: /жим\s+штанги\s+стоя/i, en: 'Overhead Press', eq: 'barbell' },
  { re: /жим\s+(?:штанги\s+)?(?:лежа|лёжа)/i, en: 'Bench Press', eq: 'barbell' },
  { re: /румынск[а-яё]*\s+тяга/i, en: 'Romanian Deadlift (RDL)', eq: 'barbell' },
  { re: /(?:становая\s+тяга|тяга\s+становая)/i, en: 'Deadlift', eq: 'barbell' },
  { re: /присед[а-яё]*/i, en: 'Squat', eq: 'barbell' },
  { re: /(?:наклон[а-яё]*\s+со\s+штангой|доброе\s+утро)/i, en: 'Good Morning', eq: 'barbell' },
  { re: /выпад[а-яё]*/i, en: 'Barbell Lunges', eq: 'barbell' },
  { re: /жим\s+ногами/i, en: 'Leg Press', eq: 'machine' },
  { re: /разгибание\s+ног/i, en: 'Leg Extension', eq: 'machine' },
  { re: /шраги/i, en: 'DB Shrugs', eq: 'dumbbell', per: true },
  { re: /махи\s+гантел/i, en: 'DB Lateral Raise', eq: 'dumbbell', per: true },
  { re: /разводка\s+гантел/i, en: 'DB Fly', eq: 'dumbbell', per: true },
  { re: /разгибание\s+на\s+трицепс\s+в\s+блоке/i, en: 'Cable Triceps Pushdown', eq: 'cable' },
  { re: /разгибание\s+на\s+трицепс\s+в\s+тренажере/i, en: 'Machine Triceps Extension', eq: 'machine' },
  { re: /тяга\s+гантел[а-яё]*\s+к\s+поясу/i, en: 'DB Row', eq: 'dumbbell' },
  { re: /тяга\s+штанги[\s/а-яё]*к\s+поясу/i, en: 'Barbell Row', eq: 'barbell' },
  { re: /тяга\s+горизонтального\s+блока/i, en: 'Seated Cable Row', eq: 'cable' },
  { re: /тяга\s+верхнего\s+блока/i, en: 'Lat Pulldown', eq: 'cable' },
  { re: /подтягивани[а-яё]*/i, en: 'Pull-ups', eq: 'bodyweight' },
  { re: /брусья/i, en: 'Dips', eq: 'bodyweight' },
  { re: /отжимани[а-яё]*/i, en: 'Push-ups', eq: 'bodyweight' },
  { re: /гиперэкстензи[а-яё]*/i, en: 'Hyperextension', eq: 'bodyweight' },
  { re: /(?:пресс\s+)?скручивани[а-яё]*/i, en: 'Crunches', eq: 'bodyweight' },
  { re: /планка/i, en: 'Plank', eq: 'bodyweight' },
  { re: /подъ[её]м\s+ног/i, en: 'Hanging Leg Raise', eq: 'bodyweight' },
]

// ── Normalisation: strip markdown escapes, image refs, separators.
function normalize(md) {
  return md
    .replace(/\r/g, '')
    .replace(/^\[[^\]]+\]:.*$/gm, '') // link reference definitions, incl. base64 images: "[image1]: <data:...>"
    .replace(/!\[\]?\[[^\]]*\]/g, ' ') // inline image refs ![][image1]
    .replace(/<?data:[^\s)>]+>?/gi, '') // any stray data: URIs (e.g. base64 blobs)
    .replace(/\\([_()\-.])/g, '$1') // unescape \) \_ \( \- \.
    .replace(/_{4,}/g, '\n') // ____ separators -> line break
}

// ── Split into sessions by the **DD/MM/YYYY №N** header (first date if a range).
function splitSessions(md) {
  const re = /\*\*\s*(\d{1,2})(?:\s*-\s*\d{1,2})?\/(\d{1,2})\/0?(\d{4})\s*№\s*(\d+)\s*\*\*/g
  const heads = [...md.matchAll(re)]
  return heads.map((h, i) => {
    const [, dd, mm, yyyy, num] = h
    const body = md.slice(h.index + h[0].length, i + 1 < heads.length ? heads[i + 1].index : undefined)
    const d = Number(dd), m = Number(mm)
    return {
      num: Number(num),
      date: `${yyyy}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
      dateLabel: `${d} ${MONTHS[m - 1]}`,
      body,
    }
  })
}

// ── Split a session body into raw exercise chunks keyed by their list number.
function splitExercises(body) {
  const re = /(?:^|\n)\s*(\d+)\)\s*/g
  const starts = [...body.matchAll(re)]
  return starts.map((s, i) => ({
    raw: body
      .slice(s.index + s[0].length, i + 1 < starts.length ? starts[i + 1].index : undefined)
      .replace(/\s+/g, ' ')
      .trim(),
  }))
}

const NUM = '\\d+(?:[.,]\\d+)?'

// ── Weight ----------------------------------------------------------------
function parseWeight(raw, eq, num) {
  // perSet: "120/3, 135/3, 145/2" (weights >= 2 digits, comma-separated).
  const perSet = raw.match(new RegExp(`(\\d{2,3}\\s*/\\s*\\d+(?:\\s*,\\s*\\d{2,3}\\s*/\\s*\\d+)+)`))
  if (perSet) {
    const steps = [...perSet[1].matchAll(/(\d{2,3})\s*\/\s*(\d+)/g)].map((m) => ({
      kg: Number(m[1]), reps: Number(m[2]),
    }))
    return { kind: 'perSet', steps }
  }

  // kg numbers: "75 кг", "75-85 кг", "105-120-130", "по 25-28 кг"
  const kgTok = raw.match(new RegExp(`(${NUM}(?:\\s*[-–]\\s*${NUM})*)\\s*кг`, 'i'))
  // progression written without кг but with 2+ dashes, e.g. "130-140-130 по 3"
  const progTok = kgTok || raw.match(/\b(\d{2,3}(?:\s*-\s*\d{2,3}){2,})\b/)
  if (progTok) {
    const nums = progTok[1].split(/\s*[-–]\s*/).map((n) => Number(n.replace(',', '.')))
    if (nums.length === 1) return { kind: 'single', kg: nums[0] }
    if (nums.length === 2) return { kind: 'range', minKg: nums[0], maxKg: nums[1] }
    return { kind: 'progression', kg: nums }
  }

  // qualitative
  if (/тяж[её]л|как\s+можно\s+больше/i.test(raw)) return { kind: 'qualitative', level: 'heavy' }
  if (/средн/i.test(raw)) return { kind: 'qualitative', level: 'medium' }
  if (/л[её]гк/i.test(raw)) return { kind: 'qualitative', level: 'light' }

  if (eq === 'bodyweight') return { kind: 'bodyweight' }
  // Bare weight with no "кг" written, e.g. "110 по 3/6". A 2–3 digit number in a
  // plausible barbell range, not a rep/set count.
  const bare = (raw.match(/\d{2,3}/g) || []).map(Number).find((n) => n >= 40 && n <= 300)
  if (bare) return { kind: 'single', kg: bare }
  warn(num, `no weight parsed in: "${raw.slice(0, 60)}"`)
  return { kind: 'qualitative', level: 'medium' }
}

// ── Sets / reps -----------------------------------------------------------
function parseSetsReps(raw, eq) {
  // duration (plank): "3/40 секунд", "по 45 секунд", "2/70-80 сек"
  const dur = raw.match(/(\d+)\s*(?:подход[а-яё]*\s*)?(?:по|\/)\s*(\d+(?:\s*[-–]\s*\d+)?)\s*сек/i)
  if (dur) return { sets: Number(dur[1]), reps: dur[2].replace(/\s/g, '') + 's' }
  if (eq === 'bodyweight' && /сек/i.test(raw)) {
    const d = raw.match(/(\d+(?:\s*[-–]\s*\d+)?)\s*сек/i)
    if (d) return { sets: null, reps: d[1].replace(/\s/g, '') + 's' }
  }
  // "4 подхода/3 повторения", "3 подхода по 6 повторений"
  const verbose = raw.match(/(\d+)\s*подход[а-яё]*\s*(?:по|\/)\s*(\d+(?:\s*[-–]\s*\d+)?)/i)
  if (verbose) return { sets: Number(verbose[1]), reps: verbose[2].replace(/\s/g, '') }
  // compact "3/4", "3/15-20" (sets <= 8)
  const compact = raw.match(/\b([1-8])\s*\/\s*(\d+(?:\s*[-–]\s*\d+)?)\b/)
  if (compact) return { sets: Number(compact[1]), reps: compact[2].replace(/\s/g, '') }
  // "по 15 повторений" (reps only)
  const repsOnly = raw.match(/по\s*(\d+(?:\s*[-–]\s*\d+)?)\s*повтор/i)
  if (repsOnly) return { sets: null, reps: repsOnly[1].replace(/\s/g, '') }
  return { sets: null, reps: '' }
}

// ── Name modifiers (lightweight, improves nameEn for key lifts) -----------
function refineName(base, raw) {
  let name = base
  if (base === 'Deadlift') {
    if (/(плинт|подставок)/i.test(raw)) name = 'Block Deadlift'
    else if (/с\s+ямы/i.test(raw)) name = 'Deficit Deadlift'
    else name = 'Conventional Deadlift'
  }
  if (base === 'Bench Press' && /средн[а-яё]*\s+хват/i.test(raw)) name = 'Bench Press (medium grip)'
  if (base === 'DB Bench Press' && /(под\s+углом|угол)/i.test(raw)) name = 'Incline DB Bench Press'
  if (base === 'Squat' && /наколенник/i.test(raw)) name = 'Squat (knee sleeves)'
  if (base === 'Squat' && /паузой|пауза/i.test(raw)) name = 'Squat, paused'
  return name
}

// ── Build exercise(s) from one raw chunk. A "потом/затем" bundle is split into
// separate exercises; verify these (the tail can be a back-off set, not a new lift).
function buildExercise(raw, num) {
  const parts = raw.split(/\s+(?:потом|затем)\s+/i).map((p) => p.trim()).filter(Boolean)
  // Only a true bundle if every "потом/затем" tail is itself a known exercise —
  // otherwise it's a finisher/back-off of the same movement (keep as one).
  const realBundle = parts.length > 1 && parts.slice(1).every((p) => GLOSSARY.some((x) => x.re.test(p)))
  if (realBundle) {
    warn(num, `bundle split — verify: "${raw.slice(0, 80)}"`)
    return parts.flatMap((p) => buildOne(p, num, false))
  }
  return buildOne(raw, num, false)
}

function buildOne(raw, num, isBundleTail) {
  const g = GLOSSARY.find((x) => x.re.test(raw))
  if (!g) {
    if (isBundleTail) { warn(num, `dropped unclassified bundle tail (back-off?): "${raw.slice(0, 50)}"`); return [] }
    warn(num, `unknown exercise: "${raw.slice(0, 70)}"`)
    return [{
      order: 0, nameEn: 'UNKNOWN', nameRu: raw, descEn: '', descRu: raw,
      equipment: 'barbell', weight: { kind: 'qualitative', level: 'medium' }, sets: null, reps: '',
    }]
  }
  const nameEn = refineName(g.en, raw)
  const nameRu = raw.replace(/[,.].*$/, '').trim() // first clause as the RU name
  const weight = parseWeight(raw, g.eq, num)
  const { sets, reps } = parseSetsReps(raw, g.eq)
  const ex = {
    order: 0,
    nameEn,
    nameRu: cap(nameRu),
    descEn: nameEn + '.', // deterministic placeholder — see parsing-rules.md for optional polish
    descRu: cap(raw.replace(/\s+/g, ' ').trim()),
    equipment: g.eq,
    ...(g.per ? { perImplement: true } : {}),
    weight,
    sets,
    reps,
  }
  return [ex]
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

// ── Main ------------------------------------------------------------------
async function getMarkdown() {
  const fileArg = process.argv.indexOf('--file')
  if (fileArg !== -1) return readFileSync(process.argv[fileArg + 1], 'utf8')
  const res = await fetch(DOC_URL)
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`)
  return res.text()
}

function readExisting() {
  try { return JSON.parse(readFileSync(OUT, 'utf8')) } catch { return null }
}

async function main() {
  const full = process.argv.includes('--full')
  const md = normalize(await getMarkdown())
  const parsed = splitSessions(md).map((s) => {
    const exercises = splitExercises(s.body)
      .flatMap((c) => buildExercise(c.raw, s.num))
      .map((ex, i) => ({ ...ex, order: i + 1 }))
    return { num: s.num, date: s.date, dateLabel: s.dateLabel, focus: '', exercises }
  })
  if (parsed.length === 0) throw new Error('no sessions parsed — markdown format changed?')

  // Incremental (default): keep existing sessions verbatim (preserves any
  // hand-authored descriptions), append only sessions with a new num.
  // --full: regenerate everything from the Doc.
  const existing = full ? null : readExisting()
  let sessions, kept = 0, appended = 0
  if (existing && Array.isArray(existing.sessions)) {
    const byNum = new Map(existing.sessions.map((s) => [s.num, s]))
    kept = byNum.size
    for (const s of parsed) if (!byNum.has(s.num)) { byNum.set(s.num, s); appended++ }
    sessions = [...byNum.values()].sort((a, b) => a.num - b.num)
  } else {
    sessions = parsed.sort((a, b) => a.num - b.num)
    appended = sessions.length
  }

  sessions.forEach((s, i) => { if (s.num !== i + 1) warn(s.num, `numbering gap (index ${i + 1})`) })

  const program = { title: existing?.title || 'The Block', sessions }
  const json = JSON.stringify(program, null, 2) + '\n'

  if (process.argv.includes('--stdout')) process.stdout.write(json)
  else {
    writeFileSync(OUT, json)
    const mode = full ? 'full rebuild' : `incremental: kept ${kept}, appended ${appended}`
    console.error(`wrote ${OUT} (${sessions.length} sessions; ${mode})`)
  }

  if (warnings.length) {
    console.error(`\n${warnings.length} warning(s) — review these:`)
    for (const w of warnings) console.error('  ' + w)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
