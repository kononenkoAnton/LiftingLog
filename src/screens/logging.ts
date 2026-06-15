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
        if (!rest || !e) { rest = null; clearRest(); return } // navigated away → drop stale rest
        const remain = Math.max(0, Math.round((rest.endMs - Date.now()) / 1000))
        e.textContent = fmt(remain)
        if (remain <= 0) {
          navigator.vibrate?.(200)
          rest = null
          const af = document.activeElement
          if (af instanceof HTMLInputElement && af.closest('[data-ex]')) af.blur() // flush typed value before re-render
          draw()
        }
      }, 1000)
    }

    el.querySelector('#lgPause')!.addEventListener('click', () => {
      const cur = getActiveWorkout(); if (!cur) return
      const next = togglePause(cur, Date.now())
      if (next.pausedAt) { rest = null; clearRest() } // pausing abandons the between-set rest
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

    el.querySelectorAll<HTMLButtonElement>('.lg-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = getActiveWorkout(); if (!cur) return
        const exi = Number(btn.dataset.ex), si = Number(btn.dataset.set)
        cur.exercises[exi].sets.splice(si, 1)
        const removedExercise = cur.exercises[exi].sets.length === 0
        if (removedExercise) cur.exercises.splice(exi, 1)
        if (rest) {
          if (rest.exIdx === exi) rest = null                       // resting exercise touched → cancel
          else if (removedExercise && rest.exIdx > exi) rest.exIdx-- // earlier exercise removed → reindex
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
