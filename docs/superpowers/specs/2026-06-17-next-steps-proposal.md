# What to build next — proposal (2026-06-17)

> Decision doc, not a plan. Captures a grounded read of the codebase and a
> prioritized set of options so a direction can be picked later. Nothing here is
> committed to. When a direction is chosen → brainstorm → written plan → feature
> branch + PR (tests green, verified @390px).

## TL;DR

The app **captures** a complete training history (every finished set's weight,
reps, equipment, exercise ref, date) but **gives almost none of it back**
analytically — only three raw-"max weight" chips and a flat reverse-chron list.

**Top recommendation:** a **Progress / Trends view anchored on estimated 1RM
(e1RM) per main lift + per-exercise history**. Highest value for a powerlifter on
a coached program, and the cheapest high-value work in the repo — it reuses 100%
of already-stored data (zero schema/migration/Supabase work) and fits the existing
pure-model + inline-SVG patterns.

## What the app does today (map)

- **List `#/`** — Done X/58, "Up next" = first unfinished day, three Max chips
  (Deadlift/Squat/Bench = best of coach-prescribed total and user-logged actual).
  Tap number = mark finished; tap row = open day.
- **Session `#/session/n`** — per-day detail; focused barbell lift renders a 2D SVG
  barbell with exact per-side lb plate breakdown, kg→lb, range slider, step chips.
  "Start Session" flips into logging mode; finished days show Edit + Copy-for-trainer.
- **Logging mode** — pre-filled set table from coach, ✓-per-set with completion
  guard, live plate recalc, ± rest timer (300/300/150/90s defaults, vibrate),
  pause/resume clock, "(or…)" swap pills, add/remove via 847-entry catalog picker,
  carry-forward, message-to-coach, Finish (saves only ✓ sets) / Cancel.
- **History `#/history`** — reverse-chron finished workouts, expandable, persisted
  kg/lb toggle, Copy-for-trainer (kg).

### Key assumptions / constraints

| Assumption | Where | Implication |
|---|---|---|
| Bar = 45 lb, plates lb-only (hardcoded) | `load.ts` | Coach prescribes **kg**, but all plate math + logging are lb-centric. No kg-bar/kg-plate config. |
| Coach weights = totals; logged barbell = plates (excl. bar) | `load.ts`, `logger-model.ts` | full lift = `plateLb + 45`; conversions add/subtract the bar everywhere. |
| Data holds kg only; lb+plates computed at runtime | `program.json` | Clean separation (good). |
| Two parallel "done" systems | `progress.ts` (day snapshots) vs `workouts.ts` (logged sets) | "Done X/58" counts logged **and** manually-ticked days; a day can be finished with no logged workout. |
| Exercise identity = `coach:<slug(nameEn)>` or catalog id | `logger-model.ts` | The stable ref behind "Last" pre-fill — and exactly the key needed for per-exercise history. |
| "PWA" is aspirational, not real | `index.html` refs `manifest.webmanifest` + 2 icons; `public/` is **empty** | Those files 404. **No service worker → no offline.** Gym-on-flaky-signal shell won't load offline. |
| Catalog (847 + RU) statically imported | `catalog.ts` | Bundled into the main chunk; loads even on home screen. |

## Prioritized options

### Tier A — high value, cheap, reuses stored data (no schema/migration)

1. **Progress / Trends screen with e1RM** — *value High, effort M.* e1RM trend per
   main lift as an inline SVG sparkline + per-exercise drill-down. 100% stored-data
   reads. **(top pick)**
2. **e1RM in the Max chips** — *value Med-High, effort S.* Today chips show heaviest
   *weight*, ignoring reps (a top 5×140 reads lower than a junk 1×142). Best e1RM
   (Epley `w·(1+reps/30)`) is a few lines in a pure fn + a test. Pure cheap win.
3. **Per-exercise history drill-down** — *value High, effort S-M.* Tap "Squat" → all
   squat sets over time. `lastActualFor` already matches single by `exerciseRef`;
   generalize to all-sets-for-ref. Natural companion to #1.
4. **Fix the broken PWA** — *value Med, effort S.* Add the 3 missing referenced files
   (`manifest.webmanifest`, `favicon.svg`, `apple-touch-icon.png`) + a minimal
   service worker (e.g. `vite-plugin-pwa`). Makes it installable + offline. Currently
   silently 404ing.
5. **Doc staleness** — *value Low, effort S.* `README.md` still says "three.js hero",
   "55 sessions" (it's 58), lists the shipped logger as future roadmap.

### Tier B — high value, more effort or new storage

6. **Bodyweight tracking** — *value Med-High, effort M.* First feature needing **new
   storage** (table/field + input UI). Unlocks weight-class awareness + DOTS/Wilks.
7. **Configurable units / plate inventory (kg bar, kg plates)** — *value Med, effort
   L, risk High.* Deepest mismatch (coach in kg; gym may rack kg), but touches the
   correctness-critical **lb-unit-tested** core + every conversion. Own brainstorm.
8. **True offline write queue** — *value Med, effort M.* localStorage mirror exists
   but Supabase write-failures only `toast`; no replay-on-reconnect. Matters once #4
   makes offline real.

### Tier C — polish / known nits (validated against code)

9. Lazy-load the catalog chunk (statically imported today). *(S)*
10. Picker chrome strings EN-only — i18n later. *(S)*
11. `history.ts` `openId` is module-level → persists across visits. *(S)*
12. Catalog "Leg Press" misclassifies as bodyweight (name lacks a machine token). *(S, data)*
13. `platesForPlateLb` floors silently on non-achievable plate weights (type 47 lb →
    drops 1 lb with no hint). Minor display honesty. *(S)*

### Memory follow-ups — now stale/resolved

- RU catalog coverage is **done** (847 real RU names).
- `program.json` already has all **58** sessions (memory expected a re-parse from 55).
- The "favicon 404" item is really the **broken-PWA** problem (#4), not just an icon.

## Why the top pick

- **Biggest missing piece for this exact user.** A coached 58-session block is about
  progressive overload; the app captures it and shows almost nothing back.
- **Cheapest high-value work here.** Pure reads off `listWorkouts()` — no schema,
  no migration, no Supabase. Fits the tested pure-model pattern (an e1RM/trends
  module à la `logger-model.ts`) and the inline-SVG, no-heavy-deps ethos (hand-rolled
  sparkline, no charting lib — same spirit as dropping three.js).
- **Compounds.** e1RM is the common unit for the Max chips, trend line, and
  per-exercise history, and sets up bodyweight-relative strength (DOTS) later (B6).

Second step would naturally be bodyweight tracking (B6, first to need new storage);
kg-plate configurability (B7) is real but large/risky enough to deserve its own
brainstorm. Neither should lead.
