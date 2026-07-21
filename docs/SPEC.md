# LiftingLog — Application Specification

> A detailed, screen-by-screen specification of the LiftingLog web app: what each
> screen does, the features it exposes, the data it reads/writes, and the
> cross-cutting rules (plate math, units, offline, security) that tie them together.
>
> This document describes the app **as built**. It is generated from the source and
> is meant to be kept in sync when behaviour changes. For *how to change* the program
> data or catalog, see `CLAUDE.md` and `.claude/skills/`.
>
> **Designing the UI?** See the companion [`DESIGN-BRIEF.md`](./DESIGN-BRIEF.md) — the
> visual system, per-screen states/wireframes, component inventory, motion, and the
> frozen-vs-free contract for a redesign. This SPEC remains the authority on *behavior*.

---

## 1. Overview

LiftingLog is a **mobile-first, single-page web app** that renders a personal
trainer's strength program and lets the lifter **log their actual workouts** against
it. It is bilingual (English / Russian), converts the trainer's kilograms to pounds,
computes **exact per-side barbell plate loading**, and tracks progress over time
(history, per-exercise history, and estimated-1RM trends).

- **Audience:** a single lifter following one coach's program (single-user per
  account).
- **Platform:** installable PWA (works offline; "Add to Home Screen" on iOS, "Install"
  on Android/Chrome).
- **Backend:** optional. With Supabase configured, data syncs to the cloud behind an
  auth gate; without it, the app runs fully local on `localStorage`.

### Current data snapshot
*(These figures track `program.json` / `exercises.json`. The program grows as the coach
adds days, so treat them as a snapshot, not a fixed spec.)*
- Program title: **"The Block"**
- Sessions: parsed from the trainer's doc — currently **65**, dated 2026-01-21 →
  2026-06-04 (the home header label reads "Program · Jan–Jun 2026").
- Exercise catalog: ~**847 entries** (generated from the wger open database).

---

## 2. Tech stack & architecture

| Concern | Choice |
|---|---|
| Build / dev | **Vite + TypeScript**, vanilla DOM (no framework) |
| Routing | Hand-rolled **hash router** (`src/router.ts`) |
| Animation | **GSAP** (entry/stagger animations only) |
| Barbell viz | **Static 2D SVG** (`barbell-svg.ts`) — three.js was removed |
| Persistence | `localStorage` + optional **Supabase** (Postgres + Auth + RLS) |
| PWA | `vite-plugin-pwa` (service worker only; manifest is hand-written) |
| Tests | **Vitest** over the pure `src/lib/*` modules |

### Architectural pattern: pure core, imperative shell

- **`src/lib/*` is a pure, tested core.** No DOM, no storage access, no `Date.now()` —
  callers pass `now` in so functions stay deterministic. This is where all the
  correctness-critical logic lives: plate math (`load.ts`), e1RM (`e1rm.ts`), the
  logger model (`logger-model.ts`), focus/tags (`focus.ts`).
- **`src/screens/*` is the thin imperative shell.** Each screen exports a
  `render…(el, …)` function that builds markup and binds events. Most screens hold a
  local `draw()` closure they call to re-render after a state change.
- **`src/lib/{workouts,progress}.ts` are storage seams.** They expose synchronous
  getters over an in-memory cache that is hydrated once at boot and written through to
  `localStorage` and (if configured) Supabase. Screens never talk to storage directly.

### Routing map (`src/main.ts`)

| Hash route | Screen | Renderer |
|---|---|---|
| `#/` | Home / program list | `renderList` |
| `#/session/:n` | Session detail (day `n`) | `renderSession` |
| `#/history` | Workout history | `renderHistory` |
| `#/history/:id` | History, one workout pre-expanded | `renderHistory(el, id)` |
| `#/progress` | Progress / trends overview | `renderProgress` |
| `#/progress/:lift` | Per-lift e1RM drill-down | `renderProgressDetail` |
| `#/exercise/:ref` | Per-exercise set history | `renderExerciseHistory` |
| `#/exercises` | Exercise catalog browser | `renderExercises` |
| *(no route)* | Login (auth gate) | `renderLogin` |

The router (`src/router.ts`) compiles each `path` into a regex (`:name` → capture
group), matches `location.hash` on `hashchange`, clears `#app`, calls the renderer
with captured params, and scrolls to top. Unmatched hashes render a "Not found" stub.

