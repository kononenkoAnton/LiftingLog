# Home-screen kg/lb Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add a visible kg/lb toggle to the home screen that flips the Max and ~1RM chips, sharing the persisted `liftinglog:unit` setting with History.

**Architecture:** Extract the unit getter/setter into `src/lib/unit.ts` (shared). Add `bestE1rmLb` alongside `bestE1rmKg` in `e1rm.ts` (round once from precise lb). `list.ts` renders unit-aware chips and a reused `.unit-toggle`, repainting chips in place on toggle.

**Tech Stack:** TypeScript, Vite, Vitest. No new dependencies.

---

### Task 1: Shared unit module

**Files:**
- Create: `src/lib/unit.ts`
- Modify: `src/screens/history.ts:11-14`

- [ ] **Step 1: Create the module**

`src/lib/unit.ts`:

```ts
// Shared display-unit setting (kg/lb), persisted to localStorage; defaults to kg.
// Single source of truth for the History and home screens.
import type { Unit } from './logger-model'

export const UNIT_KEY = 'liftinglog:unit'

export const getUnit = (): Unit => {
  try { return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg' } catch { return 'kg' }
}

export const setUnit = (u: Unit): void => {
  try { localStorage.setItem(UNIT_KEY, u) } catch { /* ignore */ }
}
```

- [ ] **Step 2: Point history.ts at it**

In `src/screens/history.ts`, replace lines 11–14:

```ts
// Display unit for weights, persisted; defaults to kg.
const UNIT_KEY = 'liftinglog:unit'
const getUnit = (): Unit => { try { return localStorage.getItem(UNIT_KEY) === 'lb' ? 'lb' : 'kg' } catch { return 'kg' } }
const setUnit = (u: Unit) => { try { localStorage.setItem(UNIT_KEY, u) } catch { /* ignore */ } }
```

with:

```ts
import { getUnit, setUnit } from '../lib/unit'
```

