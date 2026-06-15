# Logger B1 — Persistence Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the data layer for the workout logger — types, a tested pure model (pre-fill from coach, rest defaults, duration, "Last" reference), and a `workouts` storage seam (Supabase + localStorage offline mirror) — with nothing in the UI yet.

**Architecture:** A pure, unit-tested model (`logger-model.ts`) holds all transformations. A thin storage seam (`workouts.ts`) mirrors the existing `progress.ts` pattern (in-memory cache hydrated at boot, write-through to localStorage always + Supabase when configured). A workout is persisted as a **single JSONB row** (not a relational `logged_sets` table) — see the deviation note below.

**Tech Stack:** Vite + TypeScript (vanilla), Vitest (node env — no DOM/localStorage in tests, so the testable core is pure functions), Supabase (JSONB + RLS via `auth.jwt()->>'sub'`).

**Branch:** `feat/exercise-catalog` (SAME branch as the catalog — this phase lands in PR #1). Commit per task. Do NOT open a new PR or push to `main`.

**Spec:** `docs/superpowers/specs/2026-06-15-logger-design.md` (Spec B — Data model section).

### Deviation from spec (intentional, YAGNI)
The spec proposed two tables (`workouts` + `logged_sets`). This plan instead stores each workout as **one `workouts` row with a `data jsonb` column** holding the nested exercises/sets. Rationale: single trainer + single client; the only cross-row query is "Last actual for an exercise," which is a trivial client-side scan of fetched history; JSONB gives exact shape-parity with the localStorage mirror and removes all relational mapping code. Top-level columns (`session_num`, `started_at`, `ended_at`, `status`) are kept for indexing/filtering. This is recorded in the data-sync spec in Task 5.

---

## File Structure

- Create: `src/lib/logger-types.ts` — `WorkoutStatus`, `LoggedSet`, `WorkoutExercise`, `Workout`.
- Create: `src/lib/logger-model.ts` — PURE functions: `restDefaultFor`, `coachTargetText`, `buildWorkoutExercises`, `workoutDurationSec`, `lastActualFor`.
- Create: `src/lib/logger-model.test.ts` — unit tests for the above.
- Create: `src/lib/workouts.ts` — storage seam (cache + localStorage mirror + Supabase JSONB), mirroring `progress.ts`.
- Create: `supabase/workouts.sql` — migration the user runs in the Supabase SQL editor.
- Modify: `src/main.ts` — hydrate workouts at boot (alongside `loadProgress`).
- Modify: `docs/superpowers/specs/2026-06-13-data-and-sync-design.md` — record the JSONB workouts schema + deviation.
- Modify: `CLAUDE.md` — skill-sync note (rest heuristic lives in 2 places) + key files.

---

## Task 1: Workout types + rest defaults + duration (TDD)

**Files:**
- Create: `src/lib/logger-types.ts`
- Create: `src/lib/logger-model.test.ts`
- Create: `src/lib/logger-model.ts`

- [ ] **Step 1: Create the types** — `src/lib/logger-types.ts`:

```ts
import type { Equipment } from '../data/types'

export type WorkoutStatus = 'active' | 'finished' | 'cancelled'

/** One logged set. weightLb/reps are null until the user fills them in. */
export interface LoggedSet {
  weightLb: number | null
  reps: number | null
  done: boolean
  restSec: number
  note: string
}

export interface WorkoutExercise {
  exerciseRef: string        // catalog id, or `coach:<order>` for prescribed lifts
  nameEn: string
  nameRu: string
  equipment: Equipment
  isCoachPrescribed: boolean
  coachTarget: string        // display string, e.g. "100 kg × 5"; '' when none
  sets: LoggedSet[]
}

export interface Workout {
  id: string
  sessionNum: number | null  // program day; null for an ad-hoc workout
  startedAt: string          // ISO timestamp
  endedAt: string | null
  pausedMs: number           // accumulated paused time, excluded from duration
  status: WorkoutStatus
  coachMessage: string
  exercises: WorkoutExercise[]
}
```

- [ ] **Step 2: Write the failing tests** — `src/lib/logger-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { restDefaultFor, workoutDurationSec } from './logger-model'
import type { Workout } from './logger-types'

describe('restDefaultFor', () => {
  it('gives squats 90s', () => { expect(restDefaultFor('Back Squat', 'barbell')).toBe(90) })
  it('gives bench 150s', () => { expect(restDefaultFor('Bench Press', 'barbell')).toBe(150) })
  it('gives barbell deadlift 300s', () => { expect(restDefaultFor('Deadlift', 'barbell')).toBe(300) })
  it('does not give a dumbbell deadlift 300s', () => { expect(restDefaultFor('Single-Leg Deadlift', 'dumbbell')).toBe(90) })
  it('gives other barbell work 180s', () => { expect(restDefaultFor('Barbell Row', 'barbell')).toBe(180) })
  it('gives other non-barbell work 90s', () => { expect(restDefaultFor('Lat Pulldown', 'cable')).toBe(90) })
})

describe('workoutDurationSec', () => {
  const base = { startedAt: '2026-06-15T12:00:00.000Z', endedAt: null, pausedMs: 0 }
  it('uses now when not ended', () => {
    const now = Date.parse('2026-06-15T12:01:40.000Z') // +100s
    expect(workoutDurationSec(base, now)).toBe(100)
  })
  it('excludes paused time', () => {
    const now = Date.parse('2026-06-15T12:01:40.000Z') // +100s
    expect(workoutDurationSec({ ...base, pausedMs: 30_000 }, now)).toBe(70)
  })
  it('uses endedAt when finished (now ignored)', () => {
    const w = { ...base, endedAt: '2026-06-15T12:00:50.000Z' } // +50s
    expect(workoutDurationSec(w, Date.parse('2026-06-15T13:00:00.000Z'))).toBe(50)
  })
  it('never goes negative', () => {
    expect(workoutDurationSec({ ...base, pausedMs: 999_999 }, Date.parse(base.startedAt))).toBe(0)
  })
})
```

- [ ] **Step 3: Run tests to verify they fail** — Run: `npm run test -- logger-model` — Expected: FAIL (module/functions undefined).

- [ ] **Step 4: Implement the two functions** — create `src/lib/logger-model.ts`:

```ts
// Pure model for the workout logger. No DOM, no storage, no Date.now() — callers
// pass `now` in so these stay deterministic and unit-testable.
import type { Equipment } from '../data/types'

// Per-lift rest defaults. MUST stay in sync with scripts/build-catalog.mjs `restFor`
// (that bakes defaultRestSec into the catalog; this resolves it for coach lifts).
export function restDefaultFor(nameEn: string, equipment: Equipment): number {
  const n = nameEn.toLowerCase()
  if (n.includes('squat')) return 90
  if (n.includes('bench')) return 150
  if (n.includes('deadlift')) return equipment === 'barbell' ? 300 : 90
  return equipment === 'barbell' ? 180 : 90
}

/** Elapsed seconds, excluding paused time. Pass `nowMs` (Date.now()) from the caller. */
export function workoutDurationSec(
  w: { startedAt: string; endedAt: string | null; pausedMs: number },
  nowMs: number,
): number {
  const end = w.endedAt ? Date.parse(w.endedAt) : nowMs
  return Math.max(0, Math.round((end - Date.parse(w.startedAt) - w.pausedMs) / 1000))
}
```

- [ ] **Step 5: Run tests to verify they pass** — Run: `npm run test -- logger-model` — Expected: PASS. Also run `npx tsc --noEmit` (clean).

- [ ] **Step 6: Commit**
```bash
git add src/lib/logger-types.ts src/lib/logger-model.ts src/lib/logger-model.test.ts
git commit -m "feat(logger): workout types + rest defaults + duration (pure, tested)"
```

---

## Task 2: Build a workout from a session's coach prescription (TDD)

**Files:**
- Modify: `src/lib/logger-model.test.ts`
- Modify: `src/lib/logger-model.ts`

- [ ] **Step 1: Add failing tests** — append to `src/lib/logger-model.test.ts`:

```ts
import { buildWorkoutExercises, coachTargetText } from './logger-model'
import type { Session, Exercise } from '../data/types'

const mkSession = (exercises: Exercise[]): Session => ({
  num: 7, date: '2026-06-16', dateLabel: 'Tue Jun 16', focus: 'Squat', exercises,
})

describe('coachTargetText', () => {
  const ex = (over: Partial<Exercise>): Exercise => ({
    order: 1, nameEn: 'Squat', nameRu: 'Присед', descEn: '', descRu: '',
    equipment: 'barbell', weight: { kind: 'single', kg: 100 }, sets: 3, reps: '5', ...over,
  })
  it('single weight', () => { expect(coachTargetText(ex({}))).toBe('100 kg × 5') })
  it('range weight', () => { expect(coachTargetText(ex({ weight: { kind: 'range', minKg: 90, maxKg: 100 } }))).toBe('90–100 kg × 5') })
  it('bodyweight', () => { expect(coachTargetText(ex({ weight: { kind: 'bodyweight' }, reps: '12' }))).toBe('Bodyweight × 12') })
})

describe('buildWorkoutExercises', () => {
  const ex = (over: Partial<Exercise>): Exercise => ({
    order: 1, nameEn: 'Squat', nameRu: 'Присед', descEn: '', descRu: '',
    equipment: 'barbell', weight: { kind: 'single', kg: 100 }, sets: 3, reps: '5', ...over,
  })
  it('makes one WorkoutExercise per coach exercise, ref by order', () => {
    const out = buildWorkoutExercises(mkSession([ex({ order: 2 })]))
    expect(out).toHaveLength(1)
    expect(out[0].exerciseRef).toBe('coach:2')
    expect(out[0].isCoachPrescribed).toBe(true)
  })
  it('pre-fills set count from coach sets, lb from kg, reps from reps', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ sets: 3, weight: { kind: 'single', kg: 100 }, reps: '5' })]))
    expect(we.sets).toHaveLength(3)
    expect(we.sets[0].weightLb).toBe(220) // round(100 * 2.20462)
    expect(we.sets[0].reps).toBe(5)
    expect(we.sets[0].done).toBe(false)
    expect(we.sets[0].restSec).toBe(90) // squat
  })
  it('defaults to one set when coach sets is null', () => {
    expect(buildWorkoutExercises(mkSession([ex({ sets: null })]))[0].sets).toHaveLength(1)
  })
  it('uses per-set kg/reps for a perSet scheme', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({
      weight: { kind: 'perSet', steps: [{ kg: 100, reps: 5 }, { kg: 90, reps: 8 }] }, sets: 2,
    })]))
    expect(we.sets[0].weightLb).toBe(220)
    expect(we.sets[1].weightLb).toBe(198) // round(90 * 2.20462)
    expect(we.sets[1].reps).toBe(8)
  })
  it('leaves weightLb null for bodyweight and non-numeric reps null', () => {
    const [we] = buildWorkoutExercises(mkSession([ex({ weight: { kind: 'bodyweight' }, reps: '8–12' })]))
    expect(we.sets[0].weightLb).toBeNull()
    expect(we.sets[0].reps).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail** — Run: `npm run test -- logger-model` — Expected: FAIL (`buildWorkoutExercises`/`coachTargetText` undefined).

- [ ] **Step 3: Implement** — add to `src/lib/logger-model.ts` (keep existing exports):

```ts
import type { Exercise, Session, Weight } from '../data/types'
import { kgToLb } from './load'
import type { LoggedSet, WorkoutExercise } from './logger-types'

// kg the coach prescribes for set index i (null if not a concrete number).
function coachKgForSet(w: Weight, i: number): number | null {
  if (w.kind === 'single') return w.kg
  if (w.kind === 'range') return w.maxKg
  if (w.kind === 'progression') return w.kg[Math.min(i, w.kg.length - 1)]
  if (w.kind === 'perSet') return w.steps[Math.min(i, w.steps.length - 1)].kg
  return null // qualitative | bodyweight
}

// reps the coach prescribes for set index i (null if non-numeric like "8–12").
function coachRepsForSet(e: Exercise, i: number): number | null {
  if (e.weight.kind === 'perSet') {
    return e.weight.steps[Math.min(i, e.weight.steps.length - 1)].reps
  }
  const n = parseInt(e.reps, 10)
  return Number.isFinite(n) && String(n) === e.reps.trim() ? n : null
}

/** Short human label of the coach's prescription, used as the reference column. */
export function coachTargetText(e: Exercise): string {
  const w = e.weight
  const reps = e.reps ? ` × ${e.reps}` : ''
  if (w.kind === 'single') return `${w.kg} kg${reps}`
  if (w.kind === 'range') return `${w.minKg}–${w.maxKg} kg${reps}`
  if (w.kind === 'progression') return `${w.kg.join('→')} kg`
  if (w.kind === 'perSet') return w.steps.map((s) => `${s.kg}×${s.reps}`).join(', ')
  if (w.kind === 'qualitative') return `${w.level[0].toUpperCase()}${w.level.slice(1)}${reps}`
  return `Bodyweight${reps}`
}

/** Seed the logger from a session's coach prescription (one WorkoutExercise each). */
export function buildWorkoutExercises(session: Session): WorkoutExercise[] {
  return session.exercises.map((e) => {
    const count = e.sets && e.sets > 0 ? e.sets : 1
    const rest = restDefaultFor(e.nameEn, e.equipment)
    const sets: LoggedSet[] = Array.from({ length: count }, (_, i) => {
      const kg = coachKgForSet(e.weight, i)
      return {
        weightLb: kg !== null ? Math.round(kgToLb(kg)) : null,
        reps: coachRepsForSet(e, i),
        done: false,
        restSec: rest,
        note: '',
      }
    })
    return {
      exerciseRef: `coach:${e.order}`,
      nameEn: e.nameEn,
      nameRu: e.nameRu,
      equipment: e.equipment,
      isCoachPrescribed: true,
      coachTarget: coachTargetText(e),
      sets,
    }
  })
}
```

- [ ] **Step 4: Run to verify they pass** — Run: `npm run test -- logger-model`. Expected PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**
```bash
git add src/lib/logger-model.ts src/lib/logger-model.test.ts
git commit -m "feat(logger): build a workout pre-filled from the coach prescription"
```

---

## Task 3: "Last actual" reference from history (TDD)

**Files:**
- Modify: `src/lib/logger-model.test.ts`
- Modify: `src/lib/logger-model.ts`

- [ ] **Step 1: Add failing tests** — append to `src/lib/logger-model.test.ts`:

```ts
import { lastActualFor } from './logger-model'

const wk = (over: Partial<Workout>): Workout => ({
  id: 'x', sessionNum: 1, startedAt: '2026-06-01T00:00:00.000Z', endedAt: null,
  pausedMs: 0, status: 'finished', coachMessage: '', exercises: [], ...over,
})
const doneSet = (lb: number, reps: number) => ({ weightLb: lb, reps, done: true, restSec: 90, note: '' })

describe('lastActualFor', () => {
  it('returns null when no finished workout has the exercise', () => {
    expect(lastActualFor([], 'coach:1')).toBeNull()
  })
  it('returns the done sets from the most recent finished workout with that exercise', () => {
    const older = wk({ startedAt: '2026-06-01T00:00:00.000Z', exercises: [{ exerciseRef: 'coach:1', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(200, 5)] }] })
    const newer = wk({ startedAt: '2026-06-08T00:00:00.000Z', exercises: [{ exerciseRef: 'coach:1', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(225, 5)] }] })
    expect(lastActualFor([older, newer], 'coach:1')![0].weightLb).toBe(225)
  })
  it('ignores active/cancelled workouts', () => {
    const active = wk({ status: 'active', startedAt: '2026-06-09T00:00:00.000Z', exercises: [{ exerciseRef: 'coach:1', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(999, 1)] }] })
    const finished = wk({ status: 'finished', startedAt: '2026-06-08T00:00:00.000Z', exercises: [{ exerciseRef: 'coach:1', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [doneSet(225, 5)] }] })
    expect(lastActualFor([active, finished], 'coach:1')![0].weightLb).toBe(225)
  })
  it('skips exercises with no done sets', () => {
    const w = wk({ exercises: [{ exerciseRef: 'coach:1', nameEn: 'S', nameRu: 'S', equipment: 'barbell', isCoachPrescribed: true, coachTarget: '', sets: [{ weightLb: 200, reps: 5, done: false, restSec: 90, note: '' }] }] })
    expect(lastActualFor([w], 'coach:1')).toBeNull()
  })
})
```

- [ ] **Step 2: Run to verify they fail** — Run: `npm run test -- logger-model` — Expected: FAIL (`lastActualFor` undefined).

- [ ] **Step 3: Implement** — add to `src/lib/logger-model.ts`:

```ts
import type { Workout } from './logger-types'

