# Dumbbell per-implement: "each" label + ×2 volume

**Date:** 2026-06-21
**Status:** Approved design — ready for implementation plan

## Problem

When logging a two-dumbbell movement (e.g. incline dumbbell press), the user enters
the weight of **one** dumbbell. Today the app:

- **Displays** that single-dumbbell number with no annotation
  (`setWeightDisplay(44, 'dumbbell', 'kg')` → `"20 kg"`).
- **Counts** only one dumbbell in volume (`exerciseVolumeLb` → `setLoadLb` returns
  the weight as-is; 50 lb × 10 → 500, not 1000).

Both are ambiguous/incorrect for two-handed dumbbell work: the display doesn't say
"each", and the volume (total weight lifted) understates two-handed work by half.

A "two dumbbells" signal already exists on the **coach** side — `Exercise.perImplement`
(set in `program.json`, hand-curated in `parse-program.mjs`'s `GLOSSARY`; the coach
schedule screen `session.ts` already renders " each" from it) — but it is **dropped**
when a coach exercise is turned into a `WorkoutExercise`, so the logger, History,
per-exercise history, and volume math are all blind to it. User-added (catalog) lifts
carry no such flag at all.

## Decisions (from brainstorming)

1. **Display** a two-dumbbell set as the single-dumbbell number **plus an "each"
   label** (e.g. `20 kg each × 10`). Keep gym convention (the number stamped on one
   bell); do not show a combined total.
2. **Volume** for a two-dumbbell movement **counts both bells (×2)**:
   `weight × count(2) × reps`.
3. **Scope:** coach-prescribed lifts get the behavior from the existing curated
   `perImplement` flag; **user-added catalog dumbbell lifts** get it from a name
   heuristic in `build-catalog.mjs` (auto-detect).
4. **History already logged** carries no flag and therefore keeps rendering at ×1
   (one bell, no "each"). We cannot retroactively know which past sets were
   two-handed. Only new workouts get the new behavior. Accepted.

## Approach

Thread a single optional boolean `perImplement?: boolean` onto `WorkoutExercise` from
**both** origins (coach `Exercise`, catalog `CatalogExercise`), and read it in exactly
three consumers:

- **Display** → append `" each"`.
- **Volume** → multiply the set's load by 2.
- (everything else unchanged).

Per-dumbbell numbers remain exactly what the user enters and what is stored in
`LoggedSet.weightLb`. No `LoggedSet`/storage shape change — the flag lives on the
exercise, not the set.

### Why volume doubles but e1RM does not

- **Volume** = total weight lifted = work done. Moving two 20 kg bells for 10 reps is
  400 kg of load, not 200 — so ×2 is correct.
- **e1RM** (estimated 1-rep max) is a per-implement strength figure: a "70 lb dumbbell
  press" 1RM is 70, not 140. Doubling it would inflate the strength trend. `e1rm.ts`
  therefore stays unchanged (keeps using the per-set weight as-is). A one-line comment
  will record this on purpose so a future reader doesn't "fix" it.

The flag is keyed on directly (not gated on `equipment === 'dumbbell'`), matching
`session.ts`. In practice it is only ever set on dumbbell exercises: all 24
`perImplement` entries in `program.json` are dumbbells, and the catalog heuristic only
sets it for `equipment === 'dumbbell'`.

## Changes by area

### 1. Data model (types)

- `src/lib/logger-types.ts` — add `perImplement?: boolean` to `WorkoutExercise`.
- `src/data/catalog-types.ts` — add `perImplement?: boolean` to `CatalogExercise`.
- `src/lib/logger-model.ts` — add `perImplement: boolean` to the `ExerciseOccurrence`
  interface (so per-exercise history can render the label).
- `src/data/types.ts` — `Exercise.perImplement?` already exists. No change.

### 2. Catalog heuristic (`scripts/build-catalog.mjs`)

- Add `perImplementFor(nameEn, equip)` → `true` when `equip === 'dumbbell'` **and**
  `!/goblet|single[-\s]?arm|one[-\s]?arm/i.test(nameEn)`.
- In `build()`, set `perImplement: true` on the item only when the helper returns
  true (omit the key otherwise — keeps `exercises.json` additive/clean).
- **Override path:** `catalog-extras.json` entries fully replace an item, so a
  misclassified lift (the heuristic is cruder than the coach's curation — e.g. the
  coach marks "DB Row" `per: false`) can be corrected by supplying an override entry
  with the desired `perImplement`. Documented, not pre-populated.
- **Regeneration:** `npm run build:catalog` refetches all of wger and can introduce
  unrelated drift in `exercises.json`. Keep the committed diff focused on
  `perImplement` additions only — revert any unrelated wger churn before committing.

