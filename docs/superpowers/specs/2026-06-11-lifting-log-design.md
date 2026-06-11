# LiftingLog — Design Spec

**Date:** 2026-06-11
**Status:** Approved (brainstorming)
**Author:** Anton + Claude

## 1. Purpose

A mobile-first, award-grade web app that renders a strength-training program
(authored by a trainer in a Google Doc) as a polished, animated experience. The
user follows the program session by session, sees each lift's target weight in
both kilograms and pounds, and — for barbell lifts — gets an exact per-side plate
loading breakdown.

Phase 1 (this spec): read-only program viewer with the barbell loader.
Phase 2 (later, out of scope here): a logger — mark sets done, rest timer, notes
to the trainer. The architecture must not block Phase 2.

## 2. Source data

Trainer's Google Doc:
`https://docs.google.com/document/d/1b5RGwxGWkxLRidCiblM07hcqnTFrgxQrkpkXyMuN81E`

Structure (observed): 55 sessions. Each session is a block:

```
**DD/MM/YYYY №N**
1) <exercise, russian>, <weight> кг, <sets>/<reps> [notes].
2) ...
________  (separator)
```

Parsing quirks the parser/translator must handle:
- Weight forms: single (`75 кг`), range (`25-28 кг`), progression
  (`105-120-130`), approximate (`приблизительно 70-75`), per-set schemes
  (`120/3, 135/3, 145/2`), and qualitative (`тяжелый` / `средний` / `легкий`).
- Sets/reps forms: `4 подхода/3 повторения`, `3/4`, `3/15-20`, `3/10-12`,
  fractions rendered oddly (`⅗`, `¾`).
- Inline notes / coaching cues (`пауза 2 секунды`, `садись ниже`,
  `можно заменить на ...`).
- Equipment is implied by exercise name, not labeled.

## 3. Architecture

Static single-page app. No backend, no API key, deployable to any static host.

- **Build:** Vite + TypeScript, vanilla (no UI framework). Direct DOM control
  for GSAP/three.js; lean bundle.
- **Routing:** tiny hash router. `#/` = program list, `#/session/:n` = detail.
- **Animation:** GSAP for screen transitions and the plate-loading sequence.
- **3D:** three.js barbell hero (bar + plates). CSS/SVG fallback when WebGL is
  unavailable or `prefers-reduced-motion` is set.
- **Data:** generated `src/data/program.json`, loaded at startup.
- **Phase-2 hook:** a reserved `localStorage` namespace (`liftinglog:logs`) and
  screen structure that lets a logger slot in without a rewrite. No logger code
  in Phase 1.

### The "AI parse" pipeline (data-prep, not runtime)

Because we chose parse-to-JSON, the AI/translation work happens at authoring time
and produces `program.json`. The app never calls an LLM.

- Initial parse: Claude reads the Doc and generates `program.json` covering all
  55 sessions.
- Re-parse (when the trainer adds sessions): re-run the parse to regenerate the
  JSON. Documented in `README` / a `scripts/` note. (A fully automated fetch is a
  possible later enhancement, not required for Phase 1.)
- Barbell math is **not** stored in the JSON — it is computed at runtime from the
  kg target by pure, tested functions, so the data stays clean and the
  calculator stays independently testable.

## 4. Data model

`program.json`:

```ts
type Program = { title: string; sessions: Session[] }

type Session = {
  num: number            // 1..55
  date: string           // ISO "2026-01-21" (or first date for ranges like 09-10/03)
  dateLabel: string      // "21 Jan"
  focus: string          // auto-derived, e.g. "Bench + Pull"
  exercises: Exercise[]
}

type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight'

type Weight =
  | { kind: 'single'; kg: number }
  | { kind: 'range'; minKg: number; maxKg: number }
  | { kind: 'progression'; kg: number[] }        // 105-120-130
  | { kind: 'perSet'; steps: { kg: number; reps: number }[] }  // 120/3,135/3
  | { kind: 'qualitative'; level: 'light' | 'medium' | 'heavy' }
  | { kind: 'bodyweight' }

type Exercise = {
  order: number
  nameEn: string
  nameRu: string         // original
  descEn: string         // full bilingual description incl. cues
  descRu: string
  equipment: Equipment
  perImplement?: boolean // dumbbells: weight is per dumbbell
  weight: Weight
  sets: number | null
  reps: string           // "3", "15-20", "AMRAP-ish" preserved as text
  notesEn?: string
  notesRu?: string
}
```

