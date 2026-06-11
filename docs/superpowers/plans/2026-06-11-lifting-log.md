# LiftingLog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a mobile-first, award-grade static web app that renders a trainer's 55-session strength program with bilingual (EN/RU) exercise info, kg→lb conversion, and exact per-side barbell plate loading.

**Architecture:** Vite + TypeScript vanilla SPA. A pure, unit-tested `load.ts` computes pounds and plate breakdowns at runtime from kg targets. A generated `program.json` holds the parsed/translated program. GSAP drives transitions; three.js renders the barbell hero (with SVG fallback). No backend.

**Tech Stack:** Vite, TypeScript, Vitest, GSAP, three.js. Deployable to any static host.

---

## File Structure

- `index.html` — app shell, root mount, fonts.
- `src/main.ts` — bootstrap + router wiring.
- `src/router.ts` — hash router (`#/`, `#/session/:n`).
- `src/lib/load.ts` — kg→lb + barbell plate math (pure, tested).
- `src/lib/focus.ts` — derive a session focus label from exercises (pure, tested).
- `src/data/types.ts` — shared TypeScript types.
- `src/data/program.json` — the 55-session dataset.
- `src/data/program.ts` — typed loader + lookups.
- `src/screens/list.ts` — program list screen.
- `src/screens/session.ts` — session detail screen.
- `src/components/barbell.ts` — three.js barbell hero.
- `src/components/barbell-svg.ts` — SVG fallback.
- `src/styles/theme.css` — Reactor design tokens.
- `src/styles/app.css` — layout/components.
- `README.md` — run/build/deploy + re-parse step.

---

## Task 1: Scaffold project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `.gitignore` (exists — extend)

- [ ] **Step 1: Create Vite project files**

`package.json`:
```json
{
  "name": "liftinglog",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "gsap": "^3.12.5",
    "three": "^0.160.0"
  },
  "devDependencies": {
    "@types/three": "^0.160.0",
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "types": ["vitest/globals"]
  },
  "include": ["src"]
}
```

`vite.config.ts`:
```ts
import { defineConfig } from 'vite'
export default defineConfig({
  base: './',
  test: { globals: true, environment: 'node' },
})
```

`index.html`:
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>LiftingLog</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700;800&family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet" />
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.ts"></script>
</body>
</html>
```

`src/main.ts` (placeholder, replaced in Task 8):
```ts
document.querySelector('#app')!.textContent = 'LiftingLog'
```

- [ ] **Step 2: Install and verify dev server boots**

Run: `npm install && npm run dev`
Expected: Vite serves on localhost; page shows "LiftingLog". Stop the server.

- [ ] **Step 3: Verify test runner works**

Run: `npm run test`
Expected: Vitest runs with "no test files found" (exit 0 or 1 with clear message) — confirms wiring.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: scaffold Vite + TS + Vitest project"
```

---

## Task 2: Plate math — kg→lb and rounding (TDD)

**Files:**
- Create: `src/lib/load.ts`, `src/lib/load.test.ts`

- [ ] **Step 1: Write failing tests for conversion + rounding**

`src/lib/load.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test`
Expected: FAIL — `kgToLb`/`roundUpToStep` not exported.

- [ ] **Step 3: Implement**

`src/lib/load.ts`:
```ts
export const KG_TO_LB = 2.20462
export const BAR_LB = 45
export const PLATES_LB = [45, 35, 25, 10, 5, 2.5]

export function kgToLb(kg: number): number {
  return kg * KG_TO_LB
}

export function roundUpToStep(value: number, step: number): number {
  return Math.ceil(value / step - 1e-9) * step
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/load.ts src/lib/load.test.ts
git commit -m "feat: add kg->lb conversion and round-up helper"
```

---

## Task 3: Barbell load computation (TDD)

**Files:**
- Modify: `src/lib/load.ts`, `src/lib/load.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `src/lib/load.test.ts`:
```ts
import { computeBarbellLoad } from './load'