### Boot & auth flow (`boot()` in `src/main.ts`)

1. **No Supabase configured** (`supabase === null`): hydrate progress + workouts from
   `localStorage`, then `launch()` immediately — no auth, no login screen.
2. **Supabase configured, no session:** render the **login screen**. On successful
   sign-in the page reloads and `boot()` re-runs.
3. **Supabase configured, signed in:** hydrate the user's progress + workout rows in
   parallel, then `launch()`.

`launch()` starts the router and mounts the **persistent active-workout bar** (see
§4.10) on `<body>`, outside the routed `#app`.

---

## 3. Core domain concepts

These rules recur across every screen; understanding them makes the screens obvious.

### 3.1 Data holds kilograms only
`src/data/program.json` stores **only kg** targets, sets/reps, names, notes, and
equipment. Pounds and plate breakdowns are **never stored** — they are derived at
runtime by `src/lib/load.ts`. This keeps the trainer's source of truth single and
unit-redo-free.

### 3.2 Coach weights are TOTALS; logged barbell weights are PLATES
This is the single most important (and easy-to-get-wrong) rule:

- The **coach's kg** is the **total on the bar** (bar + plates). The session screen and
  `computeBarbellLoad` show this total.
- A **logged barbell set's `weightLb`** is **only the plates you load — excluding the
  45 lb bar.** The full lift = `fullBarLb(weightLb)` = `weightLb + 45`.

Consequences enforced in code:
- **Coach pre-fill** of a barbell set = `computeBarbellLoad(kg).totalLb − BAR_LB` (the
  loadable round-up total minus the bar). Never `round(kg→lb) − 45`, which could yield a
  non-loadable plate weight.
- **Trainer log / Max chips / e1RM** add the bar back before converting to kg.
- **Per-side plates for a logged set** = `platesForPlateLb(plateLb)` = `decompose(plateLb/2)`.
- **Non-barbell equipment** (dumbbell / machine / cable / bodyweight) is logged as-is —
  no bar.

### 3.3 Plate math (`src/lib/load.ts`, fully unit-tested)
- **Bar = 45 lb.** Plates per side = **45 / 35 / 25 / 10 / 5 lb** — **no 2.5 lb
  microplates** (rarely stocked).
- **Barbell targets round UP per side** to the smallest plate (5 lb) so the load is
  always achievable and **never under the trainer's number** (`computeBarbellLoad`).
- **Non-barbell lifts round to the NEAREST 5 lb** (`roundToStep`) — the closest fixed
  size you'd actually grab (e.g. 25 kg → 55 lb, not 60).
- `KG_TO_LB = 2.20462`.

### 3.4 Units (kg/lb) — shared display setting
`src/lib/unit.ts` persists one display unit under `liftinglog:unit` (defaults to **kg**).
The Home, History, Progress, and Exercise-history screens all read/write this single
setting, so toggling kg/lb anywhere is consistent everywhere. The toggle repaints
values **in place** (no full re-render) where animations would otherwise replay.

### 3.5 Bilingual EN/RU
Every exercise carries `nameEn`/`nameRu` (+ `descEn`/`descRu`, `notesEn`/`notesRu`).
Screens render English as primary with Russian as a dimmed sub-line. The **trainer log
export is Russian-only** (the coach reads Russian). Cyrillic gotcha: JS `\w`/`\b` do
not match Cyrillic, so all Russian-text regexes use `[а-яё]` classes.

### 3.6 Security: trusted vs user text
Catalog names and numbers are trusted static data and may go through `innerHTML`.
**User-entered text is a stored-XSS sink** and must use `textContent` / an input's
`.value`. The only live user-text sinks are the **coach message** (logger textarea)
and the **History** screen (built with `createElement` + `textContent`).

---

## 4. Screens

### 4.1 Home / Program list — `#/` (`src/screens/list.ts`)

The landing screen: program overview, key stats, and the full list of training days.

**Header**
- Program kicker ("Program · Jan–Jun 2026") + title ("The Block").
- Action links: **History**, **Progress**, an **EN · RU** language indicator, and a
  **Sign out** button (⎋) — the latter only when Supabase is configured.

**Stat chips**
- **Done** — count of finished sessions over the total (e.g. `12/65`).
- **Up next** — the first chronological unfinished session's number, or a ✓ when all
  are done.

