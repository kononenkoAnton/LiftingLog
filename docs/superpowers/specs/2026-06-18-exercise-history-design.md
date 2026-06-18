# Per-exercise history drill-down — design

**Date:** 2026-06-18 · **Value:** High · **Effort:** S–M · Companion to Progress/Trends.
**Branch:** `feat/exercise-history`, stacked on `feat/progress-trends-e1rm` (PR #9).

## Goal

Tap an exercise name in **History** → a screen listing **all** that exercise's logged
sets over time (newest first), matched by exact `exerciseRef`. Generalizes
`lastActualFor` (the "last workout's done sets for a ref") to "all done sets for a
ref, across history."

## Locked decisions

- **Entry point:** exercise names in History become tappable → `#/exercise/:ref`
  (`exerciseRef` URL-encoded, decoded in the route).
- **Grouping:** exact `exerciseRef` (per-variant). Lift-*family* grouping already
  lives in Progress (regex on name); this view is the precise per-exercise log, and
  works for **any** exercise (accessories included), not just the 3 mains.

## Why exact ref (not family)

`exerciseRef = coach:<slug(nameEn)>` for prescribed lifts, the catalog id for added
ones. It's the same stable identity `lastActualFor` already keys on, so this is a
true generalization. Variants with different names (e.g. "Bench Press, 1s pause" vs
"Bench Press") are *different* refs and stay separate — correct for a per-exercise
log; the family-level rollup is Progress's job.

## Architecture

### 1. `src/lib/logger-model.ts` (pure, tested) — beside `lastActualFor`

```ts
export interface ExerciseOccurrence {
  dateIso: string            // workout.startedAt
  nameEn: string; nameRu: string
  equipment: Equipment
  isTimed: boolean
  sets: LoggedSet[]          // that workout's DONE sets for the ref
}
// One entry per FINISHED workout that has ≥1 done set for `ref`, newest first.
export function allSetsForRef(history: Workout[], ref: string): ExerciseOccurrence[]
```

### 2. `src/screens/exercise-history.ts`

`renderExerciseHistory(el, ref)`: title = newest occurrence's `nameEn` (+ `nameRu`
subtitle); shared kg/lb toggle (`liftinglog:unit`); per-session cards (date + set
rows) rendering each set exactly like History —
`${done} ${setWeightDisplay(s.weightLb, equipment, unit)} × ${reps}${isTimed?'s':''}`.
Empty → "No logged sets yet." Built with `createElement` + `textContent` (names are
trusted, but mirror History's safe DOM construction).

### 3. Routes & nav

- `src/main.ts`: `route('/exercise/:ref', (el, p) => renderExerciseHistory(el, decodeURIComponent(p.ref)))`.
- `src/screens/history.ts`: the exercise name (`hist-exname`) becomes an
  `<a class="hist-exname hist-exlink" href="#/exercise/<encoded ref>">`.

### 4. Styling

`src/styles/app.css`: `.hist-exlink` affordance (pointer + a `›` hint) and the
exercise-history screen (date headers + set rows; reuse `.hist-*` patterns).

## Testing

- `logger-model.test.ts`: `allSetsForRef` — newest-first ordering, finished-only,
  done-sets-only (skip occurrences with no done set), exact-ref match (different ref
  excluded), carries date/name/equipment/isTimed/sets, empty → `[]`.
- Browser-verified @390px on seeded data: tap an exercise in History → all sets over
  time; kg/lb toggle; zero console errors.

## Out of scope (YAGNI)

No sparkline here (Progress owns trends), no lift-family grouping, no schema/data
change, no edit-from-this-screen.
