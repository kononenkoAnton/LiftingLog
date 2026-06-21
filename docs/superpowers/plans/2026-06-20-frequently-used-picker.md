# Frequently-used Exercises in the Picker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin previously-used exercises to the top of the add-exercise picker in a "Frequently used" section with a usage count (e.g. `Bench Press (12)`), removing them from the A–Z list below.

**Architecture:** All logic is pure and unit-tested; the picker stays a thin renderer (the project's "tested lib, thin DOM" seam). A resolver maps a logged exercise → catalog id (exact id, else normalized name/alias). A tally counts occurrences across finished workouts. A grouping function partitions the catalog into frequent (sorted) + A–Z (deduped). Counts are computed live on every picker open — no stored counter.

**Tech Stack:** Vite + TypeScript (vanilla), Vitest. Spec: `docs/superpowers/specs/2026-06-20-frequently-used-picker-design.md`.

## Global Constraints

- **Pure logic is unit-tested; DOM stays thin.** New lib functions get Vitest coverage; keep `npm run test` green.
- **`innerHTML` only with trusted static data.** Catalog names are trusted; the usage count is a number — both safe to interpolate. Never put user-entered text in an `innerHTML` template.
- **Cyrillic gotcha:** never use JS `\w`/`\b` on Russian text. Reuse `normalizeForSearch` (lowercase + ё→е fold + trim) for any name matching.
- **Editable fields must be `font-size: ≥16px`** — N/A here (no new inputs), just don't shrink `.picker-search`.
- **Count semantics (locked):** count = number of times an exercise occurs across **finished** workouts; same exercise twice in one session ⇒ +2. Active/cancelled workouts don't count.
- **Matching (locked):** exact `exerciseRef === catalog.id` first, else normalized nameEn → nameRu → alias match (so coach `coach:<slug>` lifts count). First catalog entry wins on duplicate normalized name.
- **Sort (locked):** frequent section ordered by count desc → `lastUsedAt` desc → name asc.

## File Structure

- `src/lib/catalog.ts` — add `makeUsageResolver` (Task 1) and `groupByUsage` + `UsageGroups` (Task 3). Pure, no DOM.
- `src/lib/logger-model.ts` — add `ExerciseUsage` + `tallyUsage` (Task 2), beside `lastActualFor`/`allSetsForRef`.
- `src/components/exercise-picker.ts` — wire usage tally + frequent section into render (Task 4).
- `src/styles/app.css` — `.picker-freq` header + `.picker-count` badge (Task 4).
- Tests: `src/lib/catalog.test.ts` (Tasks 1, 3), `src/lib/logger-model.test.ts` (Task 2).

Import direction: `catalog.ts` does a **type-only** `import type { ExerciseUsage } from './logger-model'`. `logger-model.ts` does NOT import `catalog.ts` (verified), so there is no runtime cycle.

---

### Task 1: `makeUsageResolver` in `catalog.ts`

Maps a logged exercise to the catalog id it belongs to (or null), so both picker-added and coach-prescribed lifts can be tallied.

**Files:**
- Modify: `src/lib/catalog.ts` (add export at end)
- Test: `src/lib/catalog.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: existing `normalizeForSearch`, `CatalogExercise`.
- Produces: `makeUsageResolver(catalog: CatalogExercise[]): (we: { exerciseRef: string; nameEn: string; nameRu: string }) => string | null`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/catalog.test.ts`. Add `makeUsageResolver` to the import on line 2:

```ts
import { searchCatalog, filterCatalog, groupAlphabetical, normalizeForSearch, makeUsageResolver } from './catalog'
```

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: FAIL — `makeUsageResolver is not a function` (or import error).

- [ ] **Step 3: Implement `makeUsageResolver`**

Append to `src/lib/catalog.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: PASS (all `makeUsageResolver` cases green, existing cases still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/catalog.ts src/lib/catalog.test.ts
git commit -m "feat(picker): resolver mapping a logged exercise to a catalog id"
```

---

### Task 2: `tallyUsage` + `ExerciseUsage` in `logger-model.ts`

Counts how often each key (catalog id) was used across finished workouts, tracking the latest date for the recency tiebreak.

**Files:**
- Modify: `src/lib/logger-model.ts` (add after `allSetsForRef`, ~line 250)
- Test: `src/lib/logger-model.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: existing `Workout`, `WorkoutExercise` types.
- Produces:
  - `interface ExerciseUsage { count: number; lastUsedAt: string }`
  - `tallyUsage(history: Workout[], keyOf: (we: WorkoutExercise) => string | null): Record<string, ExerciseUsage>`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/logger-model.test.ts`. Add `tallyUsage` to the import on line 2 (inside the existing `from './logger-model'` list). The `wk`/`doneSet` helpers from the `lastActualFor` block are in scope.

```ts
describe('tallyUsage', () => {
  const ex = (ref: string) => ({ exerciseRef: ref, nameEn: 'X', nameRu: 'X', equipment: 'barbell' as const, isCoachPrescribed: false, coachTarget: '', sets: [doneSet(100, 5)] })
  const keyOf = (we: WorkoutExercise) => we.exerciseRef

  it('returns {} for empty history', () => {
    expect(tallyUsage([], keyOf)).toEqual({})
  })
  it('counts one occurrence per finished workout that has the exercise', () => {
    const w1 = wk({ id: 'a', endedAt: '2026-06-01T00:00:00.000Z', exercises: [ex('bench')] })
    const w2 = wk({ id: 'b', endedAt: '2026-06-08T00:00:00.000Z', exercises: [ex('bench')] })
    expect(tallyUsage([w1, w2], keyOf)['bench'].count).toBe(2)
  })
  it('adds the amount when the same exercise appears twice in one workout', () => {
    const w = wk({ exercises: [ex('bench'), ex('bench')] })
    expect(tallyUsage([w], keyOf)['bench'].count).toBe(2)
  })
  it('ignores active and cancelled workouts', () => {
    const active = wk({ status: 'active', exercises: [ex('bench')] })
    const cancelled = wk({ status: 'cancelled', exercises: [ex('bench')] })
    const finished = wk({ status: 'finished', exercises: [ex('bench')] })
    expect(tallyUsage([active, cancelled, finished], keyOf)['bench'].count).toBe(1)
  })
  it('tracks lastUsedAt as the most recent endedAt', () => {
    const older = wk({ id: 'a', endedAt: '2026-06-01T00:00:00.000Z', exercises: [ex('bench')] })
    const newer = wk({ id: 'b', endedAt: '2026-06-20T00:00:00.000Z', exercises: [ex('bench')] })
    expect(tallyUsage([newer, older], keyOf)['bench'].lastUsedAt).toBe('2026-06-20T00:00:00.000Z')
  })
  it('falls back to startedAt when endedAt is null', () => {
    const w = wk({ endedAt: null, startedAt: '2026-06-05T00:00:00.000Z', exercises: [ex('bench')] })
    expect(tallyUsage([w], keyOf)['bench'].lastUsedAt).toBe('2026-06-05T00:00:00.000Z')
  })
  it('skips exercises whose key resolves to null', () => {
    const w = wk({ exercises: [ex('bench'), ex('coach:unknown')] })
    const out = tallyUsage([w], (we) => (we.exerciseRef === 'coach:unknown' ? null : we.exerciseRef))
    expect(out['coach:unknown']).toBeUndefined()
    expect(out['bench'].count).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/logger-model.test.ts`
Expected: FAIL — `tallyUsage is not a function` (or import error).

- [ ] **Step 3: Implement `ExerciseUsage` + `tallyUsage`**

Insert into `src/lib/logger-model.ts` immediately after `allSetsForRef` (after the closing brace on ~line 250):

```ts
/** Per-catalog-id usage rolled up from finished workouts (for the picker's "frequently used"). */
export interface ExerciseUsage {
  count: number        // total occurrences across finished workouts (same lift twice in one ⇒ +2)
  lastUsedAt: string   // ISO of the most recent finished workout that used it
}

/**
 * Tally how often each exercise was used across FINISHED workouts. `keyOf` maps a logged
 * exercise to a stable key (the catalog id, via `makeUsageResolver`) or null to skip it.
 * Every occurrence counts, so the same exercise twice in one workout adds 2. `lastUsedAt`
 * keeps the latest `endedAt ?? startedAt` (ISO-8601 strings compare chronologically).
 */
export function tallyUsage(
  history: Workout[],
  keyOf: (we: WorkoutExercise) => string | null,
): Record<string, ExerciseUsage> {
  const out: Record<string, ExerciseUsage> = {}
  for (const w of history) {
    if (w.status !== 'finished') continue
    const at = w.endedAt ?? w.startedAt
    for (const ex of w.exercises) {
      const k = keyOf(ex)
      if (!k) continue
      const prev = out[k]
      out[k] = {
        count: (prev?.count ?? 0) + 1,
        lastUsedAt: prev && prev.lastUsedAt > at ? prev.lastUsedAt : at,
      }
    }
  }
  return out
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/logger-model.test.ts`
Expected: PASS (all `tallyUsage` cases green, existing cases still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/logger-model.ts src/lib/logger-model.test.ts
git commit -m "feat(picker): tally exercise usage across finished workouts"
```

---

### Task 3: `groupByUsage` in `catalog.ts`

Partitions a catalog list into a sorted "frequent" list and the deduped A–Z groups.

**Files:**
- Modify: `src/lib/catalog.ts` (add type-only import of `ExerciseUsage`; add export at end)
- Test: `src/lib/catalog.test.ts` (append a `describe`)

**Interfaces:**
- Consumes: `ExerciseUsage` (Task 2), existing `groupAlphabetical`, `AlphaGroup`, `CatalogExercise`.
- Produces:
  - `interface UsageGroups { frequent: CatalogExercise[]; groups: AlphaGroup[] }`
  - `groupByUsage(list: CatalogExercise[], lang: 'en' | 'ru', usage: Record<string, ExerciseUsage>): UsageGroups`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/catalog.test.ts`. Add `groupByUsage` to the import on line 2:

```ts
import { searchCatalog, filterCatalog, groupAlphabetical, normalizeForSearch, makeUsageResolver, groupByUsage } from './catalog'
```

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: FAIL — `groupByUsage is not a function`.

- [ ] **Step 3: Implement `groupByUsage`**

In `src/lib/catalog.ts`, add the type import near the top (after the existing `import type { Equipment } ...` line):

```ts
import type { ExerciseUsage } from './logger-model'
```

Append at the end of the file:

```ts
export interface UsageGroups { frequent: CatalogExercise[]; groups: AlphaGroup[] }

/**
 * Split the catalog into a "frequently used" list (count > 0, sorted count desc →
 * most-recent desc → name) and the alphabetical A–Z groups of everything else. Used items
 * appear only in `frequent` (dedup). `usage` is keyed by catalog id.
 */
export function groupByUsage(
  list: CatalogExercise[],
  lang: 'en' | 'ru',
  usage: Record<string, ExerciseUsage>,
): UsageGroups {
  const nameOf = (e: CatalogExercise) => (lang === 'ru' ? e.nameRu : e.nameEn)
  const locale = lang === 'ru' ? 'ru' : 'en'
  const used: CatalogExercise[] = []
  const rest: CatalogExercise[] = []
  for (const e of list) ((usage[e.id]?.count ?? 0) > 0 ? used : rest).push(e)
  const frequent = used.sort((a, b) => {
    const ua = usage[a.id], ub = usage[b.id]
    return (ub.count - ua.count)
      || ub.lastUsedAt.localeCompare(ua.lastUsedAt)
      || nameOf(a).localeCompare(nameOf(b), locale)
  })
  return { frequent, groups: groupAlphabetical(rest, lang) }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/catalog.test.ts`
Expected: PASS.

- [ ] **Step 5: Type-check the cross-module import**

Run: `npx tsc --noEmit`
Expected: no errors (the `import type { ExerciseUsage } from './logger-model'` resolves; no runtime cycle).

- [ ] **Step 6: Commit**

```bash
git add src/lib/catalog.ts src/lib/catalog.test.ts
git commit -m "feat(picker): groupByUsage — frequent section + deduped A–Z"
```

---

### Task 4: Wire the frequent section into the picker + styles + docs

Render the "Frequently used" section in the picker and style it. Browser-verified.

**Files:**
- Modify: `src/components/exercise-picker.ts`
- Modify: `src/styles/app.css` (near `.picker-letter`, line ~135)
- Modify: `CLAUDE.md` ("Key files" bullets for `catalog.ts`, `logger-model.ts`, `exercise-picker.ts`)

**Interfaces:**
- Consumes: `groupByUsage` (Task 3), `makeUsageResolver` (Task 1), `tallyUsage` (Task 2), `listWorkouts` (`src/lib/workouts.ts`).

- [ ] **Step 1: Update imports in `exercise-picker.ts`**

Replace the import on line 6:

```ts
import { loadCatalog, searchCatalog, filterCatalog, groupByUsage, makeUsageResolver } from '../lib/catalog'
```

Add below the existing imports (after line 8):

```ts
import { tallyUsage } from '../lib/logger-model'
import { listWorkouts } from '../lib/workouts'
```

- [ ] **Step 2: Build the usage tally once per open**

In `openExercisePicker`, right after `const all = loadCatalog()` (line 13), add:

```ts
const usage = tallyUsage(listWorkouts(), makeUsageResolver(all))
```

- [ ] **Step 3: Render the frequent section + deduped groups**

In `render`, replace the block that builds `groups` and the `.picker-list` markup. Replace:

```ts
      const groups = groupAlphabetical(list, lang)
      const nameOf = (e: CatalogExercise) => (lang === 'ru' ? e.nameRu : e.nameEn)
      const altOf = (e: CatalogExercise) => { const alt = lang === 'ru' ? e.nameEn : e.nameRu; return alt && alt !== nameOf(e) ? alt : '' }
```

with:

```ts
      const { frequent, groups } = groupByUsage(list, lang, usage)
      const nameOf = (e: CatalogExercise) => (lang === 'ru' ? e.nameRu : e.nameEn)
      const altOf = (e: CatalogExercise) => { const alt = lang === 'ru' ? e.nameEn : e.nameRu; return alt && alt !== nameOf(e) ? alt : '' }
      // count is a number, names are trusted catalog data — safe in this innerHTML template.
      const rowHtml = (e: CatalogExercise, count?: number) => `
        <div class="picker-row ${picked.has(e.id) ? 'on' : ''}" data-id="${e.id}">
          <div class="picker-av">${nameOf(e).charAt(0)}</div>
          <div class="picker-meta"><div class="t">${nameOf(e)}${count ? ` <span class="picker-count">(${count})</span>` : ''}</div>${altOf(e) ? `<div class="picker-ru">${altOf(e)}</div>` : ''}<div class="s">${e.bodyPart} · ${e.equipment}</div></div>
          <div class="picker-check">${picked.has(e.id) ? '✓' : ''}</div>
        </div>`
      const frequentHtml = frequent.length
        ? `<div class="picker-letter picker-freq">Frequently used</div>${frequent.map((e) => rowHtml(e, usage[e.id].count)).join('')}`
        : ''
      const groupsHtml = groups.map((g) => `
        <div class="picker-letter">${g.letter}</div>
        ${g.items.map((e) => rowHtml(e)).join('')}`).join('')
```

Then replace the `.picker-list` body (the `${groups.map(...)...}` expression on lines 52–62) with:

```ts
        <div class="picker-list" id="pkList">
          ${(frequentHtml + groupsHtml) || '<div class="picker-empty">No matches</div>'}
        </div>`
```

- [ ] **Step 4: Add the styles**

In `src/styles/app.css`, after the `.picker-letter` rule (line 135), add:

```css
.picker-freq{color:var(--mint)}
.picker-count{color:var(--dim);font-weight:600}
```

- [ ] **Step 5: Verify build + type-check + tests**

Run: `npx tsc --noEmit && npm run test`
Expected: tsc clean; all tests pass (note `groupAlphabetical` may now be unused in the picker — if tsc flags it, it's already gone from the import in Step 1, so no error).

- [ ] **Step 6: Browser-verify @390px**

Per the local-verify workflow (empty `.env.local` to bypass the Supabase gate; seed `localStorage`, hard-reload):

1. `npm run dev`; open at ~390px width.
2. Seed `liftinglog:workouts` with a couple of finished workouts: one with a picker-added exercise (e.g. `exerciseRef: 'leg-press'`) appearing twice across workouts, and one **coach** exercise (`exerciseRef: 'coach:bench-press'`, `nameEn: 'Bench Press (Barbell)'`) so the name-match path is exercised. Hard-reload.
3. Open the add-exercise picker (logging screen → "Add exercise", or the Exercise-catalog screen → "Open picker").
4. Confirm: a **"Frequently used"** header at top; used lifts listed with `(n)` counts; the coach Bench Press counted via name match; those items **not** repeated in the A–Z groups; typing a search still floats used matches to the top; **zero console errors**.

- [ ] **Step 7: Update CLAUDE.md "Key files"**

Edit the three bullets:
- `src/lib/catalog.ts` — append: "+ `makeUsageResolver`/`groupByUsage` for the picker's frequently-used section (exact-id then normalized-name match; frequent sorted by count→recency→name, deduped from A–Z)".
- `src/lib/logger-model.ts` — append to its list: "`tallyUsage` = per-catalog-id usage `{count,lastUsedAt}` over finished workouts (every occurrence counts; same lift twice in a session ⇒ +2)".
- `src/components/exercise-picker.ts` — append: "shows a **Frequently used** section on top (usage count `(n)`, sorted by frequency then recency) and removes those items from the A–Z list (dedup); counts computed live via `tallyUsage`+`makeUsageResolver`".

- [ ] **Step 8: Commit**

```bash
git add src/components/exercise-picker.ts src/styles/app.css CLAUDE.md
git commit -m "feat(picker): frequently-used section with usage counts"
```

---

## Self-Review

**1. Spec coverage** — every spec section maps to a task:
- Count rule (finished-only, +occurrence, live) → Task 2 `tallyUsage` + Task 4 (live on open).
- Identity/matching (id → name → alias, first-wins) → Task 1 `makeUsageResolver`.
- Sort (count→recency→name) + dedup → Task 3 `groupByUsage`.
- "Frequently used" section + `(n)` badge + search interaction → Task 4.
- Styling → Task 4 Step 4. Tests → Tasks 1–3. Skill/doc sync → Task 4 Step 7.
- Edge cases: no history → Task 3 empty-usage test; badge only in frequent → Task 4 `rowHtml` (`count` omitted for A–Z); ё-fold → Task 1 test.

**2. Placeholder scan** — no TBD/TODO; all steps carry real code and exact commands. ✔

**3. Type consistency** — `ExerciseUsage { count; lastUsedAt }` defined in Task 2, consumed identically in Task 3 and read as `usage[e.id].count` in Task 4. `makeUsageResolver` returns `string | null`, matching `tallyUsage`'s `keyOf` param. `groupByUsage` returns `{ frequent, groups }`, destructured the same way in Task 4. ✔
