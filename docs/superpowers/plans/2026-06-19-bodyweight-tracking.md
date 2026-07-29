# Bodyweight Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated `#/bodyweight` screen that records the lifter's actual bodyweight over time (one entry per day) and shows the trend as a sparkline, with editable history.

**Architecture:** A new storage seam mirroring `progress.ts` (in-memory cache → localStorage + Supabase) backed by a `bodyweight` table, a pure model for parse/format (unit-tested), and a screen that reuses the existing `sparklineSvg` + kg/lb unit-toggle patterns. Stores kilograms only; displays in the shared unit.

**Tech Stack:** Vite + TypeScript (vanilla, no framework), Vitest, Supabase (Postgres + RLS).

**⚠️ Commit policy for this branch:** Per the user's instruction, **do NOT commit code until the user has reviewed the working tree.** Every task below ends in a *verification* step (run tests / typecheck), NOT a commit. The single commit happens only in the final task, after explicit user approval. The spec doc is already committed separately.

**Spec:** `docs/superpowers/specs/2026-06-19-bodyweight-tracking-design.md`

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/lib/bodyweight-model.ts` | PURE: `BodyEntry` type, `parseWeightInput`, `formatWeight` | Create |
| `src/lib/bodyweight-model.test.ts` | Vitest for the pure model | Create |
| `src/lib/bodyweight.ts` | SEAM: cache + localStorage + Supabase, `todayLocalIso` | Create |
| `supabase/bodyweight.sql` | Table + RLS migration | Create |
| `src/screens/bodyweight.ts` | `#/bodyweight` render + interactions | Create |
| `src/main.ts` | Route + boot hydration | Modify |
| `src/screens/list.ts` | Home nav link | Modify |
| `src/screens/progress.ts` | Link to bodyweight | Modify |
| `src/styles/app.css` | Screen styles | Modify |
| `CLAUDE.md` | Key files + conventions | Modify |
| `README.md` | "Bodyweight" section | Modify |

---

## Task 1: Pure model (`bodyweight-model.ts`) — TDD

**Files:**
- Create: `src/lib/bodyweight-model.ts`
- Test: `src/lib/bodyweight-model.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/bodyweight-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseWeightInput, formatWeight } from './bodyweight-model'

describe('parseWeightInput', () => {
  it('parses a kg value as kilograms unchanged', () => {
    expect(parseWeightInput('82', 'kg')).toBeCloseTo(82, 5)
    expect(parseWeightInput('82.4', 'kg')).toBeCloseTo(82.4, 5)
  })

  it('converts an lb value to kilograms', () => {
    expect(parseWeightInput('181.7', 'lb')).toBeCloseTo(181.7 / 2.20462, 4)
  })

  it('accepts a comma decimal separator (RU locale)', () => {
    expect(parseWeightInput('82,4', 'kg')).toBeCloseTo(82.4, 5)
  })

  it('trims surrounding whitespace', () => {
    expect(parseWeightInput('  82  ', 'kg')).toBeCloseTo(82, 5)
  })

  it('rejects empty, non-numeric, zero, and negative input', () => {
    expect(parseWeightInput('', 'kg')).toBeNull()
    expect(parseWeightInput('abc', 'kg')).toBeNull()
    expect(parseWeightInput('0', 'kg')).toBeNull()
    expect(parseWeightInput('-5', 'kg')).toBeNull()
  })

  it('rejects absurd values over 500 kg', () => {
    expect(parseWeightInput('501', 'kg')).toBeNull()
    expect(parseWeightInput('1200', 'lb')).toBeNull() // ~544 kg
  })
})

describe('formatWeight', () => {
  it('formats kg to one decimal', () => {
    expect(formatWeight(82, 'kg')).toBe('82.0')
    expect(formatWeight(82.44, 'kg')).toBe('82.4')
  })

  it('formats kg as lb to one decimal', () => {
    expect(formatWeight(82, 'lb')).toBe((82 * 2.20462).toFixed(1))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/bodyweight-model.test.ts`
Expected: FAIL — cannot resolve `./bodyweight-model` / `parseWeightInput is not a function`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/bodyweight-model.ts`:

```ts
// Pure bodyweight helpers — no I/O, unit-testable like logger-model.ts.
// Bodyweight is stored as KILOGRAMS (project convention: data holds kg only);
// the screen interprets typed input in the active display unit and converts here.
import { KG_TO_LB } from './load'
import type { Unit } from './logger-model'