/** Done sets for `exerciseRef` from the most recent FINISHED workout, or null. */
export function lastActualFor(history: Workout[], exerciseRef: string): LoggedSet[] | null {
  const finished = history
    .filter((w) => w.status === 'finished')
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
  for (const w of finished) {
    const ex = w.exercises.find((x) => x.exerciseRef === exerciseRef)
    if (ex) {
      const done = ex.sets.filter((s) => s.done)
      if (done.length) return done
    }
  }
  return null
}
```

(Note: `LoggedSet` and `Workout` are already imported at the top of the file from Tasks 1–2; if not, add them to the existing `import type { … } from './logger-types'` line — do not duplicate the import.)

- [ ] **Step 4: Run to verify they pass** — Run: `npm run test -- logger-model`. Expected PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**
```bash
git add src/lib/logger-model.ts src/lib/logger-model.test.ts
git commit -m "feat(logger): lastActualFor — Last reference from finished history"
```

---

## Task 4: Workouts storage seam (Supabase JSONB + localStorage mirror)

**Files:**
- Create: `src/lib/workouts.ts`
- Modify: `src/main.ts`

This mirrors `src/lib/progress.ts`: a module-level cache hydrated once at boot, written through to localStorage always and to Supabase when configured. Not unit-tested (I/O); it is built on the Task 1–3 pure model. Verified by `tsc` + `build`.

- [ ] **Step 1: Create `src/lib/workouts.ts`**:

```ts
// Workout storage seam. Same shape as progress.ts: an in-memory cache hydrated by
// loadWorkouts() at boot, written through to localStorage (offline-safe) and to
// Supabase when configured. A workout is stored as one JSONB row (see plan B1).
import { supabase } from './supabase'
import { toast } from './toast'
import type { Workout } from './logger-types'

