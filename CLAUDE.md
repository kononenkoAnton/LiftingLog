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
  under the trainer's number). Bar = 45 lb; plates per side = 45/35/25/10/5/2.5.
- **Coach weights are TOTALS; logged barbell weights are PLATES (excl. the bar).**
  The trainer's kg is the total on the bar (`computeBarbellLoad` + session screen).
  A logged barbell `weightLb` is only the plates you load — full lift =
  `fullBarLb(weightLb)` = `weightLb + 45` (`load.ts`). So the coach pre-fill
  subtracts the bar, and `trainerLog` / Max chips / history add it back before
  converting to kg. Per-side plates for a logged set = `platesForPlateLb`
  (`decompose(plateLb/2)`), NOT the total-based `computeBarbellLoad`. Non-barbell
  equipment (dumbbell/machine/bodyweight) is logged as-is — no bar.
- **Barbell viz is a static 2D SVG** (`src/components/barbell-svg.ts`). three.js
  was removed — do not reintroduce it without reason.
- **Progress** persists to `localStorage` under `liftinglog:logs` as
  `{ finished: {...} }`. Leave room for future logger keys (sets, timer, notes).
- **Rendering uses `innerHTML` with trusted static data.** User-entered text is a
  stored-XSS sink and must use `textContent` / an input's `.value` property — NEVER
  an `innerHTML` template. Live sinks: the **coach message** in `logging.ts`
  (textarea `.value`) and `history.ts` (built with `createElement` + `textContent`).
  Verified with an `<img onerror>` probe.
- **Cyrillic gotcha:** JS `\w`/`\b` do NOT match Cyrillic. Use `[а-яё]` classes
  and whitespace anchors in any Russian-text regex.

## Workflow

- `npm run dev` / `npm run build` / `npm run preview`
- `npm run test` — Vitest (plate math, focus/tags, data shape). Keep green.
- `npm run parse` — regenerate `program.json` from the doc (see `update-program`).
- Verify UI changes in a real browser at phone width (~390px); confirm zero
  console errors before claiming done.
- Commit per change with a clear message.

## Key files

- `src/lib/load.ts` — kg→lb + plate math (pure, tested)
- `src/lib/focus.ts` — session focus label + main-lift tags
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
- `scripts/parse-program.mjs` — deterministic doc → program.json parser
- `.claude/skills/update-program/` — the re-parse skill + rules
- `docs/superpowers/` — original spec and plan
- `src/lib/logger-model.ts` — pure logger model (rest defaults, pre-fill from coach, duration, Last reference; tested)
- `src/lib/logger-types.ts` — `Workout`/`WorkoutExercise`/`LoggedSet` types
- `src/lib/workouts.ts` — workout storage seam (Supabase JSONB + localStorage mirror)
- `src/screens/logging.ts` — logging-mode screen (set table, timers, notes, finish/cancel)
- `src/screens/history.ts` — past finished workouts (#/history)
- `supabase/workouts.sql` — the workouts table migration (run in Supabase SQL editor)
