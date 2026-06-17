# Estimated-1RM home-screen chips — design (2026-06-17)

> Spec for proposal item **#2** ("e1RM in the Max chips"), refined during
> brainstorming. Scope is deliberately narrow: one new chip row on the home
> screen + one pure, tested helper. No schema, migration, or Supabase work.

## Problem

The home screen shows three **Max** chips (Deadlift / Squat / Bench). Their
"actual" half (`maxLoggedKgFor` in `src/screens/list.ts`) reports the heaviest
**weight** ever logged and discards reps — so a grindy `1×142` outranks a strong
`5×140`. The app stores `reps` on every set but never uses it to express strength.

## What we're building

Add a **third chip row** below the existing Max row: three `~1RM` chips for
Deadlift / Squat / Bench showing the user's **estimated one-rep max** (Epley),
computed from their best logged set per lift.

```
0/58        1/58
DONE        UP NEXT

155 kg   155 kg   100 kg      ← existing Max row (unchanged)
MAX DL   MAX SQ   MAX BN

~163 kg  ~150 kg  —           ← NEW ~1RM row
~1RM DL  ~1RM SQ  ~1RM BN
```

## Decisions (locked in brainstorming)

1. **Keep** Done / Up next and the three Max chips exactly as they are.
2. **Add** the ~1RM row as a *separate* row — do not replace the Max chips. The two
   rows mean different things on purpose:
   - **Max** = best of coach-prescribed total and heaviest logged weight (current behavior).
   - **~1RM** = estimated max from *your* logged lifts only.
3. **Logged-only.** A lift with no qualifying logged set shows `—` (em-dash, no
   unit). The ~1RM chip never falls back to the coach's prescription.
4. **Maximize the formula, not the weight.** Compute Epley for every qualifying set
   and take the largest result — so `5×140` (≈163) correctly beats `1×142`.
5. **Raw Epley, no rep cap** for v1. These are low-rep main barbell lifts (1–6 reps),
   where Epley is reliable. Revisit only if a high-rep set distorts a chip.
6. **Full labels** `~1RM Deadlift / ~1RM Squat / ~1RM Bench`, matching the Max row
   style; fit three-across at 390px like the Max row does today.
7. **Unit kg, rounded to whole kg**, matching the Max chips and the coach-facing convention.

## The e1RM computation

Epley: `e1RM = weight × (1 + reps / 30)`.

Logged barbell weight is **plates only** (excludes the 45 lb bar), so the bar is
added back before applying the formula — consistent with `maxLoggedKgFor`, which
already does `+ BAR_LB`.

Per lift (matched by the same `/deadlift/i` `/squat/i` `/bench/i` regexes already
used in `list.ts`), over all **finished** workouts:

- Consider a set only if: `equipment === 'barbell'`, the exercise name matches the
  lift, the set is `done`, `weightLb !== null`, and `reps` is an integer ≥ 1.
  (The completion guard already enforces integer reps ≥ 1 on done sets; the helper
  re-checks defensively so it is safe on any `Workout[]`.)
- For each such set: `e1rmLb = (weightLb + BAR_LB) × (1 + reps / 30)`.
- Take the max `e1rmLb` across all sets, then convert once: `kg = round(maxE1rmLb / KG_TO_LB)`.
- No qualifying set → `null` → render `—`.

Computing the max in lb and converting **once at the end** avoids per-set rounding drift.

## Components

### New: `src/lib/e1rm.ts` (pure, unit-tested)

Follows the `load.ts` / `logger-model.ts` "pure model, no DOM/storage" pattern.

```ts
/** Epley estimated 1-rep max in the same unit as `weight`. reps should be ≥ 1. */
export function epley1rm(weight: number, reps: number): number

/** Best estimated 1RM in kg over finished workouts for lifts whose English name
 *  matches `match`, or null if no qualifying logged set. Adds the bar back
 *  (logged barbell weight is plates-only). */
export function bestE1rmKg(history: Workout[], match: RegExp): number | null
```

`bestE1rmKg` takes `Workout[]` (not the DOM/store) so it is testable in isolation,
mirroring `lastActualFor(history, ref)` in `logger-model.ts`.

### Changed: `src/screens/list.ts`

- Import `bestE1rmKg` from `../lib/e1rm`.
- Render a second `<div class="stats2">` row after the existing one, with three
  `.chip2` cells reusing the Max row's per-lift colors
  (deadlift `#e3b341`, squat `#e23b3b`, bench `#3b74e6`) and order (DL, SQ, BN).
- Each cell: `bestE1rmKg(listWorkouts(), /deadlift/i)` etc.; show `~<n>` + `kg`
  unit when non-null, or `—` (no unit) when null. Prefix the number with `~`.
- No JS state changes — these are read-once at render, like the Max chips.

### Styling

Reuse the existing `.stats2` / `.chip2` / `.n2` / `.u` / `.l2` styles — no new
classes. Add vertical spacing between the two `.stats2` rows only if the existing
margin doesn't already separate them.

## Testing (Vitest)

- `epley1rm`: `epley1rm(100, 1) === 100`; `epley1rm(140, 5) > epley1rm(142, 1)`
  (the core "reps matter" property).
- `bestE1rmKg`:
  - empty history → `null`.
  - picks the set that maximizes Epley, not the heaviest weight.
  - adds the bar back (a known plate weight → expected kg).
  - skips non-barbell exercises, non-matching lifts, non-`done` sets, and sets with
    `reps < 1` or non-integer reps.

## Docs to update (per CLAUDE.md "keep skills in sync")

- Add `src/lib/e1rm.ts` to the **Key files** list in `CLAUDE.md`.
- No row in the "keep skills in sync" table applies — this touches no schema,
  glossary, plate/bar/rounding math, catalog, or parser. (The Max chips and
  `load.ts` plate math are unchanged.)

## Out of scope (deferred to other proposal items)

- Progress / Trends screen and sparkline (#1).
- Per-exercise history drill-down (#3).
- Any change to the existing Max chips, Done, or Up next.
- Bodyweight tracking, kg plate/bar configurability, PWA/offline.

## Workflow

Implement on a feature branch → PR; tests green; verified in a real browser at
~390px with zero console errors before claiming done (per `CLAUDE.md` and the
project's branch+PR convention).
