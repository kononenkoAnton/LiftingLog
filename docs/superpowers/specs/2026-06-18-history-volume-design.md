# History "weight lifted" (volume) — design

**Date:** 2026-06-18 · **Effort:** S · **Branch:** `feat/history-volume`, stacked on
`feat/exercise-history` (PR #10).

## Goal

In an expanded History workout, show **weight lifted per exercise** and **weight
lifted during the whole training** — counting the **full** weight (barbell includes
the bar).

## Counting rules

Volume = Σ (full weight × reps) over **done** sets, in lb (converted to the active unit):
- **Barbell** = plates **+ 45 lb bar** (an empty bar still = 45).
- **Dumbbell / machine / cable** = the logged weight as-is.
- **Bodyweight** = only *added* load (plain BW = 0; bodyweight isn't tracked).
- **Timed holds** → 0 (weight × seconds isn't tonnage).
- Sets with null / non-integer / <1 reps are skipped; null plates count as 0.

## Architecture

### `src/lib/logger-model.ts` (pure, tested)

```ts
export function exerciseVolumeLb(ex: WorkoutExercise): number   // Σ full-weight × reps (done sets)
export function workoutVolumeLb(w: Workout): number             // Σ over exercises
```
(`setLoadLb` private helper adds the bar for barbell.)

### `src/screens/history.ts`

- Workout total: a `.hist-total` row ("Total lifted · N kg") at the top of the
  expanded body.
- Per exercise: a `.hist-exvol` row ("Volume · N kg") under its sets, shown only when
  volume > 0. Both via `fmtVol` (kg/lb + thousands separators), reacting to the
  shared unit toggle.

## Testing

`logger-model.test.ts`: barbell incl. bar, non-barbell as-is, bodyweight added-only,
skip not-done/null/non-int reps, empty-bar = 45, timed → 0, `workoutVolumeLb` sums.
Browser-verified @390px on seeded data; kg/lb toggle converts; 0 console errors.

## Out of scope

No bodyweight estimate, no per-set volume, no charts, no schema change.