const ACTIVE_KEY = 'liftinglog:activeWorkout'
const HIST_KEY = 'liftinglog:workouts'

let active: Workout | null = null
let history: Workout[] = []
let userId: string | null = null

function readLocal<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback }
  catch { return fallback }
}
function writeLocalActive() {
  try {
    if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active))
    else localStorage.removeItem(ACTIVE_KEY)
  } catch { /* ignore */ }
}
function writeLocalHistory() {
  try { localStorage.setItem(HIST_KEY, JSON.stringify(history)) } catch { /* ignore */ }
}

async function currentUserId(): Promise<string | null> {
  if (!supabase) return null
  if (userId) return userId
  const { data: { session } } = await supabase.auth.getSession()
  userId = session?.user?.id ?? null
  return userId
}

// Map a DB row {id, session_num, started_at, ended_at, status, data} → Workout.
// `data` holds the full nested workout; columns are for filtering only.
function rowToWorkout(r: { data: Workout }): Workout { return r.data }

/** Hydrate active + history. Call once at boot (after auth), like loadProgress(). */
export async function loadWorkouts(): Promise<void> {
  if (!supabase) {
    active = readLocal<Workout | null>(ACTIVE_KEY, null)
    history = readLocal<Workout[]>(HIST_KEY, [])
    return
  }
  await currentUserId()
  const { data, error } = await supabase
    .from('workouts')
    .select('data, status, started_at')
    .order('started_at', { ascending: false })
  if (error) { console.error('[workouts] load failed', error); active = null; history = []; return }
  const all = (data ?? []).map(rowToWorkout)
  active = all.find((w) => w.status === 'active') ?? null
  history = all.filter((w) => w.status !== 'active')
}

