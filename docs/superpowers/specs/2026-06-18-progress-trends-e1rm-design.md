# Progress / Trends screen (e1RM) — design

**Date:** 2026-06-18
**Value:** High · **Effort:** M · 100% stored-data reads (no schema/data change).

## Goal

A `#/progress` screen showing each main barbell lift's **estimated-1RM trend over
time** as an inline SVG sparkline, with a per-exercise drill-down (bigger chart +
the underlying sessions). Reads only already-stored finished workouts.

## Locked decisions

- **Lift scope:** the 3 main barbell lifts — squat, bench, deadlift (mirrors the
  home e1RM chips; reuses the regex + `equipment === 'barbell'` matching in `e1rm.ts`).
- **Placement:** a new `#/progress` route, linked from the home header next to
  History.
- **Drill-down:** a bigger chart + a per-session list (date · top set weight×reps ·
  e1RM, newest first), at `#/progress/:lift`.

## Architecture

### 1. Data layer — `src/lib/e1rm.ts` (pure, tested)

Add `e1rmSeries(history, match) → E1rmPoint[]`:

- One point per **finished** workout that contains ≥1 qualifying set of the lift,
  sorted by `startedAt` **ascending**.
- A point's value = the **best e1RM among that workout's qualifying done sets**
  (`equipment === 'barbell'`, `match.test(nameEn)`, `done`, `weightLb !== null`,
  integer `reps ≥ 1`). Lift weight applied to Epley = `weightLb + BAR_LB` (plates +
  bar), identical to the existing `bestE1rmFullLb`.
- Each point carries the set that produced the best e1RM, for the drill-down:
  ```ts
  interface E1rmPoint {
    dateIso: string      // workout.startedAt
    e1rmFullLb: number   // PRECISE full lb (incl. bar) — round once at the screen
    weightLb: number     // the driving set's PLATES weight (excl. bar) — feed to
                         // setWeightDisplay(weightLb, 'barbell', unit), same as History
    reps: number
  }
  ```
- Rounding into kg/lb happens **once at the screen** (preserves the no-double-round
  rule already documented in `e1rm.ts`). Empty history / no qualifying set → `[]`.
- Keep `bestE1rmKg/Lb` unchanged; the per-lift headline `~1RM` reuses them (= series
  max), so the home chips and Progress screen never disagree.

### 2. Sparkline — `src/components/sparkline-svg.ts` (pure)

`sparklineSvg(values: number[], opts?: { color?: string }) → string` returns an
inline SVG string (viewBox-based, responsive). Mirrors `barbell-svg.ts` (static 2D
SVG string, no deps). Polyline through normalized points + last-point dot + faint
area fill, stroked in the lift's accent color.

- Normalization: x = index across viewBox width; y = `(v − min)/(max − min)`
  inverted (SVG y grows down).
- Edge cases: `0` values → empty placeholder; `1` value → single dot, no line;
  `max === min` (flat) → midline (guard divide-by-zero).
- Pure → unit-test the path `d` (point count, monotonic x, normalized y, flat-line).

### 3. Screens — `src/screens/progress.ts`

- `renderProgress(el)`: kg/lb toggle (shared `liftinglog:unit`, same as History),
  then 3 cards (deadlift / squat / bench, matching home order + colors): name · best
  `~1RM` (in unit) · inline sparkline. Whole card → `#/progress/:lift`.
- `renderProgressDetail(el, lift)`: bigger chart + per-session list (newest first):
  `date · full set weight×reps · e1RM`, full lift weight in the chosen unit
  (consistent with History adding the bar back). Back link to `#/progress`.
- Lift key ∈ `deadlift | squat | bench`, mapped to the matching regex + accent color.

### 4. Routes & nav

- `src/main.ts`: `route('/progress', …)` + `route('/progress/:lift', …)`.
- `src/screens/list.ts`: a "Progress" link in the home header next to History
  (reuse `.hist-link`).

### 5. Styling

New rules in `src/styles/app.css` for the cards / sparkline / drill-down list,
matching the Reactor dark theme + mono numbers; reuse the chip accent colors.

## Edge cases

- 0 points → "No logged sets yet" per lift.
- 1 point → show the value + a dot, no trend line ("log more to see a trend").
- Bilingual chrome follows the existing screen convention.

## Testing

- `src/lib/e1rm.test.ts`: `e1rmSeries` — ascending date order, best-set-per-day,
  skips unfinished / non-matching / non-barbell / invalid (non-int or <1 reps / null)
  sets, plates+bar applied, empty → `[]`.
- New sparkline path tests — point count, normalization, single-point, flat-line.
- Browser-verified @390px with seeded localStorage, zero console errors.

## Out of scope (YAGNI)

No schema/data change, no charting library, no zoom / tooltips / date-range filters,
no non-main lifts. Inline sparkline + drill-down list only.