`focus` is derived from the exercises (primary barbell movements → labels like
"Squat + Press", "Bench + Deadlift").

## 5. Weight & plate logic (core correctness)

All in a pure module `src/lib/load.ts`, written test-first (TDD).

- `kgToLb(kg) = kg * 2.20462`.
- Constants: `BAR_LB = 45`, `PLATES_LB = [45, 35, 25, 10, 5, 2.5]`
  (per side, effectively unlimited count).
- `computeBarbellLoad(kg)`:
  1. `targetLb = kgToLb(kg)`.
  2. Round the **total** UP to the nearest achievable load. Achievable totals =
     `45 + 5k` (because the smallest per-side plate is 2.5 → 5 lb total step), so
     `total = max(45, roundUpToStep(targetLb, 5))` with the 45 floor.
  3. `perSide = (total - 45) / 2`.
  4. Greedy-decompose `perSide` into `PLATES_LB` → `{ plate, count }[]`.
  5. Return `{ targetLb, totalLb, perSideLb, plates }`.
  - Rounding direction: **always up** — never load under the trainer's target.
- Ranges/progressions/perSet: run `computeBarbellLoad` per numeric load and show
  each breakdown.
- Qualitative / bodyweight: no bar math; render a tag.
- Dumbbell: show per-dumbbell kg + lb (`perImplement`), no bar math.

Edge cases to test: target already ≤ 45 lb (empty bar / not a barbell move);
exact multiples; progression arrays; range endpoints; rounding boundary
(165.3 → 170, not 165).

## 6. Visual design — "Reactor"

Approved direction. Deep navy (`#070b14`) base, mint→blue accent
(`#27e6b4` → `#5ea8ff`), glass cards, monospace numerals, neon barbell.

### Program list
- Hero header (program title + date span).
- Stat chips: total sessions, up-next, top numbers.
- Workout rows: session №, date, auto `focus` label, exercise count. Current/next
  session highlighted.

### Session detail
- Barbell-loader hero for the focused lift: big kg, `lb → rounded` conversion,
  3D/animated barbell with plates, per-side breakdown.
- Sets / reps / pause tiles.
- Bilingual description (English primary, Russian beneath) + trainer notes.
- Compact rows for the session's remaining exercises; tapping refocuses the hero.

### Motion
- GSAP page transitions (list ↔ detail).
- Plate-loading animation: plates animate onto the bar on entry.
- Respect `prefers-reduced-motion`: static render, no autoplay.

## 7. Accessibility & responsiveness

- Mobile-first (design target ~390px); scales up gracefully.
- Sufficient contrast on the dark theme; legible numerals.
- Reduced-motion fallback; WebGL fallback to SVG barbell.

## 8. Verification

- Unit tests for `load.ts` (Vitest), test-first.
- Drive the running app via Playwright/Chrome DevTools at phone widths; confirm
  layout, transitions, and that plate breakdowns render correctly for a sample of
  sessions (single, range, progression, qualitative, dumbbell).

## 9. Out of scope (Phase 1)

- Logger, rest timer, notes-to-trainer (Phase 2).
- Automated live Doc fetch / runtime LLM calls.
- Auth, multi-user, cloud sync.

## 10. Deliverables

- Vite + TS project, runnable via `npm run dev`, buildable via `npm run build`.
- `src/data/program.json` covering all 55 sessions, bilingual + classified.
- Tested `src/lib/load.ts`.
- Reactor UI: program list + session detail, GSAP + three.js.
- README documenting run, build, deploy, and the re-parse step.