export function getActiveWorkout(): Workout | null { return active }
export function listWorkouts(): Workout[] { return history }

/** Persist the active workout (write-through). Safe to call on every edit. */
export async function saveActiveWorkout(w: Workout): Promise<void> {
  active = w
  writeLocalActive()
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) { toast('Not signed in — saving locally', 'info'); return }
  const { error } = await supabase.from('workouts').upsert({
    id: w.id, session_num: w.sessionNum, started_at: w.startedAt,
    ended_at: w.endedAt, status: w.status, data: w,
  })
  if (error) { console.error('[workouts] save failed', error); toast(`Save failed: ${error.message}`, 'error') }
}

/** Finish: mark finished, stamp endedAt, move from active → history. */
export async function finishWorkout(w: Workout, coachMessage: string, nowIso: string): Promise<void> {
  const finished: Workout = { ...w, status: 'finished', endedAt: nowIso, coachMessage }
  await saveActiveWorkout(finished) // upserts the finished row
  history = [finished, ...history.filter((h) => h.id !== finished.id)]
  active = null
  writeLocalActive()
  writeLocalHistory()
}

/** Cancel: drop the active workout (mark cancelled in the store, clear active). */
export async function cancelWorkout(): Promise<void> {
  const w = active
  active = null
  writeLocalActive()
  if (!w) return
  if (!supabase) return
  const uid = await currentUserId()
  if (!uid) return
  const { error } = await supabase.from('workouts').update({ status: 'cancelled', data: { ...w, status: 'cancelled' } }).eq('id', w.id)
  if (error) console.error('[workouts] cancel failed', error)
}
```

- [ ] **Step 2: Hydrate at boot** — in `src/main.ts`, import and call `loadWorkouts` alongside `loadProgress`. Change the two `await loadProgress()` sites to load both in parallel.

Add the import after the `loadProgress` import:
```ts
import { loadWorkouts } from './lib/workouts'
```
In the no-supabase branch of `boot()`, change:
```ts
  if (!supabase) {
    await loadProgress()
    startRouter(app)
    return
  }
