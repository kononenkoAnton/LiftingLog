# LiftingLog

Mobile-first viewer for a strength program. Bilingual (EN/RU), kg→lb conversion,
and exact per-side barbell plate loading. Static app — no backend.

Built with Vite + TypeScript, GSAP, and a three.js barbell hero.

## Develop
- `npm install`
- `npm run dev` — local dev server
- `npm run test` — unit tests (load math, focus, data shape)
- `npm run build` — production build to `dist/`
- `npm run preview` — preview the build

## Deploy
`dist/` is static; deploy to Netlify, Vercel, or GitHub Pages. `base: './'` in
`vite.config.ts` makes it path-independent.

## PWA / install
The app is an installable PWA. `index.html` references a hand-written
`public/manifest.webmanifest` plus icons (`icon-192/512`, `apple-touch-icon`,
`favicon-32`). A service worker is generated at build time by
[`vite-plugin-pwa`](https://vite-pwa-org.netlify.app/) (`vite.config.ts`, configured
with `manifest: false` so the plugin owns only the SW, not the manifest). It
precaches the built app shell, so the app loads offline and Chrome/Android show the
"Install" prompt (iOS "Add to Home Screen" works via the apple meta tags).
`registerType: 'autoUpdate'` means a new deploy takes over on the next load — no
reload prompt. Supabase API calls are cross-origin and pass straight to the network,
so the SW never serves stale auth/data. The SW only runs in the production build
(`npm run build` → `dist/sw.js`), not `npm run dev`.

The rest timer keeps a near-silent audio loop playing during rest so the end-of-rest
gong fires even when the phone is locked (best-effort); on return it catches up from
the wall clock. Note: an iPhone's physical mute switch silences web audio, and iOS has
no web vibration — in those cases the timer still shows the correct time on return.

## Plates & bar
Bar = 45 lb. Plates per side = 45, 35, 25, 10, 5 lb — **no 2.5 lb microplates** (rarely
stocked). Targets round UP **per side to the nearest 5 lb** (the smallest plate) — the
nearest achievable load, never under the trainer's number. Logic in `src/lib/load.ts`
(`computeBarbellLoad`), covered by unit tests. Non-barbell lifts (dumbbell/machine/cable)
round to the **nearest** 5 lb (`roundToStep` — the closest fixed size you'd grab, not up).

**Coach prescriptions are totals; logged weights are plates.** The trainer's kg is
the *total* on the bar (bar + plates) — that's what `computeBarbellLoad` and the
session screen show. In the **logger**, a barbell set's weight is the *plate*
weight you load, **excluding** the 45 lb bar (`platesForPlateLb` = `decompose(plateLb/2)`).
The full lifted weight = `fullBarLb(plateLb)` = `plateLb + 45`. So coach pre-fills
subtract the bar (total → plates), and the trainer log / Max chips add it back
(plates → full weight in kg). Non-barbell equipment (dumbbell, machine, bodyweight)
is logged as-is, no bar.

## Exercise catalog

The exercise database (`src/data/exercises.json`) is generated from the
[wger](https://wger.de) open exercise database (© wger contributors, licensed
**CC-BY-SA 4.0**) by `npm run build:catalog` (`scripts/build-catalog.mjs`).
Equipment is inferred from each exercise's English name; Russian names are used
where wger provides them, otherwise they fall back to English (flagged
`ruIsFallback`). Hand-authored entries/overrides live in
`scripts/catalog-extras.json` and are merged on top during the build.

## Updating the program (re-parse)
Source: the trainer's Google Doc. The app reads `src/data/program.json`. When the
trainer adds sessions, regenerate that file by re-parsing the Doc — translate +
classify equipment per the glossary in
`docs/superpowers/plans/2026-06-11-lifting-log.md` (Task 6), then commit. Pounds
and plate breakdowns are computed at runtime, so the data file only holds kg
targets, sets/reps, names, and notes — no math to redo.

## Project layout
- `src/lib/load.ts` — kg→lb + plate math (pure, tested)
- `src/lib/focus.ts` — derives a session focus label ("Bench + Deadlift")
- `src/data/` — `types.ts`, `program.json` (55 sessions), `program.ts` loader
- `src/screens/` — `list.ts` (program), `session.ts` (detail), `progress.ts` (e1RM trends), `exercise-history.ts` (per-exercise set history)
- `src/components/sparkline-svg.ts` — pure inline-SVG sparkline (e1RM trend on `#/progress`)
- `src/components/` — `barbell.ts` (three.js hero), `barbell-svg.ts` (fallback)
- `src/router.ts` — hash router; `src/styles/` — Reactor theme

## Accessibility / fallbacks
- Mobile-first (~390px), scales up.
- `prefers-reduced-motion`: animations disabled, barbell renders as static SVG.
- No WebGL: barbell falls back to SVG automatically.

## Roadmap (Phase 2)
Logger: mark sets done, rest timer, notes to the trainer (reserved `localStorage`
namespace `liftinglog:logs`).