export interface BodyEntry {
  day: string // local calendar date, 'YYYY-MM-DD'
  weightKg: number
}

const MAX_KG = 500 // sanity cap — reject absurd input

/**
 * Parse a user-typed weight (in the active unit) into kilograms.
 * Returns null for empty / non-numeric / <= 0 / absurd (> 500 kg) input.
 * Accepts a comma decimal separator (the app is bilingual EN/RU).
 */
export function parseWeightInput(raw: string, unit: Unit): number | null {
  const n = Number(String(raw).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n <= 0) return null
  const kg = unit === 'lb' ? n / KG_TO_LB : n
  if (kg > MAX_KG) return null
  return kg
}

/** Format a stored kg weight for display in the active unit (1 decimal place). */
export function formatWeight(kg: number, unit: Unit): string {
  const v = unit === 'lb' ? kg * KG_TO_LB : kg
  return v.toFixed(1)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/bodyweight-model.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Verify (no commit — see commit policy)**

Run: `npm run test`
Expected: the whole suite stays green. Do NOT commit yet.

---

## Task 2: Supabase migration (`bodyweight.sql`)

**Files:**
- Create: `supabase/bodyweight.sql`

- [ ] **Step 1: Create the migration file**

Create `supabase/bodyweight.sql`:

```sql
-- Bodyweight tracking. One row per (user, local day); the lifter's actual
-- bodyweight in kilograms. Re-logging a day upserts. Run this in the Supabase
-- SQL editor (same project as the `workouts` / `progress` tables).
-- RLS uses (auth.jwt() ->> 'sub')::uuid because this project's newer JWT signing
-- keys make auth.uid() return null (same pattern as workouts.sql).

create table if not exists public.bodyweight (
  user_id    uuid not null default (auth.jwt() ->> 'sub')::uuid,
  day        date not null,
  weight_kg  numeric not null,
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

- [ ] **Step 2: Verify**

This is a SQL file run manually in Supabase by the user (like `workouts.sql`); no automated step. Confirm the PK is `(user_id, day)` so the seam's `onConflict: 'user_id,day'` upsert resolves. Do NOT commit yet.

---

## Task 3: Storage seam (`bodyweight.ts`)

**Files:**
- Create: `src/lib/bodyweight.ts`

Mirrors `progress.ts` (cache + `currentUserId`) and `workouts.ts` (always writes the localStorage mirror so the app is offline-safe).

- [ ] **Step 1: Create the seam**

Create `src/lib/bodyweight.ts`:

```ts
// Bodyweight storage seam — mirrors progress.ts. A sync in-memory cache hydrated
// once at boot (loadBodyweight), written through to localStorage (offline-safe
// mirror, like workouts.ts) and Supabase when configured. One row per local day;
// re-logging overwrites. Stores kilograms only (project convention).
import { supabase } from './supabase'
import { toast } from './toast'
import type { BodyEntry } from './bodyweight-model'

const KEY = 'liftinglog:bodyweight'
let cache: Record<string, number> = {} // day 'YYYY-MM-DD' → kg
let userId: string | null = null

function readLocal(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY)
    const obj = raw ? JSON.parse(raw) : null
    if (obj && typeof obj === 'object') return obj as Record<string, number>
  } catch { /* corrupt or unavailable */ }
  return {}
}

function writeLocal(): void {
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* ignore */ }
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  if (userId) return userId
  const { data: { session } } = await supabase.auth.getSession()
  userId = session?.user?.id ?? null
  return userId
}