```
to:
```ts
  if (!supabase) {
    await Promise.all([loadProgress(), loadWorkouts()])
    startRouter(app)
    return
  }
```
And after the session check, change:
```ts
  await loadProgress() // hydrate the user's rows, then render the app
  startRouter(app)
```
to:
```ts
  await Promise.all([loadProgress(), loadWorkouts()]) // hydrate, then render
  startRouter(app)
```

- [ ] **Step 3: Type-check + build** — Run `npx tsc --noEmit` (clean) and `npm run build` (success). Run `npm run test` (all existing + logger-model tests still green — the storage seam has no tests but must not break the build).

- [ ] **Step 4: Commit**
```bash
git add src/lib/workouts.ts src/main.ts
git commit -m "feat(logger): workouts storage seam (Supabase JSONB + localStorage mirror)"
```

---

## Task 5: Supabase migration + data-sync spec

**Files:**
- Create: `supabase/workouts.sql`
- Modify: `docs/superpowers/specs/2026-06-13-data-and-sync-design.md`

- [ ] **Step 1: Create `supabase/workouts.sql`**:

```sql
-- Workout logger storage. One row per workout; the full nested workout (exercises,
-- sets, notes, pausedMs) lives in `data jsonb`. Top-level columns are for filtering.
-- Run this in the Supabase SQL editor (same project as the `progress` table).
-- RLS uses (auth.jwt() ->> 'sub')::uuid because this project's newer JWT signing
-- keys make auth.uid() return null (see the progress table for the same pattern).

