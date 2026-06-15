# Logger B4 — Notes, References & History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Finish the logger — show a **Last** reference (what you did last time) next to the coach target, let you leave **per-set notes** and a **session message to the coach**, and add a **history** view of past workouts.

**Architecture:** `logging.ts` gains: last-actual hints (via the already-built `lastActualFor` over `listWorkouts()`), per-set notes (edited via `prompt`, **rendered with `textContent`** — never `innerHTML`), and a coach-message textarea (value via the `.value` property). A new `src/screens/history.ts` (route `#/history`) lists finished workouts and expands to show logged sets/notes — all user text via `textContent`.

**Tech Stack:** Vite + TS, Vitest. **SECURITY (CRITICAL):** notes + coachMessage are the first user-entered text in the app. They MUST be rendered with `textContent` or set via an input/textarea `.value` property — NEVER interpolated into an `innerHTML` template. This is the stored-XSS sink CLAUDE.md warns about.

**Branch:** `feat/exercise-catalog` (SAME branch → PR #1). Commit per task. Never push to `main`.

**Spec:** `docs/superpowers/specs/2026-06-15-logger-design.md` (Spec B). This is the last B-increment.

---

## File Structure
- Modify: `src/screens/logging.ts` — Last reference (subtitle + input placeholders), per-set notes (`prompt` edit, `textContent` display), coach-message textarea.
- Create: `src/screens/history.ts` — `#/history` finished-workout list (expandable; `textContent` for all logged data).
- Modify: `src/main.ts` — register `#/history`.
- Modify: `src/screens/list.ts` — a "History" link in the program-list header.
- Modify: `src/styles/app.css` — notes, coach-message, history styles.

---

## Task 1: Last reference + per-set notes + coach message (logging.ts)

**Files:** `src/screens/logging.ts` (replace with the version below).

- [ ] **Step 1: Replace `src/screens/logging.ts` with EXACTLY this:**

```ts
// Logging mode for an active workout. Owns set-editing, pause/resume clock, rest
// timer, per-set notes, and a coach message.
// SECURITY: catalog/coach names + numbers go through innerHTML (trusted). USER TEXT
// (set notes, coach message) is NEVER put in innerHTML — notes render via textContent
// after the template is set; the coach message uses the textarea .value property.
import type { WorkoutExercise, LoggedSet } from '../lib/logger-types'
import { getActiveWorkout, saveActiveWorkout, finishWorkout, cancelWorkout, listWorkouts } from '../lib/workouts'
import { workoutDurationSec, togglePause, blankSet, catalogToWorkoutExercise, lastActualFor } from '../lib/logger-model'
import { openExercisePicker } from '../components/exercise-picker'
import { getSession } from '../data/program'
import { finish as markDayFinished } from '../lib/progress'

let elapsedTimer: ReturnType<typeof setInterval> | null = null
let restTimer: ReturnType<typeof setInterval> | null = null
let rest: { exIdx: number; setIdx: number; endMs: number } | null = null

const clearElapsed = () => { if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null } }
const clearRest = () => { if (restTimer) { clearInterval(restTimer); restTimer = null } }
const clearAll = () => { clearElapsed(); clearRest(); rest = null }
const fmt = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`

// `last` = the done sets from the most recent finished workout for this exercise (or null).
function exerciseHtml(ex: WorkoutExercise, i: number, last: LoggedSet[] | null): string {
  const topLast = last && last[0] ? ` · Last ${last[0].weightLb ?? '–'}×${last[0].reps ?? '–'}` : ''
  return `
    <div class="lg-ex">
      <div class="lg-exname">${ex.nameEn}</div>
      <div class="lg-exru">${ex.nameRu}</div>
      ${ex.coachTarget || topLast ? `<div class="lg-coach">${ex.coachTarget ? 'Coach · ' + ex.coachTarget : ''}${topLast}</div>` : ''}
      <div class="lg-thead"><span>Set</span><span class="r">lb</span><span class="r">Reps</span><span class="r">✓</span><span></span><span></span></div>
      ${ex.sets.map((st, si) => {
        const lp = last && last[si] ? last[si] : null
        return `
        <div class="lg-row ${st.done ? 'done' : ''}">
          <span class="lg-setno">${si + 1}</span>
          <input class="lg-inp" type="text" inputmode="decimal" data-ex="${i}" data-set="${si}" data-field="weightLb" value="${st.weightLb ?? ''}" placeholder="${lp && lp.weightLb !== null ? lp.weightLb : 'lb'}">
          <input class="lg-inp" type="text" inputmode="numeric" data-ex="${i}" data-set="${si}" data-field="reps" value="${st.reps ?? ''}" placeholder="${lp && lp.reps !== null ? lp.reps : '–'}">
          <button class="lg-chk ${st.done ? 'on' : ''}" data-ex="${i}" data-set="${si}" type="button">✓</button>
          <button class="lg-note-btn ${st.note ? 'has' : ''}" data-ex="${i}" data-set="${si}" type="button" aria-label="Note">🗒</button>
          <button class="lg-del" data-ex="${i}" data-set="${si}" type="button" aria-label="Delete set">−</button>
        </div>
        <div class="lg-note" data-ex="${i}" data-set="${si}"></div>`
      }).join('')}
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
    const history = listWorkouts()

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
        <div id="lgEx">${w.exercises.map((ex, i) => exerciseHtml(ex, i, lastActualFor(history, ex.exerciseRef))).join('') || '<div class="note">No exercises — add one below.</div>'}</div>
        <button class="btn-add" id="lgAddEx" type="button">+ Add Exercise</button>
        <label class="lg-msg-l">Message to coach (optional)</label>
        <textarea class="lg-msg" id="lgMsg" rows="2" placeholder="e.g. left knee tight on set 2"></textarea>
        <button class="btn-cancel" id="lgCancel" type="button">Cancel Workout</button>
      </div>`

    // USER TEXT — render notes via textContent (never innerHTML) and seed the textarea value.
    el.querySelectorAll<HTMLElement>('.lg-note').forEach((d) => {
      const cur = getActiveWorkout(); if (!cur) return
      const note = cur.exercises[Number(d.dataset.ex)]?.sets[Number(d.dataset.set)]?.note ?? ''
      d.textContent = note ? `🗒 ${note}` : ''
    })
    const msg = el.querySelector<HTMLTextAreaElement>('#lgMsg')!
    msg.value = w.coachMessage
    msg.addEventListener('input', () => {
      const cur = getActiveWorkout(); if (!cur) return
      cur.coachMessage = msg.value
      void saveActiveWorkout(cur)
    })

    clearElapsed()
    if (!paused) {
      elapsedTimer = setInterval(() => {
        const cur = getActiveWorkout()
        const e = el.querySelector('#lgElapsed')
        if (!cur || !e) { clearElapsed(); return }
        e.textContent = fmt(workoutDurationSec(cur, Date.now()))
      }, 1000)
    }

    clearRest()
    if (rest) {
      restTimer = setInterval(() => {
        const e = el.querySelector('#lgRestTime')
        if (!rest || !e) { rest = null; clearRest(); return }
        const remain = Math.max(0, Math.round((rest.endMs - Date.now()) / 1000))
        e.textContent = fmt(remain)
        if (remain <= 0) {
          navigator.vibrate?.(200)
          rest = null
          const af = document.activeElement
          if (af instanceof HTMLInputElement && af.closest('[data-ex]')) af.blur()
          draw()
        }
      }, 1000)
    }

    el.querySelector('#lgPause')!.addEventListener('click', () => {
      const cur = getActiveWorkout(); if (!cur) return
      const next = togglePause(cur, Date.now())
      if (next.pausedAt) { rest = null; clearRest() }
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
        if (st.done) rest = { exIdx: exi, setIdx: si, endMs: Date.now() + st.restSec * 1000 }
        else if (rest && rest.exIdx === exi && rest.setIdx === si) rest = null
        void saveActiveWorkout(cur)
        draw()
      })
    })

    el.querySelectorAll<HTMLButtonElement>('.lg-note-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = getActiveWorkout(); if (!cur) return
        const exi = Number(btn.dataset.ex), si = Number(btn.dataset.set)
        const st = cur.exercises[exi].sets[si]
        const next = prompt('Note for this set:', st.note)
        if (next === null) return // cancelled
        st.note = next.trim()
        void saveActiveWorkout(cur)
        draw()
      })
    })

    el.querySelectorAll<HTMLButtonElement>('.lg-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = getActiveWorkout(); if (!cur) return
        const exi = Number(btn.dataset.ex), si = Number(btn.dataset.set)
        cur.exercises[exi].sets.splice(si, 1)
        const removedExercise = cur.exercises[exi].sets.length === 0
        if (removedExercise) cur.exercises.splice(exi, 1)
        if (rest) {
          if (rest.exIdx === exi) rest = null
          else if (removedExercise && rest.exIdx > exi) rest.exIdx--
        }
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
git commit -m "feat(logger): Last reference hints, per-set notes, coach message (textContent-safe)"
```

---

## Task 2: History view

**Files:** Create `src/screens/history.ts`; modify `src/main.ts`, `src/screens/list.ts`.

- [ ] **Step 1: Create `src/screens/history.ts`** with EXACTLY this:

```ts
// Past finished workouts. SECURITY: workout/exercise names are trusted, but per-set
// NOTES and the coach message are USER TEXT — rendered via textContent only.
import { listWorkouts } from '../lib/workouts'
import { workoutDurationSec } from '../lib/logger-model'
import type { Workout } from '../lib/logger-types'

const fmtDur = (sec: number) => `${Math.floor(sec / 60)}m`
const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

let openId: string | null = null

export function renderHistory(el: HTMLElement) {
  const draw = () => {
    const finished = listWorkouts()
      .filter((w) => w.status === 'finished')
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))

    el.innerHTML = `
      <div class="screen">
        <a class="back" href="#/">‹ Program</a>
        <h1 class="hist-h">History</h1>
        ${finished.length ? `<div id="histList"></div>` : '<div class="note">No finished workouts yet.</div>'}
      </div>`

    const list = el.querySelector('#histList')
    if (list) finished.forEach((w) => list.appendChild(card(w)))
  }

  // Build each card with the DOM API so all user text goes through textContent.
  const card = (w: Workout): HTMLElement => {
    const root = document.createElement('div')
    root.className = 'hist-card'
    const head = document.createElement('button')
    head.className = 'hist-head'
    head.type = 'button'
    const dur = w.endedAt ? workoutDurationSec(w, Date.parse(w.endedAt)) : 0
    head.textContent = `Day ${w.sessionNum ?? '—'} · ${dateLabel(w.startedAt)} · ${fmtDur(dur)} · ${w.exercises.length} ex`
    head.addEventListener('click', () => { openId = openId === w.id ? null : w.id; draw() })
    root.appendChild(head)

    if (openId === w.id) {
      const body = document.createElement('div')
      body.className = 'hist-body'
      for (const ex of w.exercises) {
        const exEl = document.createElement('div')
        exEl.className = 'hist-ex'
        const nm = document.createElement('div')
        nm.className = 'hist-exname'
        nm.textContent = ex.nameEn // trusted, but textContent is safe regardless
        exEl.appendChild(nm)
        for (const s of ex.sets) {
          const row = document.createElement('div')
          row.className = 'hist-set'
          const done = s.done ? '✓' : '·'
          row.textContent = `${done} ${s.weightLb ?? '–'} lb × ${s.reps ?? '–'}`
          if (s.note) { const n = document.createElement('span'); n.className = 'hist-note'; n.textContent = ` 🗒 ${s.note}`; row.appendChild(n) }
          exEl.appendChild(row)
        }
        body.appendChild(exEl)
      }
      if (w.coachMessage) {
        const m = document.createElement('div')
        m.className = 'hist-msg'
        m.textContent = `Coach message: ${w.coachMessage}`
        body.appendChild(m)
      }
      root.appendChild(body)
    }
    return root
  }

  draw()
}
```

- [ ] **Step 2: Register the route in `src/main.ts`** — add the import with the other screen imports:
```ts
import { renderHistory } from './screens/history'
```
and the route after the `/exercises` (or `/session/:n`) line:
```ts
route('/history', (el) => renderHistory(el))
```

- [ ] **Step 3: Add a History link in `src/screens/list.ts`** — READ the file. In the header area (near the EN·RU `.lang` / `.hero-actions`), add a link to `#/history`. Find the `.hero-actions` element in the list template and add, as its first child, a small link:
```ts
<a class="hist-link" href="#/history" aria-label="History">History</a>
```
(If `.hero-actions` doesn't exist or the structure differs, add the link next to the language toggle — mirror the existing markup style. Read the file to place it correctly.)

- [ ] **Step 4: Verify** — `npx tsc --noEmit` clean; `npm run build` success.

- [ ] **Step 5: Commit**
```bash
git add src/screens/history.ts src/main.ts src/screens/list.ts
git commit -m "feat(logger): workout history view (#/history), textContent-safe"
```

---

## Task 3: Styles

**Files:** `src/styles/app.css` (append).

- [ ] **Step 1: Append:**
```css
.lg-thead,.lg-row{grid-template-columns:24px 1fr 1fr 28px 26px 22px}
.lg-note-btn{width:26px;height:26px;border-radius:7px;border:1px solid var(--line);background:rgba(255,255,255,.05);
  color:var(--dim);font-size:12px;cursor:pointer;padding:0}
.lg-note-btn.has{border-color:rgba(94,168,255,.5);color:var(--blue)}
.lg-note{font-size:11px;color:var(--blue);padding:0 2px 4px 32px;word-break:break-word}
.lg-note:empty{display:none}
.lg-msg-l{display:block;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--dim);margin:14px 0 6px}
.lg-msg{width:100%;background:rgba(255,255,255,.05);border:1px solid var(--line);border-radius:10px;padding:10px 12px;
  color:var(--ink);font-size:14px;font-family:var(--sans);resize:vertical;margin-bottom:10px}
.lg-msg:focus{outline:none;border-color:rgba(39,230,180,.5)}
.hist-h{font-size:22px;font-weight:800;margin:8px 0 14px}
.hist-link{font-size:11px;color:var(--mint);text-decoration:none;border:1px solid rgba(39,230,180,.4);border-radius:20px;padding:4px 10px;white-space:nowrap}
.hist-card{background:var(--card);border:1px solid var(--line);border-radius:12px;margin-bottom:10px;overflow:hidden}
.hist-head{width:100%;text-align:left;background:none;border:none;color:var(--ink);font-weight:700;font-size:13px;padding:13px;cursor:pointer}
.hist-body{padding:0 13px 13px;border-top:1px solid var(--line)}
.hist-ex{margin-top:10px}
.hist-exname{font-size:13px;font-weight:800;color:var(--blue)}
.hist-set{font-family:var(--mono);font-size:12px;color:var(--ink);padding:2px 0}
.hist-note{color:var(--blue);font-family:var(--sans)}
.hist-msg{margin-top:10px;font-size:12px;color:var(--dim);border-left:2px solid var(--mint);padding-left:9px}
```

- [ ] **Step 2: Build** — `npm run build` success.

- [ ] **Step 3: Commit**
```bash
git add src/styles/app.css
git commit -m "style(logger): notes, coach message, history view"
```

---

## Task 4: Controller verification + docs

- [ ] **Step 1: Controller verifies in the browser** (orchestrator, no-auth preview):
  - In logging mode: a set's **🗒** prompts for a note; the note shows under the row (and a second workout of the same day shows it again). Type a coach message. Mark sets, Finish.
  - **Open `#/history`** (and the header History link): the finished workout appears; tap to expand → exercises, sets (lb×reps, ✓), the note, and the coach message all render.
  - **XSS probe:** set a note to `<img src=x onerror=alert(1)>` (and a coach message). Confirm it renders as literal text in both logging mode and history (no alert, no injected node).
  - The earlier-logged workout's actuals now appear as **Last** hints (placeholder/subtitle) when you re-log that day. Zero console errors.

- [ ] **Step 2: Update `CLAUDE.md` Key files** — add:
```
- `src/screens/history.ts` — past finished workouts (#/history)
```
And in the conventions/XSS note area, confirm the existing innerHTML/textContent guidance now applies (notes + coach message are live user-text sinks rendered via textContent).

- [ ] **Step 3: Commit**
```bash
git add CLAUDE.md
git commit -m "docs(logger): history screen in key files"
```

---

## Self-review notes
- **Spec coverage:** Last reference (T1 — subtitle summary + per-set input placeholders, via the tested `lastActualFor`) · per-set notes (T1) · session coach message (T1) · history view (T2). 
- **XSS (the critical one):** notes render via `textContent` (`.lg-note` populated after innerHTML); coach message via textarea `.value` property; history built entirely with `document.createElement` + `textContent`. NO user text touches an innerHTML template. T4 includes an explicit `<img onerror>` probe.
- **Type consistency:** `exerciseHtml(ex, i, last: LoggedSet[] | null)`; `lastActualFor(history, ref)` already returns `LoggedSet[] | null`; `renderHistory(el)`; `route('/history', …)`.
- **Last reference is per-set-index:** `last[si]` for the placeholder, `last[0]` for the subtitle summary; guards for missing indices.
- **No placeholders:** full code; only T4 is manual controller verification (incl. the XSS probe).