/** Local calendar date as 'YYYY-MM-DD' (NOT toISOString — that's UTC and could roll the day). */
export function todayLocalIso(): string {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** Hydrate the cache. Call once at startup (after auth) before rendering. */
export async function loadBodyweight(): Promise<void> {
  if (!supabase) { cache = readLocal(); return }
  await currentUserId()
  const { data, error } = await supabase
    .from('bodyweight')
    .select('day, weight_kg')
  if (error) { console.error('[bodyweight] load failed', error); cache = readLocal(); return }
  cache = {}
  if (data) for (const r of data) cache[String(r.day)] = Number(r.weight_kg)
}

/** All entries oldest → newest (for the sparkline). */
export function listBodyweight(): BodyEntry[] {
  return Object.entries(cache)
    .map(([day, weightKg]) => ({ day, weightKg }))
    .sort((a, b) => a.day.localeCompare(b.day))
}

/** A single day's kg, or null (used to prefill the quick-add input with today). */
export function getBodyweight(day: string): number | null {
  return cache[day] ?? null
}

/** Upsert one day's bodyweight (write-through). Re-logging overwrites. */
export async function logBodyweight(day: string, kg: number): Promise<void> {
  cache[day] = kg // optimistic
  writeLocal()
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) { toast('Not signed in — saving locally', 'info'); return }
  const { error } = await supabase.from('bodyweight').upsert(
    { day, weight_kg: kg },
    { onConflict: 'user_id,day' },
  )
  if (error) { console.error('[bodyweight] save failed', error); toast(`Save failed: ${error.message}`, 'error') }
}

