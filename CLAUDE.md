# LiftingLog — project guide for AI agents

Mobile-first static web app (Vite + TypeScript, vanilla) that renders a trainer's
strength program. Bilingual EN/RU, kg→lb conversion, per-side barbell plate
loading, and a logger (mark days finished). No backend.

## Keep skills in sync (do this every iteration)

**After each change, before finishing, check whether the work changed anything a
skill documents — and update that skill in the same change.** A skill that lies is
worse than no skill. Concretely, if a change touches any of these, update the
matching skill file:

| If you changed… | Update… |
|---|---|
| `src/data/types.ts` (the `Program`/`Weight`/`Exercise` schema) | `.claude/skills/update-program/references/parsing-rules.md` (schema section) **and** `scripts/parse-program.mjs` output shape |
| Added/renamed an exercise, equipment type, or RU→EN mapping | the glossary in **both** `scripts/parse-program.mjs` (`GLOSSARY`) and `parsing-rules.md` (glossary table) |
| Weight / sets-reps / bundle parsing rules | `scripts/parse-program.mjs` + the matching section of `parsing-rules.md` |
| Plate set, bar weight, or rounding (`src/lib/load.ts`) | `parsing-rules.md` notes + `README.md` "Plates & bar" |
| How the doc is fetched/exported, or its markdown shape | `update-program/SKILL.md` |
| Added a new skill or workflow | give it a `SKILL.md` and note it here |
| Added/renamed catalog data, the wger equipment/rest mapping, or RU↔EN entries | `scripts/build-catalog.mjs` (`classifyEquip`/`restFor`) + the `scripts/catalog-extras.json` overrides + `scripts/catalog-ru.json` + `README.md` "Exercise catalog" |
| The rest-timer default heuristic (`restDefaultFor` in `src/lib/logger-model.ts`) | keep it identical to `scripts/build-catalog.mjs` `restFor` — the catalog bakes it in, the logger resolves it for coach lifts |

The glossary lives in two places on purpose (code + docs) — change both or they
drift. When in doubt, re-run `npm run parse` against the live doc and confirm it
still produces 0 unknowns and type-checks.

## Conventions

- **Data holds kilograms only.** Pounds and plate breakdowns are computed at
  runtime by `src/lib/load.ts` — never store lb or plate math in
  `src/data/program.json`.
- **Plate math is correctness-critical and unit-tested.** Targets round UP (never
  under the trainer's number) — **per side to the smallest plate (5 lb); no 2.5 lb
  microplates**. Bar = 45 lb; plates per side = 45/35/25/10/5. `computeBarbellLoad`
  rounds the per-side weight up to `PLATES_LB`'s smallest entry. Non-barbell lifts
  (dumbbell/machine/cable) round to the **nearest** 5 lb (`roundToStep(lb, 5)` — closest
  fixed size you grab, not up; e.g. 25 kg → 55 lb, not 60).
- **Coach weights are TOTALS; logged barbell weights are PLATES (excl. the bar).**
  The trainer's kg is the total on the bar (`computeBarbellLoad` + session screen).
  A logged barbell `weightLb` is only the plates you load — full lift =
  `fullBarLb(weightLb)` = `weightLb + 45` (`load.ts`). So the coach pre-fill is the
  **loadable round-up total** (`computeBarbellLoad(kg).totalLb`, same as the schedule
  screen) **minus the bar** — never `Math.round(kgToLb)−45`, which can yield a
  non-loadable plate weight (e.g. 95 kg → 164, where 82/side is impossible). Round-up
  keeps the pre-fill a real plate config (chips sum exactly) and ≥ the coach's kg when
  converted back. `trainerLog` / Max chips / history add the bar back before
  converting to kg. Per-side plates for a logged set = `platesForPlateLb`
  (`decompose(plateLb/2)`), NOT the total-based `computeBarbellLoad`. Non-barbell
  equipment (dumbbell/machine/bodyweight) is logged as-is — no bar.
  - **Set-completion guard** (`completeProblem`/`canComplete` in `logger-model.ts`,
    pure + tested): a set's ✓ stays locked until it has a weight (`0` allowed —
    empty bar / loadless) and a **whole number of reps ≥ 1**; negative weight and
    non-integer/zero reps are blocked. The trainer log prints `б/в` for a bodyweight
    set with weight `0`/empty (and `б/в +Nkg` for added weight).
  - **Timed holds** (plank etc.): a coach exercise whose `reps` is a duration like
    `45s`/`35-40s` is flagged `WorkoutExercise.isTimed` (via `timedSeconds`); the
    seconds live in the `reps` field (no new column), the logger shows a **Sec**
    column, completion says "seconds", and History / coach log append `s` / `с`.
  - **"(or …)" alternatives**: a coach exercise whose English note starts with a
    recognised swap (`Or hanging leg raises …`, `Or plank: …`) carries the
    alternative in `WorkoutExercise.alt`, parsed at build time by `altFromNotes`
    (runtime only — no parser / `program.json` change). The logger shows a
    `⇄ <name>` pill; `swapVariant` toggles active⇄alt and each side keeps its own
    pre-filled sets. Add new swaps to `ALT_PATTERNS` in `logger-model.ts`.
