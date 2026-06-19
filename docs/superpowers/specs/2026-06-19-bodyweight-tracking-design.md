# Bodyweight tracking — design

**Date:** 2026-06-19
**Status:** Approved (brainstorming) → ready for implementation plan
**Branch:** `feature/bodyweight-tracking`

## Summary

Record the lifter's **actual bodyweight over time** on its own cadence, independent
of workouts, and show the trend as a sparkline on a dedicated screen. This is the
first feature that needs new persistent storage of its own.

Today the `bodyweight` *equipment type* only logs **added** load (e.g. a weighted
pull-up); the lifter's own bodyweight is never recorded anywhere. This feature adds
that missing datum.

**Value:** Med-High. **Effort:** M. Unlocks relative-strength / DOTS-style metrics
later (a separate, additive feature — out of scope here).

## Decisions (from brainstorming)

- **Primary use → "Lifting context" (Option A).** Bodyweight is logged *occasionally*
  to give lifts meaning, not as a daily weight-management tool. This sets low-prominence
  v1 defaults: no home quick-add chip, no finish-time prompt, no "log today?" nudge,
  no smoothing/moving-average. Headline = latest reading. The storage seam is identical
  to what Options B/C ("daily weigh-ins" / "both") would need, so those remain small
  additive changes later — not a rewrite.
- **Placement → dedicated `#/bodyweight` screen** (not a Progress card). Gives room
  for DOTS / goal lines to grow later. Linked from the home header nav and from Progress.
- **Granularity → one entry per day.** Re-logging the same day overwrites it (keyed by
  date). Past entries are editable and deletable.
- **Units → store kilograms only**, display in the shared kg/lb unit (project
  convention: "data holds kilograms only"). Input is interpreted in the active unit and
  converted to kg before storage.
- **Sparkline → raw**, gaps between sparse points are fine (no smoothing — that was a
  daily-weigh-in concern).

## Architecture

Reuses the repo's established split, seen in `load.ts`/`logger-model.ts` (pure,
unit-tested) vs `progress.ts`/`workouts.ts` (storage seams with side effects):

```
src/lib/bodyweight-model.ts   ← PURE: types, parse/validate input, format for display (TESTED)
src/lib/bodyweight.ts         ← SEAM: cache + localStorage + Supabase (no UI)
src/screens/bodyweight.ts     ← SCREEN: #/bodyweight render + interactions
supabase/bodyweight.sql       ← table migration (run in Supabase SQL editor)
```

Wiring:
- `src/main.ts` — add `route('/bodyweight', …)` and `loadBodyweight()` to the boot
  `Promise.all([...])` (alongside `loadProgress()` / `loadWorkouts()`).
- `src/screens/list.ts` — add a `Bodyweight` link to the home header nav (beside
  History / Progress).
- `src/screens/progress.ts` — add a small link to `#/bodyweight`.

### Storage seam — `src/lib/bodyweight.ts`

Mirrors `progress.ts` almost line-for-line: a sync in-memory cache hydrated once at
boot, written through to localStorage (offline-safe) and Supabase when configured.

- Cache shape: `Record<string /* 'YYYY-MM-DD' */, number /* kg */>`.
- localStorage key: `liftinglog:bodyweight`.
- Exports:
  - `loadBodyweight(): Promise<void>` — hydrate cache (Supabase rows, else localStorage).
  - `listBodyweight(): BodyEntry[]` — ascending by day (oldest → newest), for the sparkline.
  - `getBodyweight(day: string): number | null` — a single day's kg (used to prefill the
    quick-add input with today's value).
  - `logBodyweight(day: string, kg: number): Promise<void>` — optimistic cache update +
    write-through. Supabase: `upsert({ day, weight_kg: kg }, { onConflict: 'user_id,day' })`,
    **omitting `user_id`** so the column default `(auth.jwt() ->> 'sub')::uuid` fills it
    (same trick `progress.ts` uses).
  - `deleteBodyweight(day: string): Promise<void>` — drop from cache + localStorage +
    Supabase (`.delete().eq('day', day)`).
- No-Supabase / not-signed-in → localStorage only, same `toast` behavior as the other
  seams (optimistic, surface save/delete errors via toast).

### Pure model — `src/lib/bodyweight-model.ts`

No Supabase import, so it's unit-testable like `logger-model.ts`.

- `export interface BodyEntry { day: string; weightKg: number }`  (`day` = local `YYYY-MM-DD`)
- `parseWeightInput(raw: string, unit: Unit): number | null` — trim; reject non-numeric,
  `≤ 0`, and absurd values (`> 500` kg after conversion); convert lb → kg when
  `unit === 'lb'`; return kg. Returns `null` on invalid input (screen shows an inline error).
- `formatWeight(kg: number, unit: Unit): string` — display value, 1 decimal place,
  in the active unit (kg shown as-is; lb via `kgToLb`).