(Place the import with the other imports at the top; delete the three const lines. `UNIT_KEY` was only used by those two functions, so it's no longer referenced here.)

- [ ] **Step 3: Build to verify no breakage**

Run: `npm run build`
Expected: tsc passes (History still compiles; `Unit` type still imported from `logger-model`).

- [ ] **Step 4: Commit**

```bash
git add src/lib/unit.ts src/screens/history.ts
git commit -m "refactor(unit): extract shared getUnit/setUnit into lib/unit.ts"
```

---

### Task 2: `bestE1rmLb` (round once from precise lb)

**Files:**
- Modify: `src/lib/e1rm.ts`
- Test: `src/lib/e1rm.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/e1rm.test.ts` (add `bestE1rmLb` to the import on line 2 →
`import { epley1rm, bestE1rmKg, bestE1rmLb } from './e1rm'`), then add:

```ts
describe('bestE1rmLb', () => {
  it('returns null when nothing qualifies', () => {
    expect(bestE1rmLb([], /squat/i)).toBeNull()
  })

  it('returns the best full e1RM in lb, rounded once (bar added back)', () => {
    // 1x135 plates → (135+45)*(1+1/30)=186.0 lb → 186
    const w = wk({ exercises: [ex('Bench Press', 'barbell', [set(135, 1)])] })
    expect(bestE1rmLb([w], /bench/i)).toBe(186)
  })

  it('does not double-round (lb is rounded from precise lb, not from rounded kg)', () => {
    // 5x140 → (140+45)*(1+5/30)=215.833 lb → bestE1rmLb=216; kg path = round(215.833/2.20462)=98
    const w = wk({ exercises: [ex('Back Squat', 'barbell', [set(140, 5)])] })
    expect(bestE1rmLb([w], /squat/i)).toBe(216)
    expect(bestE1rmKg([w], /squat/i)).toBe(98)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/e1rm.test.ts`
Expected: FAIL — `bestE1rmLb is not a function`.

- [ ] **Step 3: Refactor with an internal raw helper + two rounders**

In `src/lib/e1rm.ts`, replace the whole `bestE1rmKg` function with:

```ts
// Best estimated 1RM as PRECISE full lb (incl. the 45 lb bar) over finished
// workouts for barbell lifts matching `match`, or null if none. Internal — callers
// round once into the unit they display.
function bestE1rmFullLb(history: Workout[], match: RegExp): number | null {
  let maxLb = 0
  for (const w of history) {
    if (w.status !== 'finished') continue
    for (const exr of w.exercises) {
      if (exr.equipment !== 'barbell' || !match.test(exr.nameEn)) continue
      for (const s of exr.sets) {
        if (!s.done || s.weightLb === null || s.reps === null) continue
        if (!Number.isInteger(s.reps) || s.reps < 1) continue
        maxLb = Math.max(maxLb, epley1rm(s.weightLb + BAR_LB, s.reps))
      }
    }
  }
  return maxLb > 0 ? maxLb : null
}

/** Best estimated 1RM in kg over finished workouts for lifts matching `match`, or null. */
export function bestE1rmKg(history: Workout[], match: RegExp): number | null {
  const lb = bestE1rmFullLb(history, match)
  return lb === null ? null : Math.round(lb / KG_TO_LB)
}

/** Best estimated 1RM in lb (full, incl. bar) over finished workouts, or null. */
export function bestE1rmLb(history: Workout[], match: RegExp): number | null {
  const lb = bestE1rmFullLb(history, match)
  return lb === null ? null : Math.round(lb)
}
```

(The doc comment above the old `bestE1rmKg` about plates/bar/non-global regex now
belongs on `bestE1rmFullLb` — keep that context there.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/e1rm.test.ts`
Expected: PASS — all `epley1rm`, `bestE1rmKg`, `bestE1rmLb` cases green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/e1rm.ts src/lib/e1rm.test.ts
git commit -m "feat(e1rm): add bestE1rmLb; round once from precise full lb"
```

---

### Task 3: Unit-aware chips + toggle on the home screen

**Files:**
- Modify: `src/screens/list.ts`

- [ ] **Step 1: Imports**

In `src/screens/list.ts`, change the e1rm import and add the unit import. Replace:

```ts
import { bestE1rmKg } from '../lib/e1rm'
```

with:

```ts
import { bestE1rmKg, bestE1rmLb } from '../lib/e1rm'
import { getUnit, setUnit } from '../lib/unit'
import type { Unit } from '../lib/logger-model'
```

- [ ] **Step 2: Replace the chip helpers with unit-aware versions**

Replace the existing `e1rmChip` function:

```ts
// User's best estimated 1RM (kg) for a lift from logged sets; '—' if none logged yet.
function e1rmChip(match: RegExp): string {
  const kg = bestE1rmKg(listWorkouts(), match)
  return kg === null ? '—' : `~${kg}<span class="u">kg</span>`
}
```

with both helpers:

```ts
// Coach/best Max for a lift in the chosen unit (coach prescribes kg; lb is a conversion).
function maxChip(match: RegExp, unit: Unit): string {
  const kg = maxKgFor(match)
  const v = unit === 'kg' ? kg : Math.round(kg * KG_TO_LB)
  return `${v}<span class="u">${unit}</span>`
}

// User's best estimated 1RM for a lift from logged sets in the chosen unit; '—' if none.
function e1rmChip(match: RegExp, unit: Unit): string {
  const v = unit === 'kg' ? bestE1rmKg(listWorkouts(), match) : bestE1rmLb(listWorkouts(), match)
  return v === null ? '—' : `~${v}<span class="u">${unit}</span>`
}
```

- [ ] **Step 3: Read the unit and render the toggle + unit-aware chip rows**

In `renderList`, immediately after `const total = program.sessions.length`, add:

```ts
  let unit = getUnit()
  const LIFTS: RegExp[] = [/deadlift/i, /squat/i, /bench/i]
```

In the hero-actions markup, add the toggle as the first child. Replace:

```ts
        <div class="hero-actions">
          <a class="hist-link" href="#/history" aria-label="History">History</a>
```

with:

```ts
        <div class="hero-actions">
          <div class="unit-toggle" role="group" aria-label="Weight unit">
            <button class="ut ${unit === 'kg' ? 'on' : ''}" data-unit="kg" type="button">kg</button>
            <button class="ut ${unit === 'lb' ? 'on' : ''}" data-unit="lb" type="button">lb</button>
          </div>
          <a class="hist-link" href="#/history" aria-label="History">History</a>
```

Replace the Max-chips row:

```ts
      <div class="stats2">
        <div class="chip2"><div class="n2 mono" style="color:#e3b341">${maxKgFor(/deadlift/i)}<span class="u">kg</span></div><div class="l2">Max Deadlift</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#e23b3b">${maxKgFor(/squat/i)}<span class="u">kg</span></div><div class="l2">Max Squat</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#3b74e6">${maxKgFor(/bench/i)}<span class="u">kg</span></div><div class="l2">Max Bench</div></div>
      </div>
      <div class="stats2">
        <div class="chip2"><div class="n2 mono" style="color:#e3b341">${e1rmChip(/deadlift/i)}</div><div class="l2">~1RM Deadlift</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#e23b3b">${e1rmChip(/squat/i)}</div><div class="l2">~1RM Squat</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#3b74e6">${e1rmChip(/bench/i)}</div><div class="l2">~1RM Bench</div></div>
      </div>
```

with (ids added, helpers take `unit`):

```ts
      <div class="stats2" id="maxRow">
        <div class="chip2"><div class="n2 mono" style="color:#e3b341">${maxChip(/deadlift/i, unit)}</div><div class="l2">Max Deadlift</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#e23b3b">${maxChip(/squat/i, unit)}</div><div class="l2">Max Squat</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#3b74e6">${maxChip(/bench/i, unit)}</div><div class="l2">Max Bench</div></div>
      </div>
      <div class="stats2" id="e1rmRow">
        <div class="chip2"><div class="n2 mono" style="color:#e3b341">${e1rmChip(/deadlift/i, unit)}</div><div class="l2">~1RM Deadlift</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#e23b3b">${e1rmChip(/squat/i, unit)}</div><div class="l2">~1RM Squat</div></div>
        <div class="chip2"><div class="n2 mono" style="color:#3b74e6">${e1rmChip(/bench/i, unit)}</div><div class="l2">~1RM Bench</div></div>
      </div>
```

- [ ] **Step 4: Wire the toggle (repaint chips in place)**

After the existing `refreshProgress()` call near the end of `renderList` (before the
signout handler), add:

```ts
  const maxRow = el.querySelector('#maxRow')!
  const e1rmRow = el.querySelector('#e1rmRow')!
  function paintChips() {
    maxRow.querySelectorAll<HTMLElement>('.n2').forEach((n, i) => { n.innerHTML = maxChip(LIFTS[i], unit) })
    e1rmRow.querySelectorAll<HTMLElement>('.n2').forEach((n, i) => { n.innerHTML = e1rmChip(LIFTS[i], unit) })
  }
  el.querySelectorAll<HTMLButtonElement>('.ut').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u = btn.dataset.unit as Unit
      if (u === unit) return
      unit = u
      setUnit(u)
      el.querySelectorAll('.ut').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.unit === u))
      paintChips()
    })
  })
```

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: tsc + vite pass, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/screens/list.ts
git commit -m "feat(list): add kg/lb toggle that flips the Max and ~1RM chips"
```

---

### Task 4: Full verification

- [ ] **Step 1: Run the full suite**

Run: `npm run test`
Expected: all suites green (existing + new `bestE1rmLb` tests).

- [ ] **Step 2: Browser verification @390px**

Force localStorage mode (temporary `.env.local` with empty `VITE_SUPABASE_*`),
`npm run dev`, viewport 390px. Seed a finished workout in
`localStorage['liftinglog:workouts']`, hard-reload (`?reload=1#/`). Verify:
- Tapping `lb` flips BOTH rows to lb (Max = kg×2.205 rounded; ~1RM = full lb); `kg` flips back.
- The active button shows `.on`; the header does not overflow and the title isn't clipped.
- Persistence/sync: set `lb` on Home → open `#/history` → it shows lb; toggle back on either → both agree (`liftinglog:unit`).
- **Zero console errors.**
Remove `.env.local` and stop the dev server when done.

- [ ] **Step 3: Update CLAUDE.md**

Add `src/lib/unit.ts` to the Key files list, after the `progress.ts` entry:

```
- `src/lib/unit.ts` — shared kg/lb display-unit setting (localStorage `liftinglog:unit`)
```

Also update the `liftinglog:unit` note in the Progress bullet from "History kg/lb
display toggle" to "History + home kg/lb display toggle".

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): note shared lib/unit.ts and home unit toggle"
```

---

## Self-review

- **Spec coverage:** shared unit module (Task 1) ✓; bestE1rmLb round-once (Task 2) ✓;
  reused toggle in hero-actions (Task 3) ✓; both rows convert + repaint in place (Task 3) ✓;
  persistence shared with History (Tasks 1 + 4 verify) ✓; Max-in-lb conversion accepted (Task 3 `maxChip`) ✓; docs (Task 4) ✓.
- **Placeholders:** none — full code and exact anchors throughout.
- **Type consistency:** `getUnit`/`setUnit` signatures match across unit.ts/history.ts/list.ts; `maxChip(match, unit)` and `e1rmChip(match, unit)` both take `Unit`; `bestE1rmLb` mirrors `bestE1rmKg`; `paintChips` indexes `LIFTS` in DL/SQ/BN order matching the rendered chip order.