**kg/lb toggle** — switches the unit for the Max and ~1RM chips (shared setting).

**Max chips** (Deadlift / Squat / Bench, colour-coded)
- Each shows the heaviest known load for that lift: the **max of** (a) the heaviest
  *coach-prescribed* barbell weight across the whole program and (b) the heaviest
  *user-logged* barbell weight (plates + bar, converted). Coach prescribes in kg; lb is
  a conversion.

**~1RM chips** (Deadlift / Squat / Bench)
- The user's **best estimated 1RM** (Epley) for that lift from logged sets, in the
  chosen unit; `—` if nothing logged yet.

**Session rows** (newest day first)
- A **day-number button** that doubles as a "finished" toggle (green when done).
- **Date** (e.g. "MON, FEB 3").
- **Lift tags** (SQUAT / BENCH / DEADLIFT, else ACCESSORY) derived by `liftTags`, plus
  an exercise count.
- Tapping a row → that session's detail; tapping the number toggles finished.

**Marking days done from the list**
- Marking an unfinished day prompts: *"Skip this day? It will be marked done without a
  logged workout."* — i.e. this is a **skip** (no logged workout), distinct from
  finishing via the logger.
- Unmarking prompts; if a logged workout exists, it reassures the log stays in History.
- The **Up next** highlight and Done count recompute live after each toggle
  (`refreshProgress`), without a full re-render.

**Animation:** rows stagger in via GSAP unless `prefers-reduced-motion`.

---

### 4.2 Session detail — `#/session/:n` (`src/screens/session.ts`)

Shows one training day's coach prescription, with an interactive barbell visualizer,
and is the launch point for logging.

**Header / nav**
- Back link to the program; a **Day n / total** stepper with **‹ / ›** to move between
  days (disabled at the ends).

**Focused exercise (the "hero")**
- One exercise is focused at a time (defaults to the first barbell lift). Shows
  equipment + order tag, EN/RU names, the weight, and an **interactive load display**:
  - **Single weight** → one big value + lb total + the **2D barbell SVG** + per-side
    plate chips.
  - **Range** (e.g. "60–80 kg") → a **slider** (2.5 kg steps); dragging live-updates the
    value, lb conversion, plate chips, and the barbell render — no re-render.
  - **Progression / per-set** (e.g. "60→70→80") → **step chips**; tapping one loads that
    weight on the bar. Per-set schemes carry their own reps.
  - **Non-barbell range** → slider with just the value + nearest-5 lb conversion (no
    plates); **dumbbell `perImplement`** lifts append "each".
- **Sets / Reps** stat blocks, the EN/RU description, and any EN/RU notes.

**Other exercises (mini-list)**
- All non-focused exercises as compact rows with order, EN/RU name, and weight. Barbell
  rows show their per-side plate breakdown inline so loading is visible without opening
  each. Tapping a row re-focuses it in the hero.

**Finished-day behaviour**
- A finished day renders its **locked snapshot** (the exercises as they were when
  finished), not the latest parse. If the trainer later edited that day, a badge appears:
  *"⟳ Trainer updated this day after you finished it."* Unfinished days always show the
  live parse.

**Primary actions** (context-dependent)
- **▶ Start Session** (or **▶ Log this day** if the day was skipped) — creates an active
  workout and enters the logger.
- **Resume** — if a workout is active **for this day**, the schedule shows (the
  persistent bottom bar is the resume affordance).
- **Disabled "finish your other workout"** — if a workout is active for a *different*
  day (only one active workout at a time).
- **✎ Edit workout** — if this day already has a logged workout, re-open it in the
  logger in edit mode.
- **📋 Copy for trainer** — copies the Russian trainer log to the clipboard.
- **🗑 Delete workout** — permanently deletes the logged workout (confirm), and unmarks
  the day (its "done" came from that log).
- **✓ Skipped · no workout logged** badge for skipped-but-finished days.

---

### 4.3 Logging mode (`src/screens/logging.ts`)

The core data-entry screen. Rendered into the same `#app` as the session screen (not a
separate route). Owns set editing, the workout clock, the rest timer, exercise
add/remove/swap, and the coach message. Has two modes:
- **Active mode** — logging a live workout (clock runs, rest timer, cancel).
- **Edit mode** (`editWorkout` passed) — editing an already-finished workout (no clock,
  no rest timer, "Done" instead of "Finish").