describe('computeBarbellLoad', () => {
  it('rounds total up and breaks plates per side (75kg)', () => {
    const r = computeBarbellLoad(75)
    expect(r.totalLb).toBe(170)
    expect(r.perSideLb).toBe(62.5)
    expect(r.plates).toEqual([
      { plate: 45, count: 1 },
      { plate: 10, count: 1 },
      { plate: 5, count: 1 },
      { plate: 2.5, count: 1 },
    ])
  })

  it('returns an empty bar when target is at/below bar weight (20kg)', () => {
    const r = computeBarbellLoad(20) // ~44.09 lb -> 45 total
    expect(r.totalLb).toBe(45)
    expect(r.perSideLb).toBe(0)
    expect(r.plates).toEqual([])
  })

  it('handles a clean mid load (60kg)', () => {
    const r = computeBarbellLoad(60) // ~132.28 -> 135 total -> 45/side
    expect(r.totalLb).toBe(135)
    expect(r.perSideLb).toBe(45)
    expect(r.plates).toEqual([{ plate: 45, count: 1 }])
  })

  it('always rounds up, never under target (120kg)', () => {
    const r = computeBarbellLoad(120) // 264.55 -> 265 total
    expect(r.totalLb).toBe(265)
    expect(r.totalLb).toBeGreaterThanOrEqual(kgToLb(120))
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test`
Expected: FAIL — `computeBarbellLoad` not defined.

- [ ] **Step 3: Implement**

Append to `src/lib/load.ts`:
```ts
export interface PlateStack {
  plate: number
  count: number
}

export interface BarbellLoad {
  targetLb: number
  totalLb: number
  perSideLb: number
  plates: PlateStack[]
}

function decompose(perSide: number): PlateStack[] {
  const out: PlateStack[] = []
  let rem = perSide
  for (const p of PLATES_LB) {
    const count = Math.floor(rem / p + 1e-9)
    if (count > 0) {
      out.push({ plate: p, count })
      rem -= count * p
    }
  }
  return out
}

export function computeBarbellLoad(kg: number): BarbellLoad {
  const targetLb = kgToLb(kg)
  const totalLb = Math.max(BAR_LB, roundUpToStep(targetLb, 5))
  const perSideLb = (totalLb - BAR_LB) / 2
  return { targetLb, totalLb, perSideLb, plates: decompose(perSideLb) }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test`
Expected: PASS (all load tests green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/load.ts src/lib/load.test.ts
git commit -m "feat: compute per-side barbell plate loading (round up)"
```

---

## Task 4: Shared types

**Files:**
- Create: `src/data/types.ts`

- [ ] **Step 1: Define types**

`src/data/types.ts`:
```ts
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight'

export type Weight =
  | { kind: 'single'; kg: number }
  | { kind: 'range'; minKg: number; maxKg: number }
  | { kind: 'progression'; kg: number[] }
  | { kind: 'perSet'; steps: { kg: number; reps: number }[] }
  | { kind: 'qualitative'; level: 'light' | 'medium' | 'heavy' }
  | { kind: 'bodyweight' }

export interface Exercise {
  order: number
  nameEn: string
  nameRu: string
  descEn: string
  descRu: string
  equipment: Equipment
  perImplement?: boolean
  weight: Weight
  sets: number | null
  reps: string
  notesEn?: string
  notesRu?: string
}

export interface Session {
  num: number
  date: string       // ISO yyyy-mm-dd
  dateLabel: string  // "21 Jan"
  focus: string
  exercises: Exercise[]
}

export interface Program {
  title: string
  sessions: Session[]
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/data/types.ts && git commit -m "feat: add program data types"
```

---

## Task 5: Focus label derivation (TDD)

**Files:**
- Create: `src/lib/focus.ts`, `src/lib/focus.test.ts`

- [ ] **Step 1: Write failing test**

`src/lib/focus.test.ts`:
```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test`
Expected: FAIL — `deriveFocus` not defined.

- [ ] **Step 3: Implement**

`src/lib/focus.ts`:
```ts
import type { Exercise } from '../data/types'

const PRIMARY: { match: RegExp; label: string }[] = [
  { match: /bench/i, label: 'Bench' },
  { match: /deadlift/i, label: 'Deadlift' },
  { match: /squat/i, label: 'Squat' },
  { match: /good\s?morning|romanian|rdl|hinge/i, label: 'Hinge' },
  { match: /overhead|standing press|ohp/i, label: 'Press' },
  { match: /row|pulldown|pull-?up|chin/i, label: 'Pull' },
]

export function deriveFocus(exercises: Exercise[]): string {
  const labels: string[] = []
  for (const e of exercises) {
    for (const p of PRIMARY) {
      if (p.match.test(e.nameEn) && !labels.includes(p.label)) {
        labels.push(p.label)
        break
      }
    }
    if (labels.length === 2) break
  }
  return labels.length ? labels.join(' + ') : 'Accessory'
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/focus.ts src/lib/focus.test.ts
git commit -m "feat: derive session focus label from exercises"
```

---

## Task 6: Author program.json (all 55 sessions)

**Files:**
- Create: `src/data/program.json`
- Create: `src/data/program.ts`

This is the parse/translate step. Source: the trainer's Doc (see spec §2). Author
each session as a `Session` object. `focus` may be left as `""` here — Task 7's
loader fills it via `deriveFocus`. Use the glossary below for consistent EN names
and equipment classification.

**Translation/classification glossary (RU → EN, equipment):**
- `жим лёжа` / `жим штанги лёжа` → "Bench Press" — **barbell**
- `жим гантелями лёжа` (`под углом` = incline, `прямой лавке` = flat) → "DB Bench Press" / "Incline DB Bench Press" — **dumbbell**, `perImplement: true`
- `становая тяга классика` → "Conventional Deadlift" — **barbell**
- `тяга становая с плинта/подставок/ямы` → "Block/Deficit Deadlift" — **barbell**
- `румынская тяга` → "Romanian Deadlift (RDL)" — **barbell**
- `приседание` (`в наколенниках` = knee sleeves, `с паузой` = paused) → "Squat" — **barbell**
- `наклоны со штангой / доброе утро` → "Good Morning" — **barbell**
- `жим штанги стоя` → "Overhead Press" — **barbell**
- `выпады со штангой` → "Barbell Lunges" — **barbell**
- `жим ногами в тренажёре` → "Leg Press" — **machine**
- `разгибание ног в тренажёре` → "Leg Extension" — **machine**
- `шраги с гантелями` → "DB Shrugs" — **dumbbell**, `perImplement: true`
- `махи гантелями в стороны` → "DB Lateral Raise" — **dumbbell**, `perImplement: true`
- `разводка гантелями лёжа` → "DB Fly" — **dumbbell**, `perImplement: true`
- `жим гантелей сидя` → "Seated DB Press" — **dumbbell**, `perImplement: true`
- `разгибание на трицепс в блоке` → "Cable Triceps Pushdown" — **cable**
- `французский жим лёжа штангой` → "Lying Triceps Extension (Skullcrusher)" — **barbell**
- `французский жим стоя гантелей` → "Overhead DB Triceps Extension" — **dumbbell**
- `тяга гантели к поясу` → "DB Row" — **dumbbell**
- `тяга штанги к поясу` → "Barbell Row" — **barbell**
- `тяга горизонтального блока` → "Seated Cable Row" — **cable**
- `тяга верхнего блока к груди` → "Lat Pulldown" — **cable**
- `подтягивания` → "Pull-ups" — **bodyweight**
- `брусья` → "Dips" — **bodyweight**
- `отжимание от пола` → "Push-ups" — **bodyweight**
- `гиперэкстензия` → "Hyperextension" — **bodyweight** (or machine; treat as bodyweight unless `с весом` then note added weight in kg, equipment `bodyweight`, weight `single`/`range`)
- `пресс скручивание` → "Crunches" — **bodyweight**
- `пресс планка` → "Plank" — **bodyweight** (reps = duration text, e.g. "40s")
- `подъём ног к перекладине` → "Hanging Leg Raise" — **bodyweight**

**Weight mapping rules:**
- `75 кг` → `{ kind: 'single', kg: 75 }`
- `25-28 кг` → `{ kind: 'range', minKg: 25, maxKg: 28 }`
- `105-120-130` (progression) → `{ kind: 'progression', kg: [105,120,130] }`
- `120/3, 135/3, 145/2` → `{ kind: 'perSet', steps: [{kg:120,reps:3},...] }`
- `тяжёлый/средний/лёгкий` with no number → `{ kind: 'qualitative', level: 'heavy'|'medium'|'light' }`
- bodyweight move, no added weight → `{ kind: 'bodyweight' }`
- "приблизительно/около" → use the number(s); keep the approximation in `notesEn/Ru`.

**Sets/reps mapping:**
- `4 подхода/3 повторения` or `4/3` → `sets: 4, reps: "3"`
- `3/15-20` → `sets: 3, reps: "15-20"`
- Plank durations → `sets: N, reps: "40s"`.
- Coaching cues (`пауза 2 секунды`, `садись ниже`, `можно заменить...`) →
  `notesRu` verbatim + `notesEn` translation.

- [ ] **Step 1: Write the first two sessions as a worked reference**

`src/data/program.json` (start; complete all 55 following this exact shape):
```json
{
  "title": "The Block",
  "sessions": [
    {
      "num": 1,
      "date": "2026-01-21",
      "dateLabel": "21 Jan",
      "focus": "",
      "exercises": [
        {
          "order": 1,
          "nameEn": "Bench Press, 1s pause on chest",
          "nameRu": "Жим лёжа с остановкой 1 секунда на груди",
          "descEn": "Bench press, pausing 1 second on the chest each rep.",
          "descRu": "Жим лёжа с остановкой 1 секунда на груди.",
          "equipment": "barbell",
          "weight": { "kind": "single", "kg": 75 },
          "sets": 4, "reps": "3"
        },
        {
          "order": 2,
          "nameEn": "Conventional Deadlift from floor",
          "nameRu": "Становая тяга классика с пола",
          "descEn": "Conventional deadlift from the floor.",
          "descRu": "Становая тяга классика с пола.",
          "equipment": "barbell",
          "weight": { "kind": "single", "kg": 120 },
          "sets": 3, "reps": "4"
        },
        {
          "order": 3,
          "nameEn": "DB Bench Press",
          "nameRu": "Жим гантелями лёжа",
          "descEn": "Flat dumbbell bench press.",
          "descRu": "Жим гантелями лёжа.",
          "equipment": "dumbbell", "perImplement": true,
          "weight": { "kind": "range", "minKg": 25, "maxKg": 28 },
          "sets": 3, "reps": "10-12"
        },
        {
          "order": 4,
          "nameEn": "DB Shrugs",
          "nameRu": "Шраги с гантелями",
          "descEn": "Dumbbell shrugs — as heavy as possible without shortening range of motion.",
          "descRu": "Шраги с гантелями, вес как можно больше, но не экономь амплитуду.",
          "equipment": "dumbbell", "perImplement": true,
          "weight": { "kind": "qualitative", "level": "heavy" },
          "sets": 3, "reps": "15-20"
        },
        {
          "order": 5,
          "nameEn": "Cable Triceps Pushdown",
          "nameRu": "Разгибание на трицепс в блоке",
          "descEn": "Cable triceps pushdown, moderate load.",
          "descRu": "Разгибание на трицепс в блоке, средняя нагрузка.",
          "equipment": "cable",
          "weight": { "kind": "qualitative", "level": "medium" },
          "sets": 3, "reps": "15"
        }
      ]
    }
  ]
}
```

- [ ] **Step 2: Complete all 55 sessions**

Author sessions 2–55 from the Doc into the same array, following the glossary and
mapping rules. Note dual-date headers (e.g. `09-10/03/2026`) → use the first date
for `date`, label `"9 Mar"`. Note number sloppiness in the Doc (e.g. `3/109` likely
`3/10`, `2/6` etc.) — use the sensible reading and preserve anything ambiguous in
`notesEn/Ru`.

- [ ] **Step 3: Validate JSON parses and matches types**

Create `src/data/program.ts`:
```ts
import data from './program.json'
import type { Program } from './types'
export const program = data as Program
```
Run: `npx tsc --noEmit`
Expected: no type errors (confirms shape matches `Program`).

- [ ] **Step 4: Add a structural test**

Create `src/data/program.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { program } from './program'

describe('program.json', () => {
  it('has 55 sessions numbered 1..55', () => {
    expect(program.sessions).toHaveLength(55)
    program.sessions.forEach((s, i) => expect(s.num).toBe(i + 1))
  })
  it('every exercise has a valid equipment and weight kind', () => {
    const eq = new Set(['barbell','dumbbell','machine','cable','bodyweight'])
    for (const s of program.sessions)
      for (const e of s.exercises) {
        expect(eq.has(e.equipment)).toBe(true)
        expect(e.weight.kind).toBeTruthy()
      }
  })
})
```
Run: `npm run test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/ && git commit -m "feat: add parsed 55-session program data"
```

---

## Task 7: Program loader with derived focus

**Files:**
- Modify: `src/data/program.ts`

- [ ] **Step 1: Add loader that fills focus and provides lookups**

Replace `src/data/program.ts`:
```ts
import data from './program.json'
import type { Program, Session } from './types'
import { deriveFocus } from '../lib/focus'

const raw = data as Program

export const program: Program = {
  ...raw,
  sessions: raw.sessions.map((s) => ({
    ...s,
    focus: s.focus || deriveFocus(s.exercises),
  })),
}

export function getSession(num: number): Session | undefined {
  return program.sessions.find((s) => s.num === num)
}
```

- [ ] **Step 2: Verify type-check + tests still pass**

Run: `npx tsc --noEmit && npm run test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/data/program.ts && git commit -m "feat: fill session focus and add lookup"
```

---

## Task 8: Reactor theme + app shell + router

**Files:**
- Create: `src/styles/theme.css`, `src/styles/app.css`, `src/router.ts`
- Modify: `src/main.ts`

- [ ] **Step 1: Add design tokens**

`src/styles/theme.css`:
```css
:root{
  --bg:#070b14; --bg2:#0b1220; --ink:#dbe6f0; --dim:#7d8ba0;
  --mint:#27e6b4; --blue:#5ea8ff;
  --card:rgba(255,255,255,.04); --line:rgba(255,255,255,.08);
  --radius:16px; --mono:'JetBrains Mono',ui-monospace,monospace;
  --sans:'Inter',-apple-system,system-ui,sans-serif;
}
*{box-sizing:border-box}
html,body{margin:0}
body{
  background:
    radial-gradient(120% 50% at 90% -5%,rgba(39,230,180,.14),transparent),
    radial-gradient(90% 40% at 0% 100%,rgba(94,168,255,.10),transparent),
    var(--bg);
  color:var(--ink); font-family:var(--sans);
  -webkit-font-smoothing:antialiased; min-height:100dvh;
}
#app{max-width:480px;margin:0 auto;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom)}
.mono{font-family:var(--mono)}
@media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
```

`src/styles/app.css`:
```css
.screen{padding:18px 18px 40px;min-height:100dvh}
/* list */
.hero-h{display:flex;justify-content:space-between;align-items:flex-end;margin:8px 0 18px}
.hero-h .k{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:var(--dim)}
.hero-h h1{font-size:26px;margin:2px 0 0;font-weight:800;letter-spacing:-.02em}
.lang{font-size:9px;color:var(--mint);border:1px solid rgba(39,230,180,.4);border-radius:20px;padding:4px 8px;letter-spacing:.1em}
.stats{display:flex;gap:10px;margin-bottom:18px}
.chip{flex:1;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:11px 12px}
.chip .n{font-size:20px;font-weight:800}
.chip .l{font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim)}
.wrow{display:flex;align-items:center;gap:12px;padding:13px;border-radius:14px;margin-bottom:9px;
  background:var(--card);border:1px solid var(--line);cursor:pointer;text-decoration:none;color:inherit}
.wrow.next{background:linear-gradient(90deg,rgba(39,230,180,.14),rgba(94,168,255,.05));border-color:rgba(39,230,180,.4)}
.wnum{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;font-weight:800;font-size:14px;
  background:rgba(255,255,255,.07);color:var(--dim)}
.wnum.next{background:linear-gradient(160deg,var(--mint),#159c79);color:#04210f}
.wmeta .d{font-size:13px;font-weight:600}
.wmeta .s{font-size:10px;color:var(--dim);letter-spacing:.04em;text-transform:uppercase;margin-top:2px}
.wrow .arr{margin-left:auto;color:var(--dim)}
/* detail */
.back{display:inline-block;font-size:12px;color:var(--mint);margin-bottom:10px;text-decoration:none}
.tag{display:inline-block;font-size:9px;letter-spacing:.14em;text-transform:uppercase;color:var(--mint);
  background:rgba(39,230,180,.1);border:1px solid rgba(39,230,180,.3);padding:3px 8px;border-radius:20px}
.exname{font-size:20px;font-weight:800;line-height:1.15;letter-spacing:-.01em;margin-top:8px}
.exru{font-size:12px;color:var(--dim);margin-top:3px}
.hero{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px;margin:14px 0;text-align:center}
.hero .big{font-size:40px;font-weight:800;line-height:.95;
  background:linear-gradient(90deg,var(--mint),var(--blue));-webkit-background-clip:text;background-clip:text;color:transparent}
.hero .conv{font-size:11px;color:var(--dim);margin-top:3px}
.pside{display:flex;justify-content:space-between;font-size:11px;margin-top:12px}
.pl{display:inline-block;background:rgba(39,230,180,.14);color:var(--mint);border-radius:5px;padding:2px 6px;margin-left:4px;font-weight:700;font-size:10px}
.reps{display:flex;gap:8px;margin:12px 0}
.reps .b{flex:1;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px;text-align:center}
.reps .b .n{font-size:18px;font-weight:800}
.reps .b .l{font-size:8px;letter-spacing:.1em;text-transform:uppercase;color:var(--dim)}
.note{font-size:12px;color:var(--dim);border-left:2px solid var(--mint);padding-left:9px;margin-top:8px;line-height:1.45}
.exmini{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--line);cursor:pointer}
.exmini .i{width:24px;height:24px;border-radius:7px;background:rgba(255,255,255,.06);display:grid;place-items:center;font-size:10px;color:var(--dim);font-weight:700}
.exmini .t{font-size:12px}
.exmini .w{margin-left:auto;font-size:11px;color:var(--mint)}
```

- [ ] **Step 2: Add hash router**

`src/router.ts`:
```ts
type Render = (el: HTMLElement, params: Record<string, string>) => void
interface Route { pattern: RegExp; keys: string[]; render: Render }

const routes: Route[] = []
let root: HTMLElement

export function route(path: string, render: Render) {
  const keys: string[] = []
  const pattern = new RegExp(
    '^' + path.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)' }) + '$'
  )
  routes.push({ pattern, keys, render })
}

function resolve() {
  const hash = location.hash.replace(/^#/, '') || '/'
  for (const r of routes) {
    const m = hash.match(r.pattern)
    if (m) {
      const params: Record<string, string> = {}
      r.keys.forEach((k, i) => (params[k] = m[i + 1]))
      root.innerHTML = ''
      r.render(root, params)
      window.scrollTo(0, 0)
      return
    }
  }
  root.innerHTML = '<div class="screen">Not found</div>'
}

export function startRouter(mount: HTMLElement) {
  root = mount
  window.addEventListener('hashchange', resolve)
  resolve()
}
```

- [ ] **Step 3: Wire main.ts**

`src/main.ts`:
```ts
import './styles/theme.css'
import './styles/app.css'
import { route, startRouter } from './router'
import { renderList } from './screens/list'
import { renderSession } from './screens/session'

route('/', (el) => renderList(el))
route('/session/:n', (el, p) => renderSession(el, Number(p.n)))

startRouter(document.querySelector<HTMLElement>('#app')!)
```

- [ ] **Step 4: Verify build compiles (screens added next task; create stubs to compile)**

Create stub `src/screens/list.ts`: `export function renderList(el: HTMLElement){ el.innerHTML = '<div class="screen">list</div>' }`
Create stub `src/screens/session.ts`: `export function renderSession(el: HTMLElement, n: number){ el.innerHTML = '<div class="screen">session '+n+'</div>' }`
Run: `npm run dev` — visit `#/` and `#/session/1`; both render stubs. Stop server.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add Reactor theme, app shell, and hash router"
```

---

## Task 9: Program list screen

**Files:**
- Modify: `src/screens/list.ts`

- [ ] **Step 1: Implement the list**

`src/screens/list.ts`:
```ts
import { program } from '../data/program'
import { gsap } from 'gsap'

function topPullKg(): number {
  let max = 0
  for (const s of program.sessions)
    for (const e of s.exercises)
      if (/deadlift/i.test(e.nameEn)) {
        const w = e.weight
        if (w.kind === 'single') max = Math.max(max, w.kg)
        if (w.kind === 'range') max = Math.max(max, w.maxKg)
        if (w.kind === 'progression') max = Math.max(max, ...w.kg)
        if (w.kind === 'perSet') max = Math.max(max, ...w.steps.map((x) => x.kg))
      }
  return max
}

export function renderList(el: HTMLElement) {
  const next = 1 // Phase 2 will track real progress
  el.innerHTML = `
    <div class="screen">
      <div class="hero-h">
        <div><div class="k">Program · Jan–Jun 2026</div><h1>${program.title}</h1></div>
        <span class="lang">EN · RU</span>
      </div>
      <div class="stats">
        <div class="chip"><div class="n mono">${program.sessions.length}</div><div class="l">Sessions</div></div>
        <div class="chip"><div class="n mono">${next}<span style="color:var(--dim)">/${program.sessions.length}</span></div><div class="l">Up next</div></div>
        <div class="chip"><div class="n mono">${topPullKg()}<span style="font-size:11px">kg</span></div><div class="l">Top pull</div></div>
      </div>
      <div id="rows">
        ${program.sessions.map((s) => `
          <a class="wrow ${s.num === next ? 'next' : ''}" href="#/session/${s.num}">
            <div class="wnum ${s.num === next ? 'next' : ''}">${s.num}</div>
            <div class="wmeta">
              <div class="d">${s.dateLabel} · ${s.focus}</div>
              <div class="s">${s.exercises.length} exercises</div>
            </div>
            <div class="arr">›</div>
          </a>`).join('')}
      </div>
    </div>`
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!reduce) gsap.from('#rows .wrow', { y: 14, opacity: 0, duration: 0.4, stagger: 0.03, ease: 'power2.out' })
}
```

- [ ] **Step 2: Verify in browser**

Run: `npm run dev` — `#/` shows all 55 rows with focus labels + stats; rows stagger in. Stop server.

- [ ] **Step 3: Commit**

```bash
git add src/screens/list.ts && git commit -m "feat: program list screen with stats and stagger-in"
```

---

## Task 10: SVG barbell fallback component

**Files:**
- Create: `src/components/barbell-svg.ts`

- [ ] **Step 1: Implement SVG barbell from a plate stack**

`src/components/barbell-svg.ts`:
```ts
import type { PlateStack } from '../lib/load'

// Visual height per plate denomination (px).
const H: Record<number, number> = { 45: 30, 35: 26, 25: 22, 10: 16, 5: 12, 2.5: 9 }

export function barbellSvg(plates: PlateStack[]): string {
  const side = plates.flatMap((p) => Array(p.count).fill(p.plate)) as number[]
  side.sort((a, b) => b - a) // biggest inboard
  const disc = (h: number, x: number) =>
    `<rect x="${x}" y="${30 - h / 2}" width="6" height="${h}" rx="2" fill="url(#g)"/>`
  let x = 70, left = ''
  for (const p of side) { x -= 8; left += disc(H[p] ?? 9, x) }
  let xr = 130, right = ''
  for (const p of side) { right += disc(H[p] ?? 9, xr); xr += 8 }
  return `
  <svg viewBox="0 0 200 60" width="100%" height="64" role="img" aria-label="Barbell loading">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#27e6b4"/><stop offset="1" stop-color="#11936f"/>
    </linearGradient></defs>
    ${left}
    <rect x="68" y="27" width="64" height="6" rx="3" fill="#cdd9e8"/>
    ${right}
  </svg>`
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/barbell-svg.ts && git commit -m "feat: SVG barbell fallback renderer"
```

---

## Task 11: three.js barbell hero with fallback

**Files:**
- Create: `src/components/barbell.ts`

- [ ] **Step 1: Implement three.js barbell with WebGL/reduced-motion fallback**

`src/components/barbell.ts`:
```ts
import * as THREE from 'three'
import { gsap } from 'gsap'
import type { PlateStack } from '../lib/load'
import { barbellSvg } from './barbell-svg'

const RADIUS: Record<number, number> = { 45: 0.9, 35: 0.78, 25: 0.66, 10: 0.5, 5: 0.4, 2.5: 0.32 }

function webglOK(): boolean {
  try { return !!document.createElement('canvas').getContext('webgl') } catch { return false }
}

export function mountBarbell(container: HTMLElement, plates: PlateStack[]) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!webglOK() || reduce) { container.innerHTML = barbellSvg(plates); return }

  const w = container.clientWidth || 300, h = 130
  const scene = new THREE.Scene()
  const cam = new THREE.PerspectiveCamera(40, w / h, 0.1, 100)
  cam.position.set(0, 1.1, 7)
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2))
  renderer.setSize(w, h)
  container.appendChild(renderer.domElement)

  scene.add(new THREE.AmbientLight(0xffffff, 0.6))
  const key = new THREE.DirectionalLight(0x27e6b4, 1.4); key.position.set(2, 3, 4); scene.add(key)
  const rim = new THREE.DirectionalLight(0x5ea8ff, 0.8); rim.position.set(-3, 1, -2); scene.add(rim)

  const group = new THREE.Group(); scene.add(group)
  const bar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.09, 6, 24),
    new THREE.MeshStandardMaterial({ color: 0xcdd9e8, metalness: 0.9, roughness: 0.25 })
  )
  bar.rotation.z = Math.PI / 2; group.add(bar)

  const side = plates.flatMap((p) => Array(p.count).fill(p.plate)).sort((a, b) => b - a) as number[]
  const plateMat = new THREE.MeshStandardMaterial({ color: 0x13d39c, metalness: 0.5, roughness: 0.35, emissive: 0x0a3b2c })
  const made: THREE.Mesh[] = []
  const place = (sign: 1 | -1) => {
    let x = sign * 0.6
    for (const p of side) {
      const r = RADIUS[p] ?? 0.3
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.12, 28), plateMat)
      disc.rotation.z = Math.PI / 2; disc.position.x = x; group.add(disc); made.push(disc)
      x += sign * 0.16
    }
  }
  place(1); place(-1)

  if (!reduce) {
    gsap.from(made, { scale: 0, duration: 0.5, stagger: 0.04, ease: 'back.out(2)' })
    gsap.to(group.rotation, { y: 0.5, duration: 6, yoyo: true, repeat: -1, ease: 'sine.inOut' })
  }

  let raf = 0
  const loop = () => { renderer.render(scene, cam); raf = requestAnimationFrame(loop) }
  loop()

  // Clean up if container is removed (route change empties #app).
  const obs = new MutationObserver(() => {
    if (!document.body.contains(container)) {
      cancelAnimationFrame(raf); renderer.dispose(); obs.disconnect()
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/barbell.ts && git commit -m "feat: three.js barbell hero with SVG/reduced-motion fallback"
```

---

## Task 12: Session detail screen

**Files:**
- Modify: `src/screens/session.ts`

- [ ] **Step 1: Add weight presentation helpers**

Add to `src/screens/session.ts` (top):
```ts
import { getSession } from '../data/program'
import type { Exercise, Weight } from '../data/types'
import { computeBarbellLoad, kgToLb } from '../lib/load'
import { mountBarbell } from '../components/barbell'
import { gsap } from 'gsap'

function primaryKg(w: Weight): number | null {
  if (w.kind === 'single') return w.kg
  if (w.kind === 'range') return w.maxKg
  if (w.kind === 'progression') return Math.max(...w.kg)
  if (w.kind === 'perSet') return Math.max(...w.steps.map((s) => s.kg))
  return null
}

function weightLabel(w: Weight, perImplement?: boolean): string {
  const suffix = perImplement ? ' each' : ''
  if (w.kind === 'single') return `${w.kg} kg${suffix}`
  if (w.kind === 'range') return `${w.minKg}–${w.maxKg} kg${suffix}`
  if (w.kind === 'progression') return `${w.kg.join('→')} kg`
  if (w.kind === 'perSet') return w.steps.map((s) => `${s.kg}×${s.reps}`).join(', ')
  if (w.kind === 'qualitative') return w.level[0].toUpperCase() + w.level.slice(1)
  return 'Bodyweight'
}
```

- [ ] **Step 2: Render the focused exercise + hero + plate breakdown**

Append to `src/screens/session.ts`:
```ts
function platesText(perSide: { plate: number; count: number }[]): string {
  if (!perSide.length) return 'empty bar'
  return perSide.map((p) => `<span class="pl">${p.count > 1 ? p.count + '×' : ''}${p.plate}</span>`).join('')
}

function heroFor(e: Exercise): string {
  const kg = primaryKg(e.weight)
  if (e.equipment === 'barbell' && kg !== null) {
    const load = computeBarbellLoad(kg)
    return `
      <div class="hero">
        <div class="big">${weightLabel(e.weight)}</div>
        <div class="conv mono">= ${kgToLb(kg).toFixed(0)} lb → ${load.totalLb} lb total</div>
        <div id="bb"></div>
        <div class="pside"><span style="color:var(--dim)">Per side</span>
          <span class="mono">45 ${platesText(load.plates)}</span></div>
      </div>`
  }
  return `
    <div class="hero">
      <div class="big">${weightLabel(e.weight, e.perImplement)}</div>
      <div class="conv mono">${kg !== null ? '= ' + kgToLb(kg).toFixed(0) + ' lb' + (e.perImplement ? ' each' : '') : ''}</div>
    </div>`
}

export function renderSession(el: HTMLElement, n: number) {
  const s = getSession(n)
  if (!s) { el.innerHTML = '<div class="screen">Session not found · <a href="#/">back</a></div>'; return }
  let focusIdx = s.exercises.findIndex((e) => e.equipment === 'barbell')
  if (focusIdx < 0) focusIdx = 0

  const draw = () => {
    const e = s.exercises[focusIdx]
    el.innerHTML = `
      <div class="screen">
        <a class="back" href="#/">‹ Program · ${s.dateLabel}</a>
        <span class="tag">⬡ ${e.equipment} · #${e.order}</span>
        <div class="exname">${e.nameEn}</div>
        <div class="exru">${e.nameRu}</div>
        ${heroFor(e)}
        <div class="reps">
          <div class="b"><div class="n mono">${e.sets ?? '—'}</div><div class="l">Sets</div></div>
          <div class="b"><div class="n mono">${e.reps}</div><div class="l">Reps</div></div>
        </div>
        <div class="note">${e.descEn}<br><span style="opacity:.7">${e.descRu}</span>
          ${e.notesEn ? `<br><br>${e.notesEn}<br><span style="opacity:.7">${e.notesRu ?? ''}</span>` : ''}</div>
        <div style="margin-top:14px" id="mini"></div>
      </div>`

    const mini = el.querySelector('#mini')!
    s.exercises.forEach((x, i) => {
      if (i === focusIdx) return
      const row = document.createElement('div')
      row.className = 'exmini'
      row.innerHTML = `<div class="i">${x.order}</div><div class="t">${x.nameEn}</div>
        <div class="w">${weightLabel(x.weight, x.perImplement)}</div>`
      row.addEventListener('click', () => { focusIdx = i; draw() })
      mini.appendChild(row)
    })

    const bb = el.querySelector<HTMLElement>('#bb')
    if (bb && e.equipment === 'barbell') {
      const kg = primaryKg(e.weight)
      if (kg !== null) mountBarbell(bb, computeBarbellLoad(kg).plates)
    }
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!reduce) gsap.from('.screen > *', { y: 12, opacity: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out' })
  }
  draw()
}
```

- [ ] **Step 3: Verify in browser**

Run: `npm run dev` — open `#/session/1`: barbell hero shows `75 kg`, `= 165 lb → 170 lb total`, animated 3D bar, per-side `45 45 10 5 2.5`... (verify against `computeBarbellLoad(75)`: `45 10 5 2.5`). Tap a mini row → hero refocuses. Check a dumbbell day (e.g. session with shrugs) shows "each". Stop server.

- [ ] **Step 4: Commit**

```bash
git add src/screens/session.ts && git commit -m "feat: session detail with barbell hero and refocus"
```

---

## Task 13: Mobile + correctness verification (Playwright/DevTools)

**Files:**
- None (verification task)

- [ ] **Step 1: Build and preview**

Run: `npm run build && npm run preview`
Expected: production build succeeds; preview serves the app.

- [ ] **Step 2: Drive the app at phone width**

Use Playwright MCP (or Chrome DevTools device mode at 390×844):
- Navigate to the preview URL `#/`. Screenshot. Confirm: 55 rows, stats, no overflow, tap targets ≥40px.
- Navigate `#/session/1`. Screenshot. Confirm hero reads `75 kg`, `170 lb total`, per side `45 + 10 + 5 + 2.5`, 3D barbell visible.
- Spot-check three more sessions covering: a **progression** (e.g. session 5 squat `105-120-130…`), a **perSet** load (session 49 deadlift), and a **bodyweight** day (e.g. plank/push-up session). Confirm each renders its weight label and that barbell heroes match `computeBarbellLoad`.

- [ ] **Step 3: Verify reduced-motion + no console errors**

Emulate `prefers-reduced-motion: reduce`; confirm SVG barbell renders and no animations autoplay. Check the console for errors across both screens.

- [ ] **Step 4: Fix any issues found, then commit**

```bash
git add -A && git commit -m "fix: mobile layout and verification adjustments"
```
(If nothing needed fixing, skip the commit.)

---

## Task 14: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write README**

`README.md`:
```markdown
# LiftingLog

Mobile-first viewer for a strength program. Bilingual (EN/RU), kg→lb conversion,
and exact per-side barbell plate loading. Static app — no backend.

## Develop
- `npm install`
- `npm run dev` — local dev server
- `npm run test` — unit tests (load math, focus, data shape)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the build

## Deploy
`dist/` is static; deploy to Netlify, Vercel, or GitHub Pages. `base: './'` in
`vite.config.ts` makes it path-independent.

## Plates & bar
Bar = 45 lb. Plates per side = 45, 35, 25, 10, 5, 2.5 lb. Targets round UP to the
nearest achievable load (never under the trainer's number). Logic in
`src/lib/load.ts`.

## Updating the program (re-parse)
Source: the trainer's Google Doc. The app reads `src/data/program.json`. When the
trainer adds sessions, regenerate that file by re-parsing the Doc (translate +
classify equipment per the glossary in
`docs/superpowers/plans/2026-06-11-lifting-log.md`, Task 6), then commit. The app
recomputes pounds/plates automatically.

## Roadmap (Phase 2)
Logger: mark sets done, rest timer, notes to the trainer (reserved
`localStorage` namespace `liftinglog:logs`).
```

- [ ] **Step 2: Commit**

```bash
git add README.md && git commit -m "docs: add README"
```

---

## Self-Review notes

- **Spec coverage:** §3 architecture → Tasks 1,8; §4 types → Task 4; §5 plate logic
  → Tasks 2,3 (+ presentation Task 12); §3 AI-parse/data → Task 6; focus → Task 5;
  §6 visual → Tasks 8–12; §7 a11y/responsive → reduced-motion in 8/11/12, Task 13;
  §8 verification → Tasks 2,3,5,6 (unit) + 13 (browser); §10 deliverables → all +
  Task 14.
- **Type consistency:** `BarbellLoad`/`PlateStack` from `load.ts` used in Tasks
  10–12; `Weight`/`Exercise`/`Session`/`Program` from `types.ts` used consistently;
  `computeBarbellLoad`, `kgToLb`, `deriveFocus`, `getSession` signatures match
  across tasks.
- **Known simplification (YAGNI):** plate decomposition is greedy (valid, not
  always fewest plates). Acceptable for Phase 1.
```