- **Barbell viz is a static 2D SVG** (`src/components/barbell-svg.ts`). three.js
  was removed — do not reintroduce it without reason.
- **PWA / service worker.** The app is an installable PWA. `index.html` references a
  hand-written `public/manifest.webmanifest` + icons (`icon-192/512`,
  `apple-touch-icon`, `favicon-32`). The service worker is generated at build time by
  `vite-plugin-pwa` (`vite.config.ts`) with **`manifest: false`** (the plugin owns
  ONLY the SW — the manifest stays hand-written, single source of truth) and
  `registerType: 'autoUpdate'` (a new deploy takes over on next load, no reload
  prompt). It precaches the built app shell (`workbox.globPatterns`) so the app loads
  offline and Chrome/Android show the Install prompt; iOS add-to-home works via the
  apple meta tags. **It does NOT cache Supabase API calls** — they're cross-origin and
  pass straight to the network, so the SW never serves stale auth/data. Don't add
  Supabase runtime caching without handling auth/staleness. The SW only runs in the
  production build (`vite build` → `dist/sw.js`), not `npm run dev`.
- **Progress** persists to `localStorage` under `liftinglog:logs` as
  `{ finished: {...} }`. Other keys: `liftinglog:workouts` + `liftinglog:activeWorkout`
  (logger), `liftinglog:unit` (shared History + home kg/lb display toggle, defaults to kg).
- **Rendering uses `innerHTML` with trusted static data.** User-entered text is a
  stored-XSS sink and must use `textContent` / an input's `.value` property — NEVER
  an `innerHTML` template. Live sinks: the **coach message** in `logging.ts`
  (textarea `.value`) and `history.ts` (built with `createElement` + `textContent`).
  Verified with an `<img onerror>` probe.
- **Cyrillic gotcha:** JS `\w`/`\b` do NOT match Cyrillic. Use `[а-яё]` classes
  and whitespace anchors in any Russian-text regex.