### Screen — `src/screens/bodyweight.ts`

Route `#/bodyweight`. Layout (phone-width):

```
‹ Program                 Bodyweight        [kg | lb]   ← reused unit toggle
┌──────────────────────────────────────────────┐
│  [ 82.0 ] kg            [ Log today ]          │   ← quick-add row (input ≥16px font)
└──────────────────────────────────────────────┘
   ╱╲__╱‾╲___  (big sparkline, green accent)         ← reuses sparklineSvg()
   Jun 19     82.0 kg        ✎  ✕                     ← history, newest-first
   Jun 12     82.4 kg        ✎  ✕
   …
```

- **Quick-add row** targets *today*: a number `<input>` pre-filled with today's stored
  value (if any), a "Log today" button → `parseWeightInput` → `logBodyweight(today, kg)`
  → re-render. Invalid input shows an inline error, no write.
- **Sparkline** from `listBodyweight()` (oldest → newest) via `sparklineSvg`, a distinct
  green accent. Empty history → empty state; one entry → single dot (already handled by
  `sparklineSvg`).
- **History list** newest-first. Each row: date · weight (active unit) · edit ✎ · delete ✕.
  - **Edit** ✎ → inline number input on that row (also ≥16px font) → Save calls
    `logBodyweight(day, kg)` (overwrites) → re-render; Cancel reverts.
  - **Delete** ✕ → confirm → `deleteBodyweight(day)` → re-render.
- **Unit toggle** reuses the shared `getUnit`/`setUnit` + the existing `.unit-toggle`
  markup/bind pattern from `progress.ts`; toggling re-renders the chart, list, and the
  prefilled input value in the new unit.

### Day key / timezone

`day` is the **local** calendar date as `YYYY-MM-DD` (a `todayLocalIso()` helper in the
seam derived from `new Date()` in local time — *not* `toISOString()`, which is UTC and
could roll the day). Tests pass an explicit date to the pure model so they stay
deterministic.

### iOS-zoom rule

Both editable inputs (quick-add + inline row edit) must be `font-size: ≥16px` — iOS
Safari auto-zooms a smaller focused input and `#app`'s `overflow-x:hidden` then traps
the zoom (documented gotcha). Reuse `.lg-inp` or an equivalent ≥16px class.

### Supabase migration — `supabase/bodyweight.sql`

```sql
create table if not exists public.bodyweight (
  user_id   uuid not null default (auth.jwt() ->> 'sub')::uuid,
  day       date not null,
  weight_kg numeric not null,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);

alter table public.bodyweight enable row level security;

create policy "own bodyweight" on public.bodyweight
  for all
  using ((auth.jwt() ->> 'sub')::uuid = user_id)
  with check ((auth.jwt() ->> 'sub')::uuid = user_id);

grant select, insert, update, delete on public.bodyweight to authenticated;
```

(PK `(user_id, day)` covers the read path; no extra index needed. Same RLS pattern as
`workouts.sql` / the `progress` table.)

## Data flow

1. Boot → `loadBodyweight()` hydrates the cache (added to `main.ts` `Promise.all`).
2. Screen render reads `listBodyweight()` (asc) → sparkline; reversed → history list;
   `getBodyweight(today)` → prefill the quick-add input. The latest reading is simply
   the first (newest) history row — no separate big headline in v1.
3. Log today / edit row → `logBodyweight(day, kg)` (optimistic cache + write-through).
4. Delete row → `deleteBodyweight(day)`.

## Edge cases & error handling

- One-per-day upsert: re-logging a day overwrites its value.
- Not signed in / no Supabase configured → localStorage only (toast like the other seams).
- Invalid input (non-numeric, ≤0, >500 kg) → inline error, no write.
- Empty history → empty state, no sparkline. Single entry → sparkline dot.
- Unit toggle re-interprets the prefilled input and re-renders chart/list in the new unit.

## Testing

- `src/lib/bodyweight-model.test.ts` (Vitest):
  - `parseWeightInput` — valid integers/decimals; rejects empty, non-numeric, `0`,
    negative, `> 500` kg; lb → kg conversion correctness; kg passthrough.
  - `formatWeight` — kg and lb, 1-decimal rounding.
- `npm run test` stays green; the screen/seam are exercised manually in a real browser at
  ~390px with zero console errors (per the repo's verification rule). Local UI
  verification uses the empty-`.env.local` bypass + seeded localStorage (see project memory).

## Docs to update in the same change (repo rule)

- **CLAUDE.md** — add the new key files; note the new localStorage key
  `liftinglog:bodyweight`; reaffirm "bodyweight stored as kg" under conventions.
- **README** — a short "Bodyweight" section.

## Out of scope (deferred — all additive on this seam)

- DOTS / relative-strength math, goal lines.
- Daily-weigh-in ergonomics: home quick-add chip, finish-time prompt, "log today?"
  nudge, moving-average smoothing / 7-day-average headline.