**Top bar**
- Back link **"‹ Schedule"** → returns to the day's session screen (non-destructive; the
  active workout stays active and is already saved).
- **Pause/resume** (⏸/▶) and a live **elapsed clock** (excludes paused time). In edit
  mode this reads "Editing".
- **Cancel (✕)** in active mode — confirms, then discards the workout.
- A **"Day n · logging"** label.

**Rest timer** (active mode; fixed bottom bar) — see §5.4.

**Per-exercise card** (`exerciseHtml`)
- EN/RU names + a **remove-exercise (✕)** button.
- **Swap pill (⇄ name)** for exercises with a recognised "(or …)" alternative — toggles
  active⇄alt, each keeping its own sets.
- **Coach reference line:** "Coach · <target>" and/or "Last <w>×<reps>" (the user's last
  actual sets for this exact exercise).
- **Set table** with columns: Set #, **weight (lb, or "lb · ea"** for per-implement),
  **Reps** (or **Sec** for timed holds), a **✓ complete** button, and a **delete-set (−)**.
  - Barbell rows render a **live per-side plate line** beneath them ("<chips> / side ·
    <full> lb w/ bar"), recomputed as you type the weight.
  - Inputs are `font-size ≥ 16px` to avoid iOS auto-zoom; focusing selects the whole
    value so typing replaces the pre-fill; non-numeric input is rejected with a toast and
    reverted.
- **+ Add set** — appends a set copying the previous set's weight/reps/rest (or a blank
  90 s set).

**Set completion guard** (`completeProblem` / `canComplete`, pure + tested)
- A set's ✓ stays **locked** until it has a weight (`0` allowed — empty bar / loadless)
  **and a whole number of reps ≥ 1**. Negative weight and non-integer/zero reps are
  blocked with an explanatory toast.
- On completing a set, its weight/reps **fill down** into the other still-blank sets
  (left unchecked), so the user doesn't retype identical numbers (`fillEmptySets`).
- Completing a set in active mode **starts the rest timer** for that set's `restSec`.

**Special exercise kinds**
- **Timed holds** (plank etc.): when the coach `reps` is a duration like `45s`/`35-40s`,
  the exercise is `isTimed`; the seconds live in the `reps` field, the column shows
  **Sec**, completion says "seconds", and History / trainer log append `s` / `с`.
- **Per-implement (two-dumbbell) lifts:** logged as the **per-dumbbell** weight, shown
  with "each", and counted **×2** in volume. The trainer log adds "(кажд.)".
- **"(or …)" alternatives:** parsed at build time from the coach's English note
  (`altFromNotes` / `ALT_PATTERNS`); shown as the ⇄ swap pill.

**Footer**
- **+ Add Exercise** — opens the exercise picker (multi-select); chosen lifts are added,
  pre-filled from the user's last actuals where available.
- **Message to coach** — a free-text textarea (the one user-text XSS sink; bound via
  `.value`, persisted on input).
- **Finish** (active) / **Done** (edit).

**Finish flow**
- If any sets are unmarked, confirms ("…Unfinished sets won't be saved").
- Keeps only **done** sets, drops exercises left with none, stamps `endedAt`, moves the
  workout active → history, marks the program day finished (snapshot), and **navigates to
  `#/history/<id>`** with that workout pre-expanded.

**Persistence:** every edit writes through (`saveActiveWorkout` for active, or
`updateFinishedWorkout` in edit mode).

---

### 4.4 History — `#/history` and `#/history/:id` (`src/screens/history.ts`)

All finished workouts, newest first. Built with `createElement` + `textContent`
(user-text-safe). `#/history/:id` (used by the post-finish redirect and deep links)
pre-expands one workout.

**Per workout (collapsed row)**
- "Day n · <duration>m · <N> ex", the date, and **"Total lifted · <volume>"**
  (`workoutVolumeLb` in the shared unit).

**Expanded workout**
- Each exercise: a **name link** (→ per-exercise history `#/exercise/<ref>`), then each
  set as "✓/· <weight display> × <reps>". Weight display uses `setWeightDisplay`
  (barbell shows plates + "w/ bar"; bodyweight shows "BW"/"BW +N"; per-implement adds
  "each").