/** Delete one day's bodyweight. */
export async function deleteBodyweight(day: string): Promise<void> {
  delete cache[day]
  writeLocal()
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  const { error } = await supabase.from('bodyweight').delete().eq('day', day)
  if (error) { console.error('[bodyweight] delete failed', error); toast(`Delete failed: ${error.message}`, 'error') }
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (The seam isn't unit-tested — matching `progress.ts`/`workouts.ts`, which have side effects; correctness is covered by the model test + manual verification.) Do NOT commit yet.

---

## Task 4: Screen (`bodyweight.ts`)

**Files:**
- Create: `src/screens/bodyweight.ts`

All rendered values are numbers (`formatWeight`) or derived date labels and `YYYY-MM-DD` day keys — no free-text user input — so `innerHTML` is safe here (same as `progress.ts`). Inputs/buttons are wired via listeners after each render. Both editable inputs reuse `.lg-inp` (already `font-size:16px`, satisfying the iOS-zoom rule).

- [ ] **Step 1: Create the screen**

Create `src/screens/bodyweight.ts`:

```ts
// Bodyweight screen (#/bodyweight): log today's bodyweight, view the trend as a
// sparkline, edit/delete past entries. Reads/writes the bodyweight seam. Rendered
// values are numbers/derived dates (no free-text), so innerHTML is safe (like
// progress.ts); inputs are wired via listeners. Editable inputs use .lg-inp (16px,
// iOS-zoom-safe).
import { listBodyweight, getBodyweight, logBodyweight, deleteBodyweight, todayLocalIso } from '../lib/bodyweight'
import { parseWeightInput, formatWeight } from '../lib/bodyweight-model'
import { sparklineSvg } from '../components/sparkline-svg'
import { getUnit, setUnit } from '../lib/unit'
import { toast } from '../lib/toast'
import type { Unit } from '../lib/logger-model'

const BW_COLOR = '#2ea043' // green accent (distinct from the lift colors)

const dateLabel = (day: string) =>
  new Date(day + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export function renderBodyweight(el: HTMLElement) {
  let unit = getUnit()
  let editingDay: string | null = null

  const rowHtml = (day: string, kg: number) => {
    if (day === editingDay) {
      return `
        <div class="bw-row editing" data-day="${day}">
          <span class="bw-date">${dateLabel(day)}</span>
          <input class="lg-inp bw-row-inp" type="number" inputmode="decimal" step="0.1" min="0"
                 value="${formatWeight(kg, unit)}" aria-label="Edit ${dateLabel(day)}">
          <span class="bw-unit">${unit}</span>
          <button class="bw-save" data-day="${day}" type="button">Save</button>
          <button class="bw-cancel" type="button">Cancel</button>
        </div>`
    }
    return `
      <div class="bw-row" data-day="${day}">
        <span class="bw-date">${dateLabel(day)}</span>
        <span class="bw-weight mono">${formatWeight(kg, unit)} ${unit}</span>
        <button class="bw-edit" data-day="${day}" type="button" aria-label="Edit">✎</button>
        <button class="bw-del" data-day="${day}" type="button" aria-label="Delete">✕</button>
      </div>`
  }

  const showErr = (msg: string) => {
    const e = el.querySelector('#bwErr') as HTMLElement
    e.textContent = msg
    e.hidden = false
  }

  const draw = () => {
    const entries = listBodyweight()       // oldest → newest
    const rows = [...entries].reverse()     // newest first for the list
    const todayKg = getBodyweight(todayLocalIso())
    const prefill = todayKg !== null ? formatWeight(todayKg, unit) : ''

    el.innerHTML = `
      <div class="screen">
        <a class="back" href="#/">‹ Program</a>
        <div class="hist-top">
          <h1 class="hist-h">Bodyweight</h1>
          <div class="unit-toggle" role="group" aria-label="Weight unit">
            <button class="ut ${unit === 'kg' ? 'on' : ''}" data-unit="kg" type="button">kg</button>
            <button class="ut ${unit === 'lb' ? 'on' : ''}" data-unit="lb" type="button">lb</button>
          </div>
        </div>

        <div class="bw-add">
          <input class="lg-inp bw-inp" id="bwInput" type="number" inputmode="decimal" step="0.1" min="0"
                 placeholder="0.0" value="${prefill}" aria-label="Today's bodyweight">
          <span class="bw-unit">${unit}</span>
          <button class="bw-log" id="bwLog" type="button">${todayKg !== null ? 'Update today' : 'Log today'}</button>
        </div>
        <div class="bw-err" id="bwErr" hidden></div>

        ${entries.length
          ? `<div class="prog-chart">${sparklineSvg(entries.map((e) => e.weightKg), { color: BW_COLOR })}</div>`
          : '<div class="note">No entries yet. Log your bodyweight above.</div>'}

        <div class="bw-list">${rows.map((e) => rowHtml(e.day, e.weightKg)).join('')}</div>
      </div>`

    // Unit toggle
    el.querySelectorAll<HTMLButtonElement>('.ut').forEach((btn) => {
      btn.addEventListener('click', () => {
        const u = btn.dataset.unit as Unit
        if (u === unit) return
        unit = u; setUnit(u); draw()
      })
    })

    // Quick-add (today)
    const logToday = async () => {
      const input = el.querySelector('#bwInput') as HTMLInputElement
      const kg = parseWeightInput(input.value, unit)
      if (kg === null) { showErr('Enter a valid weight'); return }
      await logBodyweight(todayLocalIso(), kg)
      toast('Saved ✓')
      draw()
    }
    el.querySelector('#bwLog')!.addEventListener('click', () => void logToday())
    el.querySelector('#bwInput')!.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') void logToday()
    })

    // Row edit / save / cancel / delete
    el.querySelectorAll<HTMLButtonElement>('.bw-edit').forEach((b) =>
      b.addEventListener('click', () => { editingDay = b.dataset.day!; draw() }))
    el.querySelectorAll<HTMLButtonElement>('.bw-cancel').forEach((b) =>
      b.addEventListener('click', () => { editingDay = null; draw() }))
    el.querySelectorAll<HTMLButtonElement>('.bw-save').forEach((b) =>
      b.addEventListener('click', () => void (async () => {
        const day = b.dataset.day!
        const input = el.querySelector('.bw-row.editing .bw-row-inp') as HTMLInputElement
        const kg = parseWeightInput(input.value, unit)
        if (kg === null) { showErr('Enter a valid weight'); return }
        await logBodyweight(day, kg)
        editingDay = null; draw()
      })()))
    el.querySelectorAll<HTMLButtonElement>('.bw-del').forEach((b) =>
      b.addEventListener('click', () => void (async () => {
        const day = b.dataset.day!
        if (!confirm(`Delete bodyweight for ${dateLabel(day)}?`)) return
        await deleteBodyweight(day)
        if (editingDay === day) editingDay = null
        draw()
      })()))
  }

  draw()
}
```

- [ ] **Step 2: Verify it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (Wiring is added in Task 5; until then the route doesn't exist but the file compiles.) Do NOT commit yet.

---

## Task 5: Wiring (route, boot, nav links)

**Files:**
- Modify: `src/main.ts` (imports, route, both boot `Promise.all` sites)
- Modify: `src/screens/list.ts:94` (home nav link)
- Modify: `src/screens/progress.ts` (link to bodyweight)

- [ ] **Step 1: Add imports + route + boot hydration in `main.ts`**

Add to the import block (after the `renderExerciseHistory` import):

```ts
import { renderBodyweight } from './screens/bodyweight'
```

Add to the seam-loader imports (next to `loadWorkouts`):

```ts
import { loadBodyweight } from './lib/bodyweight'
```

Add the route (after the `/exercise/:ref` route):

```ts
route('/bodyweight', (el) => renderBodyweight(el))
```

In `boot()`, update **both** `Promise.all` calls (the `if (!supabase)` branch and the signed-in branch) from:

```ts
await Promise.all([loadProgress(), loadWorkouts()])
```

to:

```ts
await Promise.all([loadProgress(), loadWorkouts(), loadBodyweight()])
```

- [ ] **Step 2: Add the home nav link in `list.ts`**

After line 94 (`<a class="hist-link" href="#/progress" ...>`), add:

```html
          <a class="hist-link" href="#/bodyweight" aria-label="Bodyweight">Bodyweight</a>
```

- [ ] **Step 3: Add a link on the Progress screen in `progress.ts`**

In `renderProgress`'s `draw()`, change the cards line from:

```ts
        <div class="prog-cards">${LIFTS.map(cardHtml).join('')}</div>
      </div>`
```

to:

```ts
        <div class="prog-cards">${LIFTS.map(cardHtml).join('')}</div>
        <a class="hist-link prog-bw-link" href="#/bodyweight">Bodyweight ›</a>
      </div>`
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors. Do NOT commit yet.

---

## Task 6: Styles (`app.css`)

**Files:**
- Modify: `src/styles/app.css` (append a bodyweight block)

- [ ] **Step 1: Append the styles**

Add to the end of `src/styles/app.css`:

```css
/* Bodyweight screen */
.bw-add{display:flex;align-items:center;gap:8px;margin:14px 0 4px}
.bw-add .lg-inp{flex:1 1 auto}
.bw-unit{color:var(--dim);font-size:14px;flex:0 0 auto}
.bw-log{flex:0 0 auto;background:#2ea043;color:#fff;border:none;border-radius:8px;
  padding:10px 14px;font-weight:700;font-size:15px;font-family:var(--sans);cursor:pointer}
.bw-err{color:#e23b3b;font-size:13px;margin:2px 0 6px}
.bw-list{margin-top:14px;display:flex;flex-direction:column}
.bw-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line)}
.bw-date{flex:0 0 auto;color:var(--dim);font-size:14px;min-width:64px}
.bw-weight{flex:1 1 auto;font-weight:700}
.bw-row .bw-row-inp{flex:1 1 auto}
.bw-edit,.bw-del,.bw-save,.bw-cancel{flex:0 0 auto;background:none;border:1px solid var(--line);
  border-radius:6px;color:var(--ink);padding:6px 10px;font-size:14px;font-family:var(--sans);cursor:pointer}
.bw-del{color:#e23b3b}
.bw-save{background:#2ea043;color:#fff;border-color:#2ea043}
.prog-bw-link{display:inline-block;margin-top:16px}
```

- [ ] **Step 2: Verify in the browser (see Task 8 for the full run)**

No automated step. Do NOT commit yet.

---

## Task 7: Docs (CLAUDE.md + README)

**Files:**
- Modify: `CLAUDE.md` (Key files list + Progress note + localStorage keys line)
- Modify: `README.md` (new "Bodyweight" section)

- [ ] **Step 1: Update CLAUDE.md — localStorage keys**

In the "**Progress** persists to `localStorage`…" bullet under Conventions, append to the "Other keys" list:

```
… `liftinglog:unit` (shared display toggle). Bodyweight: `liftinglog:bodyweight`
(`{ 'YYYY-MM-DD': kg }`).
```

- [ ] **Step 2: Update CLAUDE.md — Key files**

Add these entries to the "Key files" list (near `progress.ts` / the screens):

```
- `src/lib/bodyweight-model.ts` — pure bodyweight helpers (`parseWeightInput`, `formatWeight`; tested)
- `src/lib/bodyweight.ts` — bodyweight storage seam (Supabase `bodyweight` table + localStorage mirror; one row per local day, kg only)
- `src/screens/bodyweight.ts` — `#/bodyweight` screen: log today's bodyweight, sparkline trend, editable history. Stores kg, displays in the shared unit.
- `supabase/bodyweight.sql` — the bodyweight table migration (run in Supabase SQL editor)
```

- [ ] **Step 3: Update CLAUDE.md — conventions note**

Append to the "Data holds kilograms only" bullet (or as a new sub-point):

```
- **Bodyweight is stored as kg** (one row per local day in the `bodyweight` seam);
  the screen interprets typed input in the active unit and converts via
  `parseWeightInput`. Display via `formatWeight` in the shared kg/lb unit.
```

- [ ] **Step 4: Update README — new section**

Add a `## Bodyweight` section after `## Exercise catalog` (before `## Updating the program`):

```markdown
## Bodyweight

A dedicated `#/bodyweight` screen records the lifter's actual bodyweight over time —
one entry per day (re-logging overwrites), shown as a sparkline trend with an
editable history. Stored as kilograms (Supabase `bodyweight` table + a localStorage
mirror), displayed in the shared kg/lb unit. This is separate from the `bodyweight`
*equipment type*, which logs only added load. Run `supabase/bodyweight.sql` once in
the Supabase SQL editor to create the table.
```

- [ ] **Step 5: Verify**

Re-read the edited CLAUDE.md / README sections to confirm they're accurate and consistent with the code. Do NOT commit yet.

---

## Task 8: Full verification (review gate)

**Files:** none (verification only)

- [ ] **Step 1: Run the test suite**

Run: `npm run test`
Expected: all tests PASS (including the new `bodyweight-model.test.ts`).

- [ ] **Step 2: Typecheck + production build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 3: Manual browser verification (phone width ~390px)**

Run: `npm run dev`, open the app, navigate to `#/bodyweight` (and via the home "Bodyweight" nav link + the Progress link). Verify, with **zero console errors**:
- Log today's weight → it appears in the list + sparkline; button reads "Update today" after.
- Re-log today → overwrites (no duplicate row).
- Edit a past row (✎ → change → Save) → value updates.
- Delete a row (✕ → confirm) → row removed.
- Toggle kg/lb → input prefill, list, and chart all switch units.
- Invalid input (empty / `0` / letters) → inline error, no write.
- Empty state shows when there are no entries.

Use the local-verify approach from project memory (empty `.env.local` to bypass the Supabase auth gate; seed `localStorage` `liftinglog:bodyweight` if you want pre-existing data).

- [ ] **Step 4: STOP — hand off to the user for review**

Per the commit policy, **do not commit.** Present the working-tree diff (`git status` + `git diff`) and the verification results to the user and wait for approval.

---

## Task 9: Commit (ONLY after user approval)

**Files:** none (commit only)

- [ ] **Step 1: Stage and commit on the feature branch**

After the user approves the reviewed code, run:

```bash
git add src/lib/bodyweight-model.ts src/lib/bodyweight-model.test.ts \
        src/lib/bodyweight.ts supabase/bodyweight.sql src/screens/bodyweight.ts \
        src/main.ts src/screens/list.ts src/screens/progress.ts \
        src/styles/app.css CLAUDE.md README.md
git commit -m "feat: bodyweight tracking screen

Dedicated #/bodyweight screen: log actual bodyweight (one row per local day,
re-log overwrites), sparkline trend, editable history. New storage seam
(bodyweight table + localStorage mirror) + pure model (parse/format, tested).
Stores kg; displays in the shared kg/lb unit. Linked from home + Progress.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 2: Confirm**

Run: `git log --oneline -1`
Expected: the feat commit is HEAD on `feature/bodyweight-tracking`.

---

## Self-Review (completed by plan author)

- **Spec coverage:** seam (Task 3) ✓, pure model (Task 1) ✓, migration (Task 2) ✓, screen (Task 4) ✓, route+boot+nav (Task 5) ✓, styles (Task 6) ✓, one-per-day upsert / edit / delete (Tasks 3–4) ✓, kg-only + shared unit (Tasks 1,3,4) ✓, local-date key (Task 3 `todayLocalIso`) ✓, iOS-zoom `.lg-inp` reuse (Task 4) ✓, tests (Task 1) ✓, docs (Task 7) ✓, deferred-scope explicitly excluded ✓.
- **Type consistency:** `BodyEntry` defined in `bodyweight-model.ts`, imported by the seam; seam exports `loadBodyweight / listBodyweight / getBodyweight / logBodyweight / deleteBodyweight / todayLocalIso` — all consumed with matching signatures in the screen + `main.ts`. `Unit` imported from `logger-model`. `parseWeightInput`/`formatWeight` signatures match between model, tests, and screen.
- **Placeholders:** none — every code/step shows real content.