create table if not exists public.workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default (auth.jwt() ->> 'sub')::uuid,
  session_num int,
  started_at  timestamptz not null,
  ended_at    timestamptz,
  status      text not null default 'active',
  data        jsonb not null,
  created_at  timestamptz not null default now()
);

alter table public.workouts enable row level security;

create policy "own workouts" on public.workouts
  for all
  using ((auth.jwt() ->> 'sub')::uuid = user_id)
  with check ((auth.jwt() ->> 'sub')::uuid = user_id);

grant select, insert, update, delete on public.workouts to authenticated;

create index if not exists workouts_user_started
  on public.workouts (user_id, started_at desc);
```

- [ ] **Step 2: Record the schema in the data-sync spec** — append a section to `docs/superpowers/specs/2026-06-13-data-and-sync-design.md`:

```markdown
## Workout logger storage (added 2026-06-15, Spec B / plan B1)

`workouts` table — **one JSONB row per workout** (deviation from the original
two-table `workouts`+`logged_sets` proposal; chosen for single-user simplicity and
exact parity with the localStorage offline mirror). Migration: `supabase/workouts.sql`.
Same `(auth.jwt() ->> 'sub')::uuid` RLS as `progress`. The client (`src/lib/workouts.ts`)
keeps an active-workout cache hydrated at boot, writes through to localStorage always
and Supabase when configured, and computes the "Last actual" reference client-side
(`logger-model.lastActualFor`) over fetched finished workouts.
```

- [ ] **Step 3: Commit**
```bash
git add supabase/workouts.sql docs/superpowers/specs/2026-06-13-data-and-sync-design.md
git commit -m "docs(logger): workouts Supabase migration + data-sync schema note"
```

---

## Task 6: Docs / skill-sync

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`** — READ it first. (a) Add a skill-sync table row:
```
| The rest-timer default heuristic (`restDefaultFor`) | keep it identical to `scripts/build-catalog.mjs` `restFor` — the catalog bakes it in, the logger resolves it for coach lifts |
```
(b) Add to "Key files":
```
- `src/lib/logger-model.ts` — pure logger model (rest defaults, pre-fill from coach, duration, Last reference; tested)
- `src/lib/logger-types.ts` — `Workout`/`WorkoutExercise`/`LoggedSet` types
- `src/lib/workouts.ts` — workout storage seam (Supabase JSONB + localStorage mirror)
- `supabase/workouts.sql` — the workouts table migration (run in Supabase SQL editor)
```

