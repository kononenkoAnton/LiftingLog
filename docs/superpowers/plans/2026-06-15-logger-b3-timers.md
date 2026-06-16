# Logger B3 — Timers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add the session **pause/resume** clock and a per-set **rest-timer** countdown (per-lift defaults, ±15s adjustable and persisted per set, vibrate at zero) to logging mode, plus a confirm before leaving an active workout.

**Architecture:** A `pausedAt` field on `Workout` + a pure `togglePause` and a pause-aware `workoutDurationSec` (tested). The rest timer is transient UI state in `logging.ts` (a sticky countdown banner) — only the per-set `restSec` it edits is persisted.

**Tech Stack:** Vite + TS, Vitest, `navigator.vibrate` (guarded).

**Branch:** `feat/exercise-catalog` (SAME branch → PR #1). Commit per task. Never push to `main`.

**Spec:** `docs/superpowers/specs/2026-06-15-logger-design.md` (Spec B — Timers). Rest defaults already baked in (Squat 1:30, Bench 2:30, Deadlift 5:00). **Deferred to B4:** per-set notes, session message, Coach/Last reference column, history view.

---

## File Structure
- Modify: `src/lib/logger-types.ts` — add `pausedAt: string | null` to `Workout`.
- Modify: `src/lib/logger-model.ts` — pause-aware `workoutDurationSec`; new `togglePause`.
- Modify: `src/lib/logger-model.test.ts` — tests.
- Modify: `src/lib/workouts.ts` — `startWorkout` sets `pausedAt: null`.
- Modify: `src/screens/logging.ts` — pause button, rest banner, back-link confirm.
- Modify: `src/styles/app.css` — pause button + rest banner styles.

---

## Task 1: Pause model (TDD)

**Files:** `src/lib/logger-types.ts`, `src/lib/logger-model.test.ts`, `src/lib/logger-model.ts`, `src/lib/workouts.ts`

- [ ] **Step 1: Add `pausedAt` to `Workout`** in `src/lib/logger-types.ts` — add the field after `pausedMs`:
```ts
  pausedMs: number           // accumulated paused time, excluded from duration
  pausedAt: string | null    // ISO when currently paused; null while running
```

- [ ] **Step 2: Add failing tests** — append to `src/lib/logger-model.test.ts`:
```ts
import { togglePause } from './logger-model'

describe('workoutDurationSec while paused', () => {
  it('freezes at the pause moment', () => {
    const w = { startedAt: '2026-06-15T12:00:00.000Z', endedAt: null, pausedMs: 0, pausedAt: '2026-06-15T12:00:40.000Z' }
    // now is much later, but elapsed should freeze at +40s
    expect(workoutDurationSec(w, Date.parse('2026-06-15T12:05:00.000Z'))).toBe(40)
  })
})

describe('togglePause', () => {
  it('pausing stamps pausedAt', () => {
    const w = wk({ pausedAt: null, status: 'active' })
    const now = Date.parse('2026-06-15T12:00:40.000Z')
    const p = togglePause(w, now)
    expect(p.pausedAt).toBe('2026-06-15T12:00:40.000Z')
    expect(p.pausedMs).toBe(0)
  })
  it('resuming clears pausedAt and accrues paused time', () => {
    const w = wk({ pausedAt: '2026-06-15T12:00:40.000Z', pausedMs: 5000, status: 'active' })
    const now = Date.parse('2026-06-15T12:01:10.000Z') // 30s after pause
    const r = togglePause(w, now)
    expect(r.pausedAt).toBeNull()
    expect(r.pausedMs).toBe(35000) // 5000 + 30000
  })
})
```
(The `wk` helper from the `lastActualFor` tests is module-scope-usable; if it is declared inside that describe block, add a minimal local workout literal in these tests instead. The `wk` factory must include `pausedAt: null` now that the field exists — update the `wk` definition's defaults to include `pausedAt: null`.)

- [ ] **Step 3: Run to verify fail** — `npm run test -- logger-model` → FAIL.

- [ ] **Step 4: Implement** in `src/lib/logger-model.ts`. Replace `workoutDurationSec` with the pause-aware version and add `togglePause`:
```ts
/** Elapsed seconds, excluding paused time; frozen while paused. Pass `nowMs`. */
export function workoutDurationSec(
  w: { startedAt: string; endedAt: string | null; pausedMs: number; pausedAt?: string | null },
  nowMs: number,
): number {
  const end = w.endedAt ? Date.parse(w.endedAt) : w.pausedAt ? Date.parse(w.pausedAt) : nowMs
  return Math.max(0, Math.round((end - Date.parse(w.startedAt) - w.pausedMs) / 1000))
}

/** Toggle pause: pausing stamps pausedAt; resuming folds the gap into pausedMs. */
export function togglePause(w: Workout, nowMs: number): Workout {
  if (w.pausedAt) {
    return { ...w, pausedMs: w.pausedMs + (nowMs - Date.parse(w.pausedAt)), pausedAt: null }
  }
  return { ...w, pausedAt: new Date(nowMs).toISOString() }
}
```
(`Workout` is already imported from `./logger-types` in this file.)

- [ ] **Step 5: Update `startWorkout`** in `src/lib/workouts.ts` — add `pausedAt: null` to the new-workout literal (after `pausedMs: 0,`):
```ts
    pausedMs: 0,
    pausedAt: null,
```

- [ ] **Step 6: Verify + commit** — `npm run test` green, `npx tsc --noEmit` clean (the new `pausedAt` field may require updating any other `Workout` literal in the codebase/tests — fix those by adding `pausedAt: null`).
```bash
git add src/lib/logger-types.ts src/lib/logger-model.ts src/lib/logger-model.test.ts src/lib/workouts.ts
git commit -m "feat(logger): pause/resume model (pausedAt + togglePause + frozen duration)"
```

---

## Task 2: Pause button, rest timer, back-link confirm

**Files:** `src/screens/logging.ts` (replace the file with the version below).

- [ ] **Step 1: Replace `src/screens/logging.ts` with EXACTLY this:**

```ts
// Logging mode for an active workout. Owns set-editing, the session pause/resume
// clock, and a transient per-set rest-timer countdown. Names/numbers rendered here
// are trusted; per-set NOTES (user text) are still NOT rendered (B4 → textContent).
import type { WorkoutExercise } from '../lib/logger-types'
import { getActiveWorkout, saveActiveWorkout, finishWorkout, cancelWorkout } from '../lib/workouts'
import { workoutDurationSec, togglePause, blankSet, catalogToWorkoutExercise } from '../lib/logger-model'
import { openExercisePicker } from '../components/exercise-picker'
import { getSession } from '../data/program'
import { finish as markDayFinished } from '../lib/progress'

let elapsedTimer: ReturnType<typeof setInterval> | null = null
let restTimer: ReturnType<typeof setInterval> | null = null
// Transient rest-countdown state: which set, and when it ends (epoch ms).
let rest: { exIdx: number; setIdx: number; endMs: number } | null = null

const clearElapsed = () => { if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null } }
const clearRest = () => { if (restTimer) { clearInterval(restTimer); restTimer = null } }
const clearAll = () => { clearElapsed(); clearRest(); rest = null }
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

function exerciseHtml(ex: WorkoutExercise, i: number): string {
  return `
    <div class="lg-ex">
      <div class="lg-exname">${ex.nameEn}</div>
      <div class="lg-exru">${ex.nameRu}</div>
      ${ex.coachTarget ? `<div class="lg-coach">Coach · ${ex.coachTarget}</div>` : ''}
      <div class="lg-thead"><span>Set</span><span class="r">lb</span><span class="r">Reps</span><span class="r">✓</span><span></span></div>
      ${ex.sets.map((st, si) => `
        <div class="lg-row ${st.done ? 'done' : ''}">
          <span class="lg-setno">${si + 1}</span>
          <input class="lg-inp" type="text" inputmode="decimal" data-ex="${i}" data-set="${si}" data-field="weightLb" value="${st.weightLb ?? ''}" placeholder="lb">
          <input class="lg-inp" type="text" inputmode="numeric" data-ex="${i}" data-set="${si}" data-field="reps" value="${st.reps ?? ''}" placeholder="–">
          <button class="lg-chk ${st.done ? 'on' : ''}" data-ex="${i}" data-set="${si}" type="button">✓</button>
          <button class="lg-del" data-ex="${i}" data-set="${si}" type="button" aria-label="Delete set">−</button>
        </div>`).join('')}
      <button class="lg-addset" data-ex="${i}" type="button">+ Add set</button>
    </div>`
}

function restBannerHtml(): string {
  if (!rest) return ''
  const remain = Math.max(0, Math.round((rest.endMs - Date.now()) / 1000))
  return `
    <div class="lg-rest" id="lgRest">
      <button class="lg-rest-adj" id="lgRestMinus" type="button">−15</button>
      <span class="lg-rest-time mono" id="lgRestTime">${fmt(remain)}</span>
      <button class="lg-rest-adj" id="lgRestPlus" type="button">+15</button>
      <button class="lg-rest-skip" id="lgRestSkip" type="button">Skip</button>
    </div>`
}

export function renderLogging(el: HTMLElement, sessionNum: number, onExit: () => void) {
  const draw = () => {
    const w = getActiveWorkout()
    if (!w) { clearAll(); onExit(); return }
    const paused = !!w.pausedAt

    el.innerHTML = `
      <div class="screen lg">
        <div class="lg-top">
          <div class="lg-clock">
            <button class="lg-pause" id="lgPause" type="button">${paused ? '▶' : '⏸'}</button>
            <span class="lg-elapsed mono ${paused ? 'paused' : ''}" id="lgElapsed">${fmt(workoutDurationSec(w, Date.now()))}</span>
          </div>
          <button class="lg-finish" id="lgFinish" type="button">Finish</button>
        </div>
        <a class="back" id="lgBack" href="#/">‹ Program</a>
        <div class="lg-day">Day ${w.sessionNum} · logging</div>
        ${restBannerHtml()}
        <div id="lgEx">${w.exercises.map((ex, i) => exerciseHtml(ex, i)).join('') || '<div class="note">No exercises — add one below.</div>'}</div>
        <button class="btn-add" id="lgAddEx" type="button">+ Add Exercise</button>
        <button class="btn-cancel" id="lgCancel" type="button">Cancel Workout</button>
      </div>`

    // Elapsed clock: tick only while running (frozen value while paused).
    clearElapsed()
    if (!paused) {
      elapsedTimer = setInterval(() => {
        const cur = getActiveWorkout()
        const e = el.querySelector('#lgElapsed')
        if (!cur || !e) { clearElapsed(); return }
        e.textContent = fmt(workoutDurationSec(cur, Date.now()))
      }, 1000)
    }

    // Rest countdown: update the banner each second; vibrate + clear at zero.
    clearRest()
    if (rest) {
      restTimer = setInterval(() => {
        const e = el.querySelector('#lgRestTime')
        if (!rest || !e) { clearRest(); return }
        const remain = Math.max(0, Math.round((rest.endMs - Date.now()) / 1000))
        e.textContent = fmt(remain)
        if (remain <= 0) { navigator.vibrate?.(200); rest = null; draw() }
      }, 1000)
    }

    el.querySelector('#lgPause')!.addEventListener('click', () => {
      const cur = getActiveWorkout(); if (!cur) return
      const next = togglePause(cur, Date.now())
      void saveActiveWorkout(next)
      draw()
    })

    el.querySelector('#lgBack')!.addEventListener('click', (ev) => {
      ev.preventDefault()
      if (confirm('Leave this workout? It stays active — resume it from this day.')) {
        clearAll()
        location.hash = '#/'
      }
    })

    el.querySelectorAll<HTMLInputElement>('.lg-inp').forEach((inp) => {
      inp.addEventListener('change', () => {
        const cur = getActiveWorkout(); if (!cur) return
        const exi = Number(inp.dataset.ex), si = Number(inp.dataset.set)
        const field = inp.dataset.field as 'weightLb' | 'reps'
        const raw = inp.value.trim()
        const num = raw === '' ? null : Number(raw)
        cur.exercises[exi].sets[si][field] = num !== null && Number.isFinite(num) ? num : null
        void saveActiveWorkout(cur)
      })
    })

    el.querySelectorAll<HTMLButtonElement>('.lg-chk').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = getActiveWorkout(); if (!cur) return
        const exi = Number(btn.dataset.ex), si = Number(btn.dataset.set)
        const st = cur.exercises[exi].sets[si]
        st.done = !st.done
        // Mark done → start that set's rest; un-done → stop a matching rest.
        if (st.done) rest = { exIdx: exi, setIdx: si, endMs: Date.now() + st.restSec * 1000 }
        else if (rest && rest.exIdx === exi && rest.setIdx === si) rest = null
        void saveActiveWorkout(cur)
        draw()
      })
    })

    el.querySelectorAll<HTMLButtonElement>('.lg-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = getActiveWorkout(); if (!cur) return
        const exi = Number(btn.dataset.ex), si = Number(btn.dataset.set)
        cur.exercises[exi].sets.splice(si, 1)
        if (cur.exercises[exi].sets.length === 0) cur.exercises.splice(exi, 1)
        if (rest && rest.exIdx === exi) rest = null // banner referenced a removed row
        void saveActiveWorkout(cur)
        draw()
      })
    })

    el.querySelectorAll<HTMLButtonElement>('.lg-addset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = getActiveWorkout(); if (!cur) return
        const exi = Number(btn.dataset.ex)
        const ex = cur.exercises[exi]
        const restSec = ex.sets.length ? ex.sets[ex.sets.length - 1].restSec : 90
        ex.sets.push(blankSet(restSec))
        void saveActiveWorkout(cur)
        draw()
      })
    })

    // Rest banner ±15: adjust the live countdown AND persist that set's restSec.
    const adjustRest = (delta: number) => {
      const cur = getActiveWorkout()
      if (!cur || !rest) return
      const st = cur.exercises[rest.exIdx]?.sets[rest.setIdx]
      if (st) { st.restSec = Math.max(0, st.restSec + delta); void saveActiveWorkout(cur) }
      rest.endMs = Math.max(Date.now(), rest.endMs + delta * 1000)
      const e = el.querySelector('#lgRestTime')
      if (e) e.textContent = fmt(Math.max(0, Math.round((rest.endMs - Date.now()) / 1000)))
    }
    el.querySelector('#lgRestMinus')?.addEventListener('click', () => adjustRest(-15))
    el.querySelector('#lgRestPlus')?.addEventListener('click', () => adjustRest(15))
    el.querySelector('#lgRestSkip')?.addEventListener('click', () => { rest = null; draw() })

    el.querySelector('#lgAddEx')!.addEventListener('click', async () => {
      const chosen = await openExercisePicker({ lang: 'en', multi: true })
      const cur = getActiveWorkout()
      if (!cur || !chosen.length) return
      cur.exercises.push(...chosen.map(catalogToWorkoutExercise))
      void saveActiveWorkout(cur)
      draw()
    })

    el.querySelector('#lgFinish')!.addEventListener('click', async () => {
      const cur = getActiveWorkout(); if (!cur) return
      clearAll()
      await finishWorkout(cur, cur.coachMessage, new Date().toISOString())
      const s = getSession(sessionNum)
      if (s) await markDayFinished(sessionNum, s.exercises)
      onExit()
    })

    el.querySelector('#lgCancel')!.addEventListener('click', async () => {
      if (!confirm('Cancel this workout? All progress will be lost.')) return
      clearAll()
      await cancelWorkout()
      onExit()
    })
  }
  draw()
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm run build` success; `npm run test` green.

- [ ] **Step 3: Commit**
```bash
git add src/screens/logging.ts
git commit -m "feat(logger): pause/resume clock, per-set rest timer, leave-workout confirm"
```

---

## Task 3: Styles for pause button + rest banner

**Files:** `src/styles/app.css` (append).

- [ ] **Step 1: Append:**
```css
.lg-clock{display:flex;align-items:center;gap:10px}
.lg-pause{width:34px;height:34px;border-radius:9px;border:1px solid var(--line);background:rgba(255,255,255,.06);
  color:var(--ink);font-size:13px;cursor:pointer;display:grid;place-items:center;padding:0}
.lg-elapsed.paused{color:var(--dim)}
.lg-rest{position:sticky;top:0;z-index:5;display:flex;align-items:center;gap:10px;justify-content:center;
  background:rgba(94,168,255,.16);border:1px solid rgba(94,168,255,.45);border-radius:12px;padding:9px 12px;margin:0 0 12px}
.lg-rest-time{font-size:18px;font-weight:800;color:var(--blue);min-width:54px;text-align:center}
.lg-rest-adj{border:1px solid rgba(94,168,255,.4);background:rgba(255,255,255,.05);color:var(--blue);
  border-radius:8px;padding:6px 10px;font-weight:700;font-size:12px;cursor:pointer}
.lg-rest-skip{margin-left:auto;border:none;background:none;color:var(--dim);font-weight:700;font-size:12px;cursor:pointer}
```

- [ ] **Step 2: Build** — `npm run build` success.

- [ ] **Step 3: Commit**
```bash
git add src/styles/app.css
git commit -m "style(logger): pause button + rest-timer banner"
```

---

## Task 4: Controller verification + docs

- [ ] **Step 1: Controller verifies in the browser** (orchestrator, no-auth preview):
  - Start a session → tap **⏸**: elapsed freezes + dims, button shows **▶**; tap **▶**: resumes from where it froze (no jump).
  - Tap a set's **✓** → the rest banner appears counting down from that lift's default (Squat 1:30 etc.); **−15/+15** change the live countdown and persist that set's rest; **Skip** dismisses; at 0 it auto-clears (vibrate on a real phone).
  - Tap **‹ Program** → confirm dialog; cancelling stays, confirming goes to the list (workout still active, Resume banner shows).
  - Edits/done still persist; refresh keeps the active workout; zero console errors.

- [ ] **Step 2: No doc changes needed** (logging.ts already in key files). Skip if nothing to add.

- [ ] **Step 3: (No commit unless docs changed.)**

---

## Self-review notes
- **Spec coverage:** pause/resume with pause-aware duration (T1, T2) · rest timer per-lift default + ±15 per-set adjust persisted + vibrate + skip (T2) · leave-workout confirm (T2). Deferred & labeled: notes, coach message, Coach/Last column, history (B4).
- **Type consistency:** `pausedAt` added to `Workout`; `togglePause(w, nowMs): Workout`; `workoutDurationSec` accepts optional `pausedAt`. `startWorkout` + any test `Workout` literals updated with `pausedAt`.
- **Timer hygiene:** two intervals (`elapsedTimer`, `restTimer`) both cleared via `clearAll()` on finish/cancel/leave/no-active; elapsed self-clears when `#lgElapsed` gone; rest self-clears when banner gone or at zero. Elapsed interval not started while paused.
- **No placeholders:** full code; only T4 is manual controller verification.