- **Per-exercise volume** ("Volume · <v>", full weight incl. bar, shared unit).
- The **coach message** (if any), rendered as text.
- **📋 Copy for trainer (kg)** — the Russian trainer log.

**kg/lb toggle** in the header (shared unit).

---

### 4.5 Per-exercise history — `#/exercise/:ref` (`src/screens/exercise-history.ts`)

Every **done** set for one exercise (matched by exact `exerciseRef`, so it is
per-variant) across all finished workouts, newest first. Reached by tapping an exercise
name in History.

- Title = the exercise's EN name; sub-line = RU name (if different) + session count.
- One card per workout occurrence: the date, then each set as "<weight display> × <reps>".
- kg/lb toggle (shared unit). Reuses `setWeightDisplay`.

---

### 4.6 Progress / Trends — `#/progress` and `#/progress/:lift` (`src/screens/progress.ts`)

Estimated-1RM trends for the three main barbell lifts (deadlift / squat / bench), read
entirely from stored finished workouts.

**Overview (`#/progress`)**
- One card per lift: the lift name, the **best ~1RM** (in the shared unit), and an
  **inline SVG sparkline** of the e1RM trend (one point per finished workout that has a
  qualifying set). Empty state: "No logged sets yet"; single point: "Log more to see a
  trend". Tapping a card → its drill-down.

**Drill-down (`#/progress/:lift`)**
- A larger sparkline, the **best ~1RM**, and a **per-session list** (newest first): date,
  the driving set ("<weight + bar> × <reps>"), and that session's ~1RM.

**e1RM model (`src/lib/e1rm.ts`, pure + tested)**
- **Epley:** `weight × (1 + reps/30)`.
- `e1rmSeries` picks, per finished workout, the **best-e1RM qualifying set** (done,
  barbell, integer reps ≥ 1). Logged plates have the bar added back before Epley.
- Per-implement lifts are intentionally excluded from e1RM (strength is per-implement).
- Precise full-lb values flow through; rounding into the display unit happens **once** at
  the edge to avoid drift.

---

### 4.7 Exercise catalog browser — `#/exercises` (`src/screens/exercises.ts`)

A thin screen that opens the exercise picker (multi-select) and lists what was chosen.
Primarily a way to browse/verify the catalog; the picker itself is the substance (§4.9).

---

### 4.8 Login (auth gate) (`src/screens/login.ts`)

Shown only when Supabase is configured and there is no session. Minimal email +
password form (`signInWithPassword`); on success the page reloads and boots into the
app. The single user is created in the Supabase dashboard. Inputs are ≥16px to avoid
iOS zoom.

---

### 4.9 Exercise picker (sheet) (`src/components/exercise-picker.ts`)

A full-screen modal that resolves with the chosen catalog exercises (or `[]` if
dismissed). Used by the logger ("+ Add Exercise") and the catalog screen.

- **Search** (Cyrillic-aware, `lib/catalog.ts`) + **body-part** and **equipment**
  filters (`<select>` populated from the catalog).
- **Frequently used** section on top: exercises the user logs most, with a usage count
  `(n)`, sorted by frequency → recency → name, and **de-duplicated** from the A–Z list.
  Counts are computed live from finished workouts (`tallyUsage` + `makeUsageResolver`).
- The rest is an **A–Z grouped list**. Multi-select shows "Add N"; single-select closes
  on pick.
- Search input is set via `.value` (never HTML-parsed) and restores caret/focus across
  the full re-render.

---

### 4.10 Persistent active-workout bar (`src/components/active-bar.ts`)

A fixed bottom bar mounted on `<body>` (outside `#app`), shown on **every screen while a
workout is active** — except the logger itself and the active day's own schedule (both
live at `#/session/<activeDay>`, where a Resume affordance already exists). It shows
"▶ Resume workout · Day n" + the live clock; one tap drops straight into the logger. It
refreshes on any `#app` re-render (via a `MutationObserver`) plus a 1 s tick.

---

## 5. Cross-cutting features

### 5.1 Trainer log export (`trainerLog` in `logger-model.ts`)
A **Russian-only** plain-text summary of a finished workout for the coach. Weights are
reported as the **full lifted weight in kg** (barbell adds the bar back; bodyweight is
`б/в` / `б/в +Nkg`; per-implement adds "(кажд.)"). Identical consecutive sets are
collapsed ("<w> × <reps> — <n>"). The coach message is appended. Copied to clipboard
(with a toast fallback if the clipboard API is unavailable).

