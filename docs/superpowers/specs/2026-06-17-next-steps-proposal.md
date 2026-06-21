# What to build next — proposal (2026-06-17, refreshed 2026-06-19)

> Decision doc, not a plan. Captures a grounded read of the codebase and a
> prioritized set of options so a direction can be picked later. Nothing here is
> committed to. When a direction is chosen → brainstorm → written plan → feature
> branch + PR (tests green, verified @390px).
>
> **2026-06-19 refresh:** four of the original five Tier-A items shipped (Progress/
> e1RM trends, e1RM Max chips, per-exercise history, PWA/service worker), plus History
> volume and rest-timer-when-locked reliability. The original thesis ("captures
> history, gives little back") is largely **resolved**. Shipped items are removed from
> the list below; the priority re-anchors on a reliability bug.

## TL;DR

The analytics gap is mostly closed. The biggest remaining issue is **not a missing
feature but a correctness bug**: a workout finished while offline (or on any failed
Supabase write) is **silently lost on reload** when signed in.

**Top recommendation:** fix the **offline write-back / reconcile** in
`src/lib/workouts.ts` — `loadWorkouts()` reads *only* Supabase when configured and
never restores the localStorage mirror, so the local copy is write-only and discarded
on next boot. This undermines the sync + PWA work already shipped, and the gym (flaky
signal) is the normal case.

## Shipped since this doc was first written (removed from the list)

- **Progress / Trends (e1RM)** screen + per-lift drill-down — `#/progress`.
- **e1RM in the Max chips** (`~1RM` rows on home).
- **Per-exercise history** drill-down — `#/exercise/:ref`.
- **History "weight lifted"/volume** (per-exercise + per-workout totals).
- **PWA / service worker** — installable + offline app shell (`vite-plugin-pwa`);
  `silence.wav`/`gong.mp3` now precached.
- **Rest-timer reliability when locked** (2026-06-19) — silent keep-alive loop +
  `visibilitychange` catch-up so the gong fires when the phone is pocketed.

## What the app does today (map)

- **List `#/`** — Done X/58, "Up next" = first unfinished day, three **Max** chips +
  three **~1RM** chips (Deadlift/Squat/Bench), kg/lb toggle, links to History +
  Progress. Tap number = mark finished; tap row = open day.
- **Session `#/session/n`** — per-day detail; focused barbell lift renders a 2D SVG
  barbell with exact per-side lb plate breakdown, kg→lb, range slider, step chips.
  "Start Session" flips into logging mode; finished days show Edit + Copy-for-trainer.
- **Logging mode** — pre-filled set table from coach, ✓-per-set with completion guard,
  live plate recalc, ± rest timer (300/300/150/90s defaults, vibrate, **keep-alive +
  catch-up when backgrounded**), pause/resume clock, "(or…)" swap pills, add/remove via
  847-entry catalog picker, carry-forward, message-to-coach, Finish / Cancel.
- **History `#/history`** — reverse-chron finished workouts, expandable, total + per-
  exercise volume, persisted kg/lb toggle, Copy-for-trainer (kg). Exercise names link
  to per-exercise history.
- **Progress `#/progress`** — e1RM sparkline per main barbell lift + per-session
  drill-down. Read-only over stored workouts.

### Key assumptions / constraints

| Assumption | Where | Implication |
|---|---|---|
| Bar = 45 lb, plates lb-only (hardcoded) | `load.ts` | Coach prescribes **kg**, but all plate math + logging are lb-centric. No kg-bar/kg-plate config. |
| Coach weights = totals; logged barbell = plates (excl. bar) | `load.ts`, `logger-model.ts` | full lift = `plateLb + 45`; conversions add/subtract the bar everywhere. |
| Data holds kg only; lb+plates computed at runtime | `program.json` | Clean separation (good). |
| Two parallel "done" systems | `progress.ts` (day snapshots) vs `workouts.ts` (logged sets) | "Done X/58" counts logged **and** manually-ticked days; a day can be finished with no logged workout. |
| Exercise identity = `coach:<slug(nameEn)>` or catalog id | `logger-model.ts` | The stable ref behind "Last" pre-fill, per-exercise history, and e1RM trends. |
| Sync is cloud-authoritative on read | `workouts.ts` `loadWorkouts()` | When Supabase is configured, boot reads **only** the cloud; the localStorage mirror is never restored → **offline/failed writes are lost on reload** (see Tier 1 #1). |
| Workout dates stamped to `now` | `workouts.ts` `startWorkout`/`finishWorkout` | No way to backdate a late-logged session (skews trends — Tier 2 #4). |
| Catalog (847 + RU) statically imported | `catalog.ts` | Bundled into the main chunk; loads even on the home screen. |

## Prioritized options

### Tier 1 — Reliability / correctness (fix before adding features)

1. **Offline workouts silently lost when signed in** — *value High, effort M.* **(top
   pick)** `loadWorkouts()` reads only Supabase when configured and never falls back to
   or merges the localStorage mirror; `saveActiveWorkout`/`finishWorkout` write locally
   *and* attempt a cloud upsert, but a failed upsert only `toast`s — there is no replay.
   So a workout finished in the gym basement is saved locally, then **overwritten by the
   (empty) cloud read on next boot**. Fix: a boot-time reconcile / outbox — merge local
   rows not present in the cloud and retry their upsert (last-write-wins by `id`).
   Was "B8 true offline write queue"; promoted to top now that offline (PWA) is real.

### Tier 2 — Training features (capture → give back; mostly cheap, reuse the pure model + `sparkline-svg`)

2. **Bodyweight tracking** — *value Med-High, effort M.* First feature needing **new
   storage** (table/field + a small input + a sparkline on Progress). The `bodyweight`
   equipment type logs *added* load only; the lifter's actual bodyweight over time is
   never recorded. Unlocks relative-strength / DOTS later.
3. **Generalize Progress + weekly-volume trend** — *value Med-High, effort S-M.*
   `progress.ts` hardcodes the 3 barbell lifts. Add (a) an e1RM/volume trend for any
   tapped exercise, (b) a **weekly total-volume** chart (reuse `workoutVolumeLb` +
   `sparkline-svg`) — the single most-watched training metric, already computed but
   never charted over time.
4. **Backdate / edit a workout's date** — *value Med, effort S.* `startedAt`/`endedAt`
   are stamped to `now` with no override; forgetting to log on the day lands the workout
   on the wrong date and skews every trend. An editable date on a finished workout.
5. **PR detection / celebration in logging** — *value Med, effort S.* A toast when a
   completed set beats the stored best for that lift — the e1RM/max logic already
   exists; this just surfaces it in the moment (the most motivating feature in most
   lifting apps).

### Tier 3 — Polish / UX / known nits (validated against code)

6. **Data export / import (JSON backup)** — *S-M.* Today the only export is the Russian
   trainer-copy text. A download/restore pair protects against localStorage eviction and
   lets the user own their data (esp. in local/no-auth mode).
7. **Reorder exercises** in the logger (add/remove only today). *(S)*
8. **Supersets** — explicitly deferred in the logger design; still missing. *(M)*
9. **Settings screen** — consolidate the kg/lb toggle (duplicated across list/history/
   progress) and expose bar weight / plate set / default rest + a **UI-language toggle**
   (chrome is EN-only though content is bilingual). *(M)* — folds in the old i18n nit.
10. **Configurable units / kg plates** — *value Med, effort L, risk High.* Only worth it
    if you train in a kg gym; touches the correctness-critical **lb-unit-tested** core
    and every conversion. Own brainstorm; should not lead.
11. **Warm-up set generator** from the working weight (standard ramp, reuse plate math). *(S)*
12. Lazy-load the catalog chunk (statically imported today). *(S)*
13. `history.ts` `openId` is module-level → persists across visits. *(S)*
14. Catalog "Leg Press" misclassifies as bodyweight (name lacks a machine token). *(S, data)*
15. `platesForPlateLb` floors silently on non-achievable plate weights. *(S, display honesty)*
16. Doc staleness — `README.md` still says "three.js hero" and "55 sessions" (it's 58),
    and lists the shipped logger as future roadmap. *(S)*

**Not recommended now:** RPE/RIR tracking — only if the trainer's program actually uses
it; otherwise it's noise.

## Why the top pick

- **It's a data-loss bug, not a feature gap.** Losing a logged workout is the worst
  failure mode for a training log, and it hides *behind* the sync + PWA features
  already shipped — users would trust the cloud icon while silently losing gym data.
- **The gym is the offline case.** Flaky/no signal mid-session is normal; the local
  mirror already exists, it's just never read back. The fix is contained to the
  `workouts.ts` storage seam (reconcile on boot + retry queue) — no UI surface.
- **It unblocks the rest.** Bodyweight (Tier 2 #2) and any future logged data lean on
  the same seam; making it durable first is the right order.

Second step would naturally be **bodyweight tracking** (Tier 2 #2, the next feature to
need new storage); **kg-plate configurability** (Tier 3 #10) is real but large/risky
enough to deserve its own brainstorm. Neither should lead.