### 3. Threading the flag (`src/lib/logger-model.ts`)

- `buildOne(e)` → include `perImplement: e.perImplement` (carry coach flag).
- `catalogToWorkoutExercise(c)` → include `perImplement: c.perImplement`.
- `allSetsForRef(...)` → set `perImplement: !!ex.perImplement` on each occurrence.
- `swapVariant` — alts are bodyweight, so `perImplement` is falsy; no special case.

### 4. Display — single-dumbbell number + "each"

- `setWeightDisplay(lb, equipment, unit, perImplement?)` — append `" each"` when the
  flag is set (e.g. `20 kg each`, `44 lb each`). The "BW" and "(… w/ bar)" branches
  are unaffected (perImplement never co-occurs with bodyweight/barbell in practice).
- `src/screens/history.ts` — pass `ex.perImplement` as the 4th arg.
- `src/screens/exercise-history.ts` — pass `o.perImplement` as the 4th arg.
- `src/screens/logging.ts` — for a perImplement exercise, render the weight column
  header as `lb · ea` instead of `lb`, so the user knows they enter one bell. (The
  editable inputs stay per-dumbbell.)
- `src/screens/session.ts` — coach schedule screen already renders " each"; unchanged.

### 5. Volume — ×2 (`src/lib/logger-model.ts`)

- `setLoadLb(weightLb, equipment, perImplement?)` — multiply the computed load by 2
  when `perImplement` is set.
- `exerciseVolumeLb(ex)` — pass `ex.perImplement` into `setLoadLb`.
- `workoutVolumeLb` unchanged (sums `exerciseVolumeLb`). Per-training total
  (`history.ts`) and per-exercise volume pick up the ×2 automatically.

### 6. e1RM — unchanged

- `src/lib/e1rm.ts` — no behavior change. Add a one-line comment noting that
  perImplement is intentionally NOT applied here (strength is per-implement).

### 7. Trainer log (`trainerLog` in `logger-model.ts`)

- Coach prescribes per-dumbbell and the user logs per-dumbbell, so the report matches
  with **no doubling**. Append a Russian marker for clarity: a perImplement set with a
  weight prints `30 (кажд.) × 10` (`кажд.` = «каждая», each). Bodyweight `б/в`
  branch unaffected.

## Testing

Unit tests (Vitest, extend `logger-model.test.ts` unless noted):

- `setWeightDisplay` with `perImplement` → `"20 kg each"` (kg) and `"44 lb each"` (lb).
- `setWeightDisplay` without the flag → unchanged (regression guard).
- `exerciseVolumeLb` for a perImplement dumbbell → doubled
  (`set(50, 10)` → 1000); non-perImplement dumbbell still 500.
- `workoutVolumeLb` mixes a perImplement and a plain exercise correctly.
- `buildOne` carries `perImplement` from a coach `Exercise`.
- `catalogToWorkoutExercise` carries `perImplement` from a `CatalogExercise`.
- `allSetsForRef` surfaces `perImplement` on the occurrence.
- `trainerLog` prints the `(кажд.)` marker for a perImplement set and not otherwise.
- `perImplementFor` heuristic (new test): `"Dumbbell Bench Press"` → true;
  `"Dumbbell Goblet Squat"`, `"Single-Arm Dumbbell Row"`, `"One-Arm Dumbbell Row"`,
  any non-dumbbell → false. (Export the helper from `build-catalog.mjs`, or test a
  small extracted pure function.)

Keep `npm run test` green; `npm run build` clean (type-check passes for the widened
signatures).

## Docs / skills to update (CLAUDE.md keep-in-sync mandate)

- `CLAUDE.md` — keep-skills-in-sync table row for `build-catalog.mjs`
  (`classifyEquip`/`restFor` → add `perImplementFor`); the `load.ts`/volume bullet
  (note perImplement doubles volume); the logger-model bullet (`exerciseVolumeLb`).
- `scripts/build-catalog.mjs` header/comments — document `perImplementFor` + the
  `catalog-extras.json` override for corrections.
- `.claude/skills/update-program/references/parsing-rules.md` — note `perImplement`
  now flows into the logger/volume/display (schema section).
- `README.md` — "Exercise catalog" section: mention per-implement auto-detection.

## Out of scope / non-goals

- Retroactively flagging already-finished workouts (kept at ×1; can't infer).
- A manual per-exercise "2 dumbbells" toggle in the logger (rejected in favour of
  coach flag + catalog heuristic).
- Showing a combined total weight in the display (rejected; keep per-bell convention).
- Any change to e1RM, plate math, or barbell/bodyweight handling.
