# Dumbbell per-implement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make two-dumbbell movements display the single-dumbbell weight with an "each" label and count both dumbbells (×2) in volume.

**Architecture:** Thread one optional boolean `perImplement` onto `WorkoutExercise` from both origins — the coach `Exercise` (curated flag already in `program.json`) and the catalog `CatalogExercise` (a name heuristic added to `build-catalog.mjs`). Three consumers read it: display appends " each", volume doubles the set load, and the trainer log appends a Russian marker. Per-dumbbell numbers remain exactly what the user enters/stores.

**Tech Stack:** Vite + TypeScript (vanilla), Vitest, Node ESM build scripts. No backend.

## Global Constraints

- **Data holds kilograms only**; lb/plate math is runtime. No change to `LoggedSet` shape — the flag lives on the exercise, not the set.
- **Keep `npm run test` green and `npm run build` (`tsc && vite build`) clean** after every task.
- **`tsc` compiles `src` only** (`tsconfig.json` `include: ["src"]`). Do NOT import `scripts/*.mjs` from any `src/**/*.ts` file — it breaks the type-check. Test build-script code in `scripts/*.test.mjs` (Vitest's default glob picks it up; tsc ignores it).
- **`src/data/exercises.json` is GENERATED** — never hand-edit; it is produced from `build-catalog.mjs` + `catalog-extras.json`.
- **Commit per task** with a clear message. Branch is `feat/dumbbell-per-implement` (already created).
- **e1RM is barbell-only** (`e1rm.ts` skips non-barbell), so `perImplement` never reaches it — no e1RM change in this plan.
- **Russian regex gotcha:** JS `\w`/`\b` don't match Cyrillic — not relevant here (the heuristic matches English names), but keep in mind for the `(кажд.)` literal.

---

### Task 1: Add the `perImplement` field to the type declarations

Optional/boolean field added to three types. No behavior yet; this unblocks every later task. Verified by the type-checker (optional field, nothing breaks).

**Files:**
- Modify: `src/lib/logger-types.ts` (add to `WorkoutExercise`)
- Modify: `src/data/catalog-types.ts` (add to `CatalogExercise`)
- Modify: `src/lib/logger-model.ts` (add to the `ExerciseOccurrence` interface)

**Interfaces:**
- Produces: `WorkoutExercise.perImplement?: boolean`, `CatalogExercise.perImplement?: boolean`, `ExerciseOccurrence.perImplement: boolean` — consumed by every later task.

- [ ] **Step 1: Add the field to `WorkoutExercise`**

In `src/lib/logger-types.ts`, inside `interface WorkoutExercise`, add the field after `isTimed`:

```ts
  isTimed?: boolean          // true for holds (plank): `reps` is seconds, not reps
  perImplement?: boolean     // two dumbbells, weight is per-dumbbell → "each" label + ×2 volume
  alt?: WorkoutExercise      // the coach "(or …)" alternative; toggling swaps active⇄alt
```

- [ ] **Step 2: Add the field to `CatalogExercise`**

In `src/data/catalog-types.ts`, inside `interface CatalogExercise`, add after `defaultRestSec`:

```ts
  defaultRestSec: number
  perImplement?: boolean  // two-dumbbell movement (set by build-catalog heuristic)
  thumb?: string
```

- [ ] **Step 3: Add the field to `ExerciseOccurrence`**

In `src/lib/logger-model.ts`, inside `interface ExerciseOccurrence`, add after `isTimed`:

```ts
  isTimed: boolean
  perImplement: boolean      // two dumbbells → display appends "each"
  sets: LoggedSet[]          // that workout's DONE sets for the ref
```

- [ ] **Step 4: Verify the type-check passes**

Run: `npx tsc --noEmit`
Expected: exits 0, no errors (the field is optional / not yet referenced).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logger-types.ts src/data/catalog-types.ts src/lib/logger-model.ts
git commit -m "feat(types): add perImplement flag to exercise types"
```

---

### Task 2: Display — append "each" in `setWeightDisplay`

**Files:**
- Modify: `src/lib/logger-model.ts` (`setWeightDisplay`)
- Test: `src/lib/logger-model.test.ts` (extend `describe('setWeightDisplay')`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `setWeightDisplay(lb: number | null, equipment: string, unit: Unit, perImplement?: boolean): string` — the 4th param defaults to `false`; when truthy, a non-barbell weight gains a trailing ` each`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/logger-model.test.ts`, inside `describe('setWeightDisplay', …)`, add:

```ts
  it('appends "each" for a per-implement (two-dumbbell) set', () => {
    expect(setWeightDisplay(44, 'dumbbell', 'kg', true)).toBe('20 kg each')
    expect(setWeightDisplay(44, 'dumbbell', 'lb', true)).toBe('44 lb each')
  })
  it('omits "each" when perImplement is false/absent (regression)', () => {
    expect(setWeightDisplay(44, 'dumbbell', 'kg', false)).toBe('20 kg')
    expect(setWeightDisplay(44, 'dumbbell', 'kg')).toBe('20 kg')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/logger-model.test.ts -t setWeightDisplay`
Expected: FAIL — the new cases get `'20 kg'` (no `each`); TS may also flag the 4th arg.

- [ ] **Step 3: Implement the 4th parameter**

In `src/lib/logger-model.ts`, replace the `setWeightDisplay` body:

```ts
export function setWeightDisplay(lb: number | null, equipment: string, unit: Unit, perImplement = false): string {
  const conv = (x: number) => (unit === 'kg' ? Math.round(x / KG_TO_LB) : x)
  if (equipment === 'bodyweight') return lb === null || lb <= 0 ? 'BW' : `BW +${conv(lb)} ${unit}`
  if (lb === null) return '–'
  if (equipment === 'barbell') return `${conv(lb)} ${unit} (${conv(lb + BAR_LB)} w/ bar)`
  return `${conv(lb)} ${unit}${perImplement ? ' each' : ''}`
}
```

Update the JSDoc above it — append: `A perImplement (two-dumbbell) set adds " each".`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/logger-model.test.ts -t setWeightDisplay`
Expected: PASS (all `setWeightDisplay` cases, old and new).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logger-model.ts src/lib/logger-model.test.ts
git commit -m "feat(logger): setWeightDisplay appends 'each' for per-implement sets"
```

---

### Task 3: Volume — double the load for per-implement sets

**Files:**
- Modify: `src/lib/logger-model.ts` (`setLoadLb`, `exerciseVolumeLb`)
- Test: `src/lib/logger-model.test.ts` (extend `describe('exerciseVolumeLb / workoutVolumeLb')`)

**Interfaces:**
- Consumes: `WorkoutExercise.perImplement` (Task 1).
- Produces: per-implement exercises contribute `weight × 2 × reps` to `exerciseVolumeLb`/`workoutVolumeLb`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/logger-model.test.ts`, inside `describe('exerciseVolumeLb / workoutVolumeLb', …)`, add:

```ts
  it('doubles the load for a per-implement (two-dumbbell) movement', () => {
    expect(exerciseVolumeLb(wex({ equipment: 'dumbbell', perImplement: true, sets: [set(50, 10)] }))).toBe(1000)
  })
  it('a non-per-implement dumbbell still counts one bell', () => {
    expect(exerciseVolumeLb(wex({ equipment: 'dumbbell', sets: [set(50, 10)] }))).toBe(500)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/logger-model.test.ts -t "exerciseVolumeLb / workoutVolumeLb"`
Expected: FAIL — the per-implement case returns 500 instead of 1000.

- [ ] **Step 3: Implement the doubling**

In `src/lib/logger-model.ts`, replace `setLoadLb`:

```ts
/** Full lifted lb for one set: barbell adds the 45 lb bar, other equipment as-is; null
 *  plates → 0. A per-implement (two-dumbbell) set counts both bells (×2). */
function setLoadLb(weightLb: number | null, equipment: Equipment, perImplement = false): number {
  const w = weightLb ?? 0
  const base = equipment === 'barbell' ? w + BAR_LB : w
  return perImplement ? base * 2 : base
}
```

In the same file, in `exerciseVolumeLb`, pass the flag:

```ts
    v += setLoadLb(s.weightLb, ex.equipment, ex.perImplement)
```

Also update the `exerciseVolumeLb` JSDoc — append: `Per-implement (two-dumbbell) movements count both bells (×2).`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/logger-model.test.ts -t "exerciseVolumeLb / workoutVolumeLb"`
Expected: PASS (new cases + existing volume cases unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logger-model.ts src/lib/logger-model.test.ts
git commit -m "feat(logger): count both dumbbells (x2) in per-implement volume"
```

---

### Task 4: Thread the flag onto every `WorkoutExercise`

Carry `perImplement` from the coach `Exercise` and the catalog `CatalogExercise` into the built `WorkoutExercise`, and surface it on `ExerciseOccurrence`.

**Files:**
- Modify: `src/lib/logger-model.ts` (`buildOne`, `catalogToWorkoutExercise`, `allSetsForRef`)
- Test: `src/lib/logger-model.test.ts` (extend `describe('buildWorkoutExercises')`, `describe('catalogToWorkoutExercise')`, `describe('allSetsForRef')`)

**Interfaces:**
- Consumes: `Exercise.perImplement` (existing), `CatalogExercise.perImplement` (Task 1).
- Produces: built `WorkoutExercise` and `ExerciseOccurrence` objects carry `perImplement`.

- [ ] **Step 1: Write the failing tests**

In `describe('buildWorkoutExercises', …)` add:

```ts
  it('carries the coach perImplement flag onto the WorkoutExercise', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ equipment: 'dumbbell', perImplement: true, weight: { kind: 'single', kg: 20 } })]))
    expect(we.perImplement).toBe(true)
    const [plain] = buildWorkoutExercises(mkSession([ex({ equipment: 'barbell' })]))
    expect(plain.perImplement).toBeUndefined()
  })