- [ ] **Step 2: Run the full suite** — Run: `npm run test`. Expected: all green (existing + logger-model). Paste the summary.

- [ ] **Step 3: Commit**
```bash
git add CLAUDE.md
git commit -m "docs(logger): skill-sync note for rest heuristic + key files"
```

---

## Self-review notes (done while writing)

- **Spec coverage (Spec B data model):** workouts/sets shape (T1) · pre-fill from coach (T2) · Last reference (T3) · lb canonical — `buildWorkoutExercises` stores `weightLb` only, coach kg→lb at build time (T2) · offline localStorage mirror + Supabase + auth.jwt RLS (T4, T5) · relationship to `progress` is unchanged (progress stays the day-done flag; workouts are separate). Notes/coachMessage fields exist on the types (T1) and are persisted (T4); the UI to edit them is B2/B4.
- **Deviation logged:** single JSONB row instead of `logged_sets` table — documented in the plan header and Task 5 spec note.
- **Type consistency:** `Workout`/`WorkoutExercise`/`LoggedSet` defined once in `logger-types.ts`; `logger-model.ts` and `workouts.ts` import them. `restDefaultFor(nameEn, equipment)` signature consistent across T1 use and T2 call.
- **No placeholders:** every code step has complete code. Date.now() is intentionally NOT used in the pure model (callers pass `now`); the seam/UI supply real timestamps (e.g. `new Date().toISOString()`) at call sites in later tasks.
- **Tests run in node (no localStorage/DOM):** that's why only the pure model is unit-tested; the seam is verified via tsc/build, consistent with the untested `progress.ts` precedent.