### 5.2 Pre-fill intelligence
- **Coach pre-fill:** new workouts seed each set from the coach's prescription
  (`buildWorkoutExercises`) — barbell sets pre-fill the loadable round-up plate weight.
- **Last-actual pre-fill:** on top of the coach pre-fill, sets fill from the user's last
  actual numbers for the same exercise (`withLastActual` + `lastActualFor`), filling the
  weight/reps the coach left unspecified (e.g. a rep range).
- **Fill-down:** completing a set copies its numbers into the remaining blank sets.

### 5.3 Snapshots & finished-day locking
Finishing (or skipping) a day stores a **snapshot** of that day's exercises
(`progress.ts`). Finished days render the snapshot, so they stay true to what was done
even if the trainer later edits the day — in which case a "trainer updated" badge shows.

### 5.4 Rest timer reliability (the hard part)
The rest timer must fire its end-of-rest **gong** even when the phone is locked, which
mobile browsers fight. The strategy (see `logging.ts`, `keepalive.ts`, `sound.ts`):
- A **fixed bottom bar** shows remaining time with **−15 / +15 / Skip** controls.
- On the set-complete tap (a user gesture), the app **unlocks audio** and starts a
  **silent keep-alive loop** (`public/silence.wav`) so the page stays alive enough to
  fire the gong + vibrate at 0.
- A **`visibilitychange` catch-up** (`fireRestDone` / `isRestElapsed`) computes elapsed
  time from the **wall clock** on return, firing the cue once if rest already ended —
  so even if the OS suspended JS, state is correct on return.
- All rest teardown funnels through `endRest()`; the visibility listener self-removes if
  the logger DOM is gone (gesture/browser back can't leak it).
- **Known hard limits:** the iOS physical **mute switch** silences web audio, iOS has
  **no Vibration API**, and low-power mode can still suspend — in those cases the timer
  simply shows the correct time on return.
- Loudness lives entirely in the **gong asset** (mastered loud) because iOS ignores
  `HTMLAudioElement.volume`. Assets are synthesized license-clean by
  `scripts/make-gong.mjs` / `scripts/make-silence.mjs`.

### 5.5 PWA / offline
Installable PWA. `index.html` references a **hand-written**
`public/manifest.webmanifest` + icons. The **service worker is generated at build time**
by `vite-plugin-pwa` with `manifest: false` (plugin owns only the SW) and
`registerType: 'autoUpdate'` (a new deploy takes over on next load — no reload prompt).
It **precaches the built app shell** so the app loads offline. It **does not cache
Supabase API calls** (cross-origin → straight to network), so auth/data are never stale.
The SW runs only in the production build, not `npm run dev`.

### 5.6 Accessibility & fallbacks
- Mobile-first (~390 px), scales up.
- `prefers-reduced-motion`: GSAP entry animations are disabled.
- Editable fields are `font-size ≥ 16px` to prevent iOS auto-zoom (which `#app`'s
  `overflow-x:hidden` would otherwise trap).
- ARIA labels on icon buttons, `role="group"` on the unit toggle, `role="link"` on
  session rows.

---

## 6. Data model & persistence

### 6.1 Program schema (`src/data/types.ts`)
```ts
Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight'

Weight =
  | { kind: 'single'; kg }
  | { kind: 'range'; minKg; maxKg }
  | { kind: 'progression'; kg: number[] }
  | { kind: 'perSet'; steps: { kg; reps }[] }
  | { kind: 'qualitative'; level: 'light' | 'medium' | 'heavy' }
  | { kind: 'bodyweight' }

Exercise { order, nameEn, nameRu, descEn, descRu, equipment, perImplement?,
           weight, sets: number|null, reps: string, notesEn?, notesRu? }
Session  { num, date, dateLabel, focus, exercises: Exercise[] }
Program  { title, sessions: Session[] }
```

### 6.2 Workout schema (`src/lib/logger-types.ts`)
```ts
LoggedSet { weightLb: number|null, reps: number|null, done: boolean, restSec }
           // for a timed exercise, `reps` holds SECONDS

WorkoutExercise { exerciseRef,      // catalog id, or `coach:<slug(nameEn)>`
                  nameEn, nameRu, equipment,
                  isCoachPrescribed, coachTarget,
                  isTimed?, perImplement?, alt?, sets: LoggedSet[] }

Workout { id, sessionNum: number|null, startedAt, endedAt: string|null,
          pausedMs, pausedAt: string|null,
          status: 'active'|'finished'|'cancelled',
          coachMessage, exercises: WorkoutExercise[] }
```

### 6.3 Catalog schema (`src/data/catalog-types.ts`)
`CatalogExercise` carries id, EN/RU names (+ `ruIsFallback`), `bodyPart`, `equipment`,
`perImplement`, and `defaultRestSec`.

### 6.4 Persistence layout

**`localStorage` keys**
| Key | Contents |
|---|---|
| `liftinglog:logs` | `{ finished: { [sessionNum]: { at, snapshot } } }` (progress) |
| `liftinglog:workouts` | finished/cancelled workout history (array) |
| `liftinglog:activeWorkout` | the single active workout (or absent) |
| `liftinglog:unit` | shared display unit (`kg`/`lb`) |

**Supabase (optional, behind RLS per `user_id`)**
- `progress` table — one row per finished session (`session_num`, `snapshot`,
  `finished_at`); `user_id` defaults to `auth.uid()` server-side.
- `workouts` table — one **JSONB row per workout** (`id`, `session_num`, `started_at`,
  `ended_at`, `status`, `data` = the full nested `Workout`). Migration in
  `supabase/workouts.sql`.

The storage seams (`workouts.ts`, `progress.ts`) keep an in-memory cache hydrated at
boot, write through to `localStorage` (offline-safe), and upsert to Supabase when
signed in. Screens only ever call the synchronous getters (`listWorkouts`,
`getActiveWorkout`, `isFinished`, `getSnapshot`, …).

---

## 7. Data generation pipelines

These are build-time scripts, not part of the running app.

- **Program parse** (`npm run parse`, `scripts/parse-program.mjs`): deterministically
  converts the trainer's Google Doc markdown into `src/data/program.json` (translate +
  classify equipment per the glossary). Documented by the `update-program` skill.
