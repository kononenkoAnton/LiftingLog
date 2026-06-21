# Frequently-used exercises in the picker — design

**Date:** 2026-06-20 · **Value:** Medium · **Effort:** S–M.
**Branch:** `feat/frequently-used-picker` (off `main`).

## Goal

In the add-exercise picker, pin previously-used exercises to the top in a
**"Frequently used"** section, each showing a usage count (e.g. `Bench Press (12)`),
and remove those items from the A–Z list below (dedup). Helps the user re-add the
lifts they actually do without scrolling the full catalog.

## Count rule (locked)

- Count = **number of times an exercise occurs across FINISHED workouts**. One
  occurrence = one `WorkoutExercise` entry. The same exercise twice in one session
  ⇒ **+2** (per user: "could be same exercise multiple times in a session, in this
  case + amount").
- **Computed live** on every picker open from `listWorkouts()` — there is no stored
  counter. This makes the user's rules fall out for free:
  - Finishing a session adds its exercises to the tally.
  - Deleting a finished workout drops its contribution next open.
  - Removing an exercise before finishing never counts it (the finish step already
    drops exercises with zero done sets, so it's absent from the finished workout).
  - An exercise whose count is 0 simply isn't in the frequent section.
- **Finished-only:** `active`/`cancelled` workouts don't count.
- `lastUsedAt` per exercise = the workout's `endedAt ?? startedAt` (ISO-8601, so plain
  string comparison is chronological — no Date parsing).

## Identity / matching (locked)

Picker-added exercises store `exerciseRef = catalog.id` (`catalogToWorkoutExercise`),
but coach-prescribed program lifts use `exerciseRef = coach:<slug(nameEn)>` and carry
no catalog id. The user wants **program lifts counted too**, so matching is:

1. **Exact id** — if `we.exerciseRef` is a known catalog id, use it.
2. **Normalized name/alias** — else match `we.nameEn`, then `we.nameRu`, against each
   catalog entry's `nameEn`/`nameRu`/`aliasesEn`/`aliasesRu`, all run through
   `normalizeForSearch` (lowercase, ё→е fold, trim — the catalog's existing
   Cyrillic-safe normalizer).
3. **Miss** → the occurrence is ignored (no catalog row to attribute it to).

On ambiguity (two catalog entries normalizing to the same name/alias), **first wins**
when the name→id index is built. Acceptable for v1.

## Sort (locked)

Frequent section ordered by **count desc → lastUsedAt desc → name asc**.

## Architecture

All logic is pure and unit-tested; the picker stays a thin renderer (matches the
project's "tested lib, thin DOM" seam).

### 1. `src/lib/catalog.ts` — `makeUsageResolver`

```ts
// Build once per catalog. Maps a logged exercise → its catalog id (or null).
// Structural param (not WorkoutExercise) to avoid a catalog→logger-types coupling.
export function makeUsageResolver(
  catalog: CatalogExercise[],
): (we: { exerciseRef: string; nameEn: string; nameRu: string }) => string | null
```

- Internally: a `Map<id, exercise>` for exact-id lookup, and a
  `Map<normalizedName, id>` (first-wins) over every name + alias for the fallback.

### 2. `src/lib/logger-model.ts` — `tallyUsage` (beside `lastActualFor`/`allSetsForRef`)

```ts
export interface ExerciseUsage { count: number; lastUsedAt: string } // ISO

// Walk FINISHED workouts; +1 per occurrence keyed by keyOf(ex); track latest date.
export function tallyUsage(
  history: Workout[],
  keyOf: (we: WorkoutExercise) => string | null,
): Record<string, ExerciseUsage>
```

- `WorkoutExercise` is assignable to the resolver's structural param, so the picker
  passes `makeUsageResolver(catalog)` straight in as `keyOf`.
- `lastUsedAt` keeps the max ISO string seen for the key.

### 3. `src/lib/catalog.ts` — `groupByUsage`

```ts
export interface UsageGroups { frequent: CatalogExercise[]; groups: AlphaGroup[] }

// frequent = items with usage[id].count > 0, sorted count desc → lastUsedAt desc → name.
// groups   = groupAlphabetical() of the REMAINING (count 0) items — the dedup.
export function groupByUsage(
  list: CatalogExercise[],
  lang: 'en' | 'ru',
  usage: Record<string, ExerciseUsage>,
): UsageGroups
```

- Reuses the existing `groupAlphabetical` for the A–Z portion.
- The picker reads `usage[e.id].count` to render the `(n)` badge — `groupByUsage`
  needn't echo the number back.

### 4. `src/components/exercise-picker.ts`

- On open (once, outside `render`): `const usage = tallyUsage(listWorkouts(),
  makeUsageResolver(all))`.
- In `render`, after `searchCatalog` + `filterCatalog`:
  `const { frequent, groups } = groupByUsage(filtered, lang, usage)`.
- Render order: **"Frequently used"** header (only if `frequent.length`) + its rows
  (each `nameOf(e)` followed by a `(n)` count span), then the existing letter groups.
- Selection / multi-select / search-focus-restore wiring is unchanged; frequent rows
  are ordinary `.picker-row` elements with `data-id`.
- Search/filter run **before** `groupByUsage`, so used matches float to the top of
  filtered results too (kept intentionally — surfaces frequent matches while typing).

### 5. Styling — `src/styles/app.css`

- A `.picker-freq` section header styled like `.picker-letter` (label: "Frequently
  used").
- A small muted `.picker-count` span for the `(12)`.

## Testing

- `logger-model.test.ts` — `tallyUsage`: counts occurrences; multiple-in-one-session
  adds (+2); finished-only (ignores active/cancelled); `lastUsedAt` = max date and
  uses `endedAt ?? startedAt`; unmatched key (`keyOf → null`) skipped; empty → `{}`.
- `catalog.test.ts` — `makeUsageResolver`: exact id, nameEn fallback, nameRu fallback,
  alias fallback, Cyrillic ё-fold match, miss → null, first-wins on duplicate names.
  `groupByUsage`: frequent sorted count desc → recency → name; deduped from groups;
  count-0 / empty usage → everything in A–Z and no frequent.
- Browser-verified @390px on seeded data: used lifts on top with counts, A–Z below
  without them, a coach program lift counted via name match; zero console errors.

## Skill / doc sync

Per CLAUDE.md's keep-skills-in-sync table: this touches no parser, schema, glossary,
plate math, catalog build, or rest heuristic — so no skill files change. Update the
`src/lib/catalog.ts`, `src/lib/logger-model.ts`, and `exercise-picker.ts` bullets in
CLAUDE.md's "Key files" to mention usage tallying / frequent-used grouping.

## Out of scope (YAGNI)

No schema or `program.json` change; no stored counters; no per-language "Frequently
used" label (picker chrome is English today); no "recent" vs "frequent" toggle; no
configurable section size / cap.