- **Editable fields must be `font-size: ≥16px`.** iOS Safari auto-zooms the viewport
  when a focused `<input>`/`<textarea>` is smaller, and `#app`'s `overflow-x:hidden`
  then **traps** the zoom — clipping controls off-screen with no way to scroll back
  (hit this on the logging/edit screen). Applies to `.lg-inp`, `.lg-msg`,
  `.login-card input`, `.picker-search`. (`<select>` is exempt — iOS shows a wheel,
  not a keyboard, so it doesn't zoom.)

## Workflow

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run test` — Vitest (plate math, focus/tags, data shape). Keep green.
- `npm run parse` — regenerate `program.json` from the doc (see `update-program`).
- Verify UI changes in a real browser at phone width (~390px); confirm zero
  console errors before claiming done.
- Commit per change with a clear message.

## Key files

- `src/lib/load.ts` — kg→lb + plate math (pure, tested)
- `src/lib/e1rm.ts` — Epley estimated 1RM: best-e1RM-per-lift (home chips) + `e1rmSeries` (one point per finished workout, for the Progress trend) over history (pure, tested)
- `src/lib/focus.ts` — session focus label + main-lift tags
- `src/lib/unit.ts` — shared kg/lb display-unit setting (localStorage `liftinglog:unit`)
- `src/lib/progress.ts` — finished-day persistence
- `src/data/{types,program.json,program}.ts` — schema, data, loader
- `src/data/exercises.json` — bilingual exercise catalog (GENERATED; never hand-edit — use `scripts/catalog-extras.json` + `npm run build:catalog`)
- `src/data/catalog-types.ts` — `CatalogExercise` schema
- `src/lib/catalog.ts` — catalog search/filter (Cyrillic-aware, tested)
- `src/components/exercise-picker.ts` — the add-exercise picker sheet
- `scripts/build-catalog.mjs` — wger → exercises.json importer (run `npm run build:catalog`)
- `scripts/catalog-ru.json` — Russian-name overlay (id→nameRu) merged into the catalog by `build-catalog.mjs`
- `src/screens/{list,session}.ts` — program list, session detail
- `src/components/barbell-svg.ts` — 2D barbell renderer (+ `barbell.ts` wrapper)
- `src/components/sparkline-svg.ts` — pure inline-SVG sparkline string (normalized polyline + area + end dot; tested)
- `scripts/parse-program.mjs` — deterministic doc → program.json parser
- `.claude/skills/update-program/` — the re-parse skill + rules
- `docs/superpowers/` — original spec and plan
- `src/lib/logger-model.ts` — pure logger model (rest defaults, pre-fill from coach, duration, Last reference; `allSetsForRef` = all done sets for an exerciseRef over time, the all-time generalization of `lastActualFor`; tested)
- `src/lib/logger-types.ts` — `Workout`/`WorkoutExercise`/`LoggedSet` types
- `src/lib/workouts.ts` — workout storage seam (Supabase JSONB + localStorage mirror)
- `src/screens/logging.ts` — logging-mode screen (set table, timers, notes, finish/cancel). Rest timer is a **fixed bottom bar** (`.lg-rest` is `position:fixed`; `.lg.resting` reserves space) and plays a gong + vibrates at 0
- `src/lib/sound.ts` — rest-timer gong cue: a preloaded `<audio>` for `public/gong.mp3`, **unlocked on the set-complete tap** (mobile blocks audio until a gesture); `playRestDone()` fires at 0
- `scripts/make-gong.mjs` — synthesizes `public/gong.mp3` (license-clean additive synthesis; `node scripts/make-gong.mjs` then encode to mp3)
- `src/screens/history.ts` — past finished workouts (#/history). Exercise names link to the per-exercise history (`#/exercise/<encoded ref>`).
- `src/screens/progress.ts` — Progress/Trends (`#/progress` + `#/progress/:lift`): e1RM sparkline per main barbell lift (squat/bench/deadlift) + per-session drill-down. Read-only over stored workouts; reuses the shared kg/lb unit. Add a lift by extending `LIFTS`.
- `src/screens/exercise-history.ts` — per-exercise history (`#/exercise/:ref`): all done sets for one exercise (exact `exerciseRef`) over time, newest first. Companion to Progress; reuses `setWeightDisplay` + the shared kg/lb unit. Reached by tapping an exercise name in History.
- `supabase/workouts.sql` — the workouts table migration (run in Supabase SQL editor)
- `vite.config.ts` — Vite build + `vite-plugin-pwa` (service worker / PWA; the manifest stays hand-written in `public/manifest.webmanifest`)