- **Catalog build** (`npm run build:catalog`, `scripts/build-catalog.mjs`): imports the
  **wger** open exercise database (CC-BY-SA 4.0) into `src/data/exercises.json`,
  inferring equipment, default rest, and per-implement from names; Russian overlay from
  `scripts/catalog-ru.json`; overrides from `scripts/catalog-extras.json`. **Never
  hand-edit `exercises.json`.**
- **Audio assets** (`scripts/make-gong.mjs`, `scripts/make-silence.mjs`): synthesize the
  license-clean gong + silence files (master the gong loud — iOS can't boost volume at
  runtime).

---

## 8. Development & verification

| Command | Purpose |
|---|---|
| `npm run dev` | Local dev server (no service worker) |
| `npm run build` / `npm run preview` | Production build / preview |
| `npm run test` | Vitest over the pure libs (plate math, e1RM, logger model, focus, catalog, data shape) — keep green |
| `npm run parse` | Regenerate `program.json` from the doc |
| `npm run build:catalog` | Regenerate `exercises.json` from wger |

Verify UI changes in a real browser at phone width (~390 px) with zero console errors.
For local UI work without Supabase, an empty `.env.local` disables the auth gate and the
app runs on `localStorage`.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| **Coach total** | The trainer's prescribed weight = full bar weight (bar + plates), in kg |
| **Plate weight** | A logged barbell weight = plates only, excluding the 45 lb bar |
| **`exerciseRef`** | Stable per-exercise identity: catalog id, or `coach:<slug>` for prescribed lifts |
| **Snapshot** | The exercises captured when a day was finished (locks finished days) |
| **e1RM** | Epley estimated 1-rep max: `weight × (1 + reps/30)` |
| **Per-implement** | Two-dumbbell lift: logged per-dumbbell, shown "each", counted ×2 in volume |
| **Timed hold** | Exercise whose `reps` is a duration (e.g. plank "45s"); logged in seconds |
| **Volume** | Total weight lifted = Σ (full weight × reps) over done sets |
| **Skip** | Marking a day done from the list *without* a logged workout |
```