```

In `describe('catalogToWorkoutExercise', …)` add (note the existing `c` is a machine — make a local per-implement catalog entry):

```ts
  it('carries the catalog perImplement flag', () => {
    const db: CatalogExercise = { ...c, id: 'db-press', nameEn: 'DB Press', equipment: 'dumbbell', perImplement: true }
    expect(catalogToWorkoutExercise(db).perImplement).toBe(true)
    expect(catalogToWorkoutExercise(c).perImplement).toBeUndefined()
  })
```

In `describe('allSetsForRef', …)` add:

```ts
  it('surfaces perImplement on the occurrence', () => {
    const w = wk({ exercises: [wex({ exerciseRef: 'db', nameEn: 'DB Press', equipment: 'dumbbell', perImplement: true, sets: [set(40, 10)] })] })
    expect(allSetsForRef([w], 'db')[0].perImplement).toBe(true)
    const plain = wk({ exercises: [wex({ exerciseRef: 'bb', sets: [set(135, 5)] })] })
    expect(allSetsForRef([plain], 'bb')[0].perImplement).toBe(false)
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/logger-model.test.ts -t "perImplement"`
Expected: FAIL — `we.perImplement`/occurrence `.perImplement` are `undefined`.

- [ ] **Step 3: Thread the flag in the three functions**

In `buildOne`, add the flag to the returned object (spread so it stays absent when false — mirrors `parse-program.mjs`):

```ts
  return {
    exerciseRef: `coach:${slugify(e.nameEn)}`,
    nameEn: e.nameEn,
    nameRu: e.nameRu,
    equipment: e.equipment,
    isCoachPrescribed: true,
    coachTarget: coachTargetText(e),
    isTimed,
    ...(e.perImplement ? { perImplement: true } : {}),
    sets,
  }
```

In `catalogToWorkoutExercise`, add the flag:

```ts
  return {
    exerciseRef: c.id,
    nameEn: c.nameEn,
    nameRu: c.nameRu,
    equipment: c.equipment,
    isCoachPrescribed: false,
    coachTarget: '',
    ...(c.perImplement ? { perImplement: true } : {}),
    sets: [blankSet(c.defaultRestSec)],
  }
```

In `allSetsForRef`, add `perImplement` to the mapped occurrence (next to `isTimed`):

```ts
      return { dateIso: w.startedAt, nameEn: ex.nameEn, nameRu: ex.nameRu, equipment: ex.equipment, isTimed: !!ex.isTimed, perImplement: !!ex.perImplement, sets }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/logger-model.test.ts`
Expected: PASS (whole file green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logger-model.ts src/lib/logger-model.test.ts
git commit -m "feat(logger): thread perImplement from coach + catalog into WorkoutExercise"
```

---

### Task 5: Trainer log — append the `(кажд.)` marker

**Files:**
- Modify: `src/lib/logger-model.ts` (`trainerLog`)
- Test: `src/lib/logger-model.test.ts` (extend `describe('trainerLog')`)

**Interfaces:**
- Consumes: `WorkoutExercise.perImplement`.
- Produces: a per-implement weighted set renders `<kg> (кажд.) × <reps> — <n>` (no doubling — the coach prescribes per-dumbbell).

- [ ] **Step 1: Write the failing test**

In `describe('trainerLog', …)` add:

```ts
  it('marks a per-implement (two-dumbbell) set with (кажд.), no doubling', () => {
    const w = wk({ exercises: [{ exerciseRef: 'i', nameEn: 'Incline DB', nameRu: 'Жим гантелей', equipment: 'dumbbell', isCoachPrescribed: true, coachTarget: '', perImplement: true, sets: [doneSet(44, 3)] }] })
    expect(trainerLog(w)).toBe('Жим гантелей\n20 (кажд.) × 3 — 1')
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/logger-model.test.ts -t "кажд"`
Expected: FAIL — output is `20 × 3 — 1` (no marker).

- [ ] **Step 3: Implement the marker in `wt()`**

In `trainerLog`, replace the numeric return of the inner `wt` helper so it appends the marker for a per-implement exercise:

```ts
      const wt = (lb: number | null): string => {
        if (ex.equipment === 'bodyweight') return lb === null || lb <= 0 ? 'б/в' : `б/в +${Math.round(lb / KG_TO_LB)}`
        if (lb === null) return 'б/в'
        const full = ex.equipment === 'barbell' ? lb + BAR_LB : lb
        return `${Math.round(full / KG_TO_LB)}${ex.perImplement ? ' (кажд.)' : ''}`
      }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/logger-model.test.ts -t trainerLog`
Expected: PASS (new case + existing trainerLog cases unchanged).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logger-model.ts src/lib/logger-model.test.ts
git commit -m "feat(logger): trainer log marks per-implement sets with (кажд.)"
```

---

### Task 6: Catalog heuristic + run-guard in `build-catalog.mjs`

Add `perImplementFor`, use it in `build()`, and wrap the script's network/main body in a guard so the module can be imported by a test without side effects. Unit-test the pure function in a `.mjs` test (outside `src`, so tsc ignores it).

**Files:**
- Modify: `scripts/build-catalog.mjs`
- Test: `scripts/build-catalog.test.mjs` (create)

**Interfaces:**
- Produces: `export function perImplementFor(nameEn, equip): boolean` — true iff `equip === 'dumbbell'` and the name is not goblet / single-arm / one-arm.

- [ ] **Step 1: Write the failing test**

Create `scripts/build-catalog.test.mjs`:

```js
import { describe, it, expect } from 'vitest'
import { perImplementFor } from './build-catalog.mjs'

describe('perImplementFor', () => {
  it('flags two-dumbbell movements', () => {
    expect(perImplementFor('Dumbbell Bench Press', 'dumbbell')).toBe(true)
    expect(perImplementFor('Incline Dumbbell Press', 'dumbbell')).toBe(true)
  })
  it('excludes goblet and single/one-arm dumbbell movements', () => {
    expect(perImplementFor('Dumbbell Goblet Squat', 'dumbbell')).toBe(false)
    expect(perImplementFor('Single-Arm Dumbbell Row', 'dumbbell')).toBe(false)
    expect(perImplementFor('Single Arm Dumbbell Row', 'dumbbell')).toBe(false)
    expect(perImplementFor('One-Arm Dumbbell Row', 'dumbbell')).toBe(false)
  })
  it('is false for non-dumbbell equipment', () => {
    expect(perImplementFor('Barbell Bench Press', 'barbell')).toBe(false)
    expect(perImplementFor('Goblet Squat', 'bodyweight')).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run scripts/build-catalog.test.mjs`
Expected: FAIL — `perImplementFor` is not exported (import error). (If it hangs instead of failing fast, the run-guard in Step 3 is what fixes that.)

- [ ] **Step 3a: Add `pathToFileURL` to the node:url import**

In `scripts/build-catalog.mjs` line 6, change:

```js
import { fileURLToPath, pathToFileURL } from 'node:url'
```

- [ ] **Step 3b: Add the `perImplementFor` export**

After the `restFor` function (around line 44), add:

```js
// Two-dumbbell movement? Weight is per-dumbbell, so the logger labels it "each" and
// doubles volume. Heuristic for USER-ADDED catalog lifts (coach lifts carry a curated
// perImplement from program.json via parse-program.mjs). Dumbbell, minus unilateral /
// goblet holds. Correct a misclassification by overriding the entry in catalog-extras.json.
export function perImplementFor(nameEn, equip) {
  return equip === 'dumbbell' && !/goblet|single[-\s]?arm|one[-\s]?arm/i.test(nameEn)
}
```

- [ ] **Step 3c: Set the field in `build()`**

In `build()`, in the `items.push({ … })` object, add the field after `defaultRestSec`:

```js
      defaultRestSec: restFor(en.name),
      ...(perImplementFor(en.name, equip) ? { perImplement: true } : {}),
```

- [ ] **Step 3d: Wrap the main body in a run-guard**

Replace everything from `const raw = await fetchAll()` (line 89) to the end of the file with:

```js
async function main() {
  const raw = await fetchAll()
  let { items, ruFallback } = build(raw)

  // Apply the Russian-name overlay (id → nameRu) so the catalog is bilingual.
  if (existsSync(RU_OVERLAY)) {
    const ru = JSON.parse(readFileSync(RU_OVERLAY, 'utf8'))
    let applied = 0
    for (const it of items) {
      if (ru[it.id] && it.ruIsFallback) { it.nameRu = ru[it.id]; it.ruIsFallback = false; applied++ }
    }
    console.log(`RU overlay applied to ${applied} exercises`)
  }

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
}

// Only fetch + rebuild when run directly (node scripts/build-catalog.mjs); importing
// the module (tests, the perImplement reapply) gets the pure helpers with no side effects.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run scripts/build-catalog.test.mjs`
Expected: PASS — the import resolves instantly (no network; guard skips `main`) and all cases pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-catalog.mjs scripts/build-catalog.test.mjs
git commit -m "feat(catalog): perImplement heuristic + import-safe run-guard"
```

---

### Task 7: Tag the existing `exercises.json` (offline, additive)

Apply `perImplementFor` to the current generated catalog without refetching wger — keeps the diff purely additive and avoids unrelated upstream drift (the updated `build-catalog.mjs` keeps future full rebuilds consistent).

**Files:**
- Modify: `src/data/exercises.json` (generated — regenerated here, not hand-edited)
- Test: `src/data/exercises.test.ts` (add invariant assertions)

**Interfaces:**
- Consumes: `perImplementFor` (Task 6).
- Produces: `exercises.json` where some dumbbell entries carry `"perImplement": true`.

- [ ] **Step 1: Write the failing invariant tests**

In `src/data/exercises.test.ts`, inside `describe('exercises.json', …)`, add:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/data/exercises.test.ts -t per-implement`
Expected: FAIL — `flags at least some dumbbell movements` fails (no entry has the field yet).

- [ ] **Step 3: Apply the heuristic to `exercises.json` (offline transform)**

Run this from the repo root (uses the exported helper; the run-guard means importing the script does NOT hit the network):

```bash
node --input-type=module -e "
import { readFileSync, writeFileSync } from 'node:fs'
import { perImplementFor } from './scripts/build-catalog.mjs'
const path = './src/data/exercises.json'
const items = JSON.parse(readFileSync(path, 'utf8'))
let n = 0
for (const it of items) { if (perImplementFor(it.nameEn, it.equipment)) { it.perImplement = true; n++ } }
writeFileSync(path, JSON.stringify(items, null, 2) + '\n')
console.log('tagged ' + n + ' dumbbell exercises perImplement')
"
```

Expected: prints `tagged N dumbbell exercises perImplement` with `N > 0`. (If it hangs or makes a network request, the Task 6 run-guard is wrong — fix it before continuing.)

- [ ] **Step 4: Verify the catalog tests pass**

Run: `npx vitest run src/data/exercises.test.ts`
Expected: PASS (new invariants + existing shape/id/lift tests).

- [ ] **Step 5: Sanity-check the diff is additive only**

Run: `git diff --stat src/data/exercises.json` and `git diff src/data/exercises.json | grep '^[-+]' | grep -v perImplement | grep -vE '^(\+\+\+|---)'`
Expected: the second command prints nothing — the ONLY changed lines add `"perImplement": true`. If other lines changed, you refetched by mistake; revert and rerun Step 3.

- [ ] **Step 6: Commit**

```bash
git add src/data/exercises.json src/data/exercises.test.ts
git commit -m "feat(catalog): tag two-dumbbell lifts perImplement in exercises.json"
```

---

### Task 8: Wire the flag into the three screens

Pass `perImplement` to `setWeightDisplay` in History and per-exercise history; show an `lb · ea` weight-column header in the logger. No unit tests (DOM render); verified by the type-checker + a manual browser pass.

**Files:**
- Modify: `src/screens/history.ts`
- Modify: `src/screens/exercise-history.ts`
- Modify: `src/screens/logging.ts`

**Interfaces:**
- Consumes: `WorkoutExercise.perImplement`, `ExerciseOccurrence.perImplement`.

- [ ] **Step 1: History — pass the flag**

In `src/screens/history.ts`, in the expanded-set loop, change the row text line:

```ts
          row.textContent = `${done} ${setWeightDisplay(s.weightLb, ex.equipment, unit, ex.perImplement)} × ${repStr}`
```

- [ ] **Step 2: Per-exercise history — pass the flag**

In `src/screens/exercise-history.ts`, in `card(o)`'s set loop, change:

```ts
      row.textContent = `${setWeightDisplay(s.weightLb, o.equipment, unit, o.perImplement)} × ${repStr}`
```

- [ ] **Step 3: Logger — `lb · ea` header for per-implement exercises**

In `src/screens/logging.ts`, in `exerciseHtml`, change the weight column header in `.lg-thead`:

```ts
      <div class="lg-thead"><span>Set</span><span class="r">${ex.perImplement ? 'lb · ea' : 'lb'}</span><span class="r">${ex.isTimed ? 'Sec' : 'Reps'}</span><span class="r">✓</span><span></span></div>
```

- [ ] **Step 4: Verify the type-check + build pass**

Run: `npx tsc --noEmit && npm run build`
Expected: both succeed, no errors.

- [ ] **Step 5: Manual browser verification (phone width ~390px)**

Per `CLAUDE.md` + the local-verify memory: empty `.env.local` to bypass the auth gate, seed a finished workout with a per-implement dumbbell exercise into `localStorage` (`liftinglog:workouts`), hard-reload, and confirm at ~390px with **zero console errors**:
- History expanded row shows e.g. `20 kg each × 10`; collapsed `Total lifted` and expanded `Volume` reflect the ×2 (a 20 kg × 10 set → Volume 400 kg, not 200).
- Tapping the exercise name opens per-exercise history showing `… each`.
- Starting a logging session for a per-implement coach lift shows the weight column header `lb · ea`.

- [ ] **Step 6: Commit**

```bash
git add src/screens/history.ts src/screens/exercise-history.ts src/screens/logging.ts
git commit -m "feat(ui): show 'each' + 'lb · ea' for per-implement dumbbell lifts"
```

---

### Task 9: Update docs & skills (CLAUDE.md keep-in-sync mandate)

**Files:**
- Modify: `CLAUDE.md`
- Modify: `scripts/build-catalog.mjs` (header comment only — the `perImplementFor` doc is already in Task 6; add a one-line pointer to the override path if not present)
- Modify: `.claude/skills/update-program/references/parsing-rules.md`
- Modify: `README.md`

- [ ] **Step 1: CLAUDE.md — keep-in-sync table + bullets**

In the keep-skills-in-sync table row for catalog data, extend the "Update…" cell to mention `perImplementFor` alongside `classifyEquip`/`restFor`. In the Conventions list, extend the volume/`load.ts` bullet and the `logger-model.ts` key-files line to note that a per-implement (two-dumbbell) exercise displays " each" and counts ×2 in volume, and that `setWeightDisplay`/`setLoadLb` take a `perImplement` arg. Add a sentence to the `exercise-picker`/catalog key-files area noting `CatalogExercise.perImplement` is set by the `build-catalog.mjs` heuristic (override via `catalog-extras.json`).

Concretely, append to the existing dumbbell/equipment convention area a bullet:

```md
- **Per-implement (two-dumbbell) lifts.** A `perImplement` exercise (coach flag from
  `program.json`, or the `build-catalog.mjs` heuristic for catalog lifts) is logged as
  the **per-dumbbell** weight but displays " each" (`setWeightDisplay`) and counts
  **both bells (×2)** in volume (`setLoadLb`/`exerciseVolumeLb`). The trainer log adds
  `(кажд.)` (no doubling — the coach prescribes per-dumbbell). e1RM is barbell-only, so
  it is unaffected. Correct a catalog misclassification via `scripts/catalog-extras.json`.
```

- [ ] **Step 2: parsing-rules.md — note the downstream effect**

In `.claude/skills/update-program/references/parsing-rules.md`, in the schema section where `perImplement` is described, add a sentence: `perImplement now also flows into the logger — it adds an "each" label, doubles volume, and marks the trainer log; the catalog sets it via build-catalog.mjs's perImplementFor heuristic.`

- [ ] **Step 3: README.md — Exercise catalog section**

In `README.md`, in the "Exercise catalog" section, add a sentence: `Two-dumbbell movements are auto-detected (dumbbell, excluding goblet / single-arm / one-arm) and marked perImplement, so the logger shows "each" and counts both dumbbells in volume; override via scripts/catalog-extras.json.`

- [ ] **Step 4: Verify docs reference real symbols**

Run: `rg -n "perImplement" CLAUDE.md README.md .claude/skills/update-program/references/parsing-rules.md scripts/build-catalog.mjs src/lib/logger-model.ts`
Expected: each mention lines up with the actual `perImplement` / `perImplementFor` / `setLoadLb` / `setWeightDisplay` symbols in the code.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md README.md .claude/skills/update-program/references/parsing-rules.md scripts/build-catalog.mjs
git commit -m "docs: document per-implement dumbbell handling"
```

---

### Task 10: Final full verification

- [ ] **Step 1: Full test suite**

Run: `npm run test`
Expected: all suites PASS (including the new `setWeightDisplay`, volume, threading, trainerLog, `perImplementFor`, and `exercises.json` invariant cases).

- [ ] **Step 2: Full build**

Run: `npm run build`
Expected: `tsc` clean, `vite build` succeeds.

- [ ] **Step 3: Confirm the working tree is clean and the branch is ready**

Run: `git status` and `git log --oneline main..HEAD`
Expected: clean tree; commits for Tasks 1–9 present. Ready to open a PR (per the branch-PR workflow).

---

## Self-Review

**Spec coverage:**
- Decision 1 (display "each") → Task 2 (`setWeightDisplay`) + Task 8 (wire screens). ✓
- Decision 2 (volume ×2) → Task 3. ✓
- Decision 3 (coach flag + catalog heuristic) → Task 4 (thread coach + catalog) + Task 6 (heuristic) + Task 7 (apply to data). ✓
- Decision 4 (history stays ×1) → no migration task; old workouts carry no flag, so `setLoadLb`/`setWeightDisplay` default to ×1 / no label. ✓ (implicit, documented in spec)
- Spec §4 logger hint → Task 8 Step 3. ✓
- Spec §6 (e1RM comment) → intentionally dropped: e1RM is barbell-only (`e1rm.ts:39`), so `perImplement` never reaches it. Noted in Global Constraints. ✓
- Spec §7 (trainer log `(кажд.)`) → Task 5. ✓
- Spec testing list → Tasks 2–7 each add the listed cases; the `perImplementFor` name-variant cases live in `scripts/build-catalog.test.mjs` (Task 6) because tsc can't see `scripts/` from `src`. ✓
- Spec docs list → Task 9. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code; every command has expected output. ✓

**Type consistency:** `perImplement?: boolean` on `WorkoutExercise`/`CatalogExercise` (optional) and `perImplement: boolean` on `ExerciseOccurrence` (required, always set via `!!ex.perImplement`). `setWeightDisplay(…, perImplement = false)` and `setLoadLb(…, perImplement = false)` — 4th/3rd optional params, all call sites updated (history, exercise-history, exerciseVolumeLb). `perImplementFor(nameEn, equip)` named identically in the script, its test, and the reapply command. ✓
