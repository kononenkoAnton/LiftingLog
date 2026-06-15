// Logging mode for an active workout. Owns all set-editing interactions; mutates the
// active Workout and writes through workouts.ts. Names/numbers rendered here are
// trusted (catalog/coach data + numeric inputs) so innerHTML is safe. Per-set NOTES
// (user text) are NOT rendered yet — they arrive in B4 and MUST use textContent.
import type { WorkoutExercise } from '../lib/logger-types'
import { getActiveWorkout, saveActiveWorkout, finishWorkout, cancelWorkout } from '../lib/workouts'
import { workoutDurationSec, blankSet, catalogToWorkoutExercise } from '../lib/logger-model'
import { openExercisePicker } from '../components/exercise-picker'
import { getSession } from '../data/program'
import { finish as markDayFinished } from '../lib/progress'

let timer: ReturnType<typeof setInterval> | null = null
const clearTimer = () => { if (timer) { clearInterval(timer); timer = null } }
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

export function renderLogging(el: HTMLElement, sessionNum: number, onExit: () => void) {
  const draw = () => {
    const w = getActiveWorkout()
    if (!w) { clearTimer(); onExit(); return }

    el.innerHTML = `
      <div class="screen lg">
        <div class="lg-top">
          <span class="lg-elapsed mono" id="lgElapsed">${fmt(workoutDurationSec(w, Date.now()))}</span>
          <button class="lg-finish" id="lgFinish" type="button">Finish</button>
        </div>
        <a class="back" href="#/">‹ Program</a>
        <div class="lg-day">Day ${w.sessionNum} · logging</div>
        <div id="lgEx">${w.exercises.map((ex, i) => exerciseHtml(ex, i)).join('') || '<div class="note">No exercises — add one below.</div>'}</div>
        <button class="btn-add" id="lgAddEx" type="button">+ Add Exercise</button>
        <button class="btn-cancel" id="lgCancel" type="button">Cancel Workout</button>
      </div>`

    clearTimer()
    timer = setInterval(() => {
      const cur = getActiveWorkout()
      const e = el.querySelector('#lgElapsed')
      if (!cur || !e) { clearTimer(); return }
      e.textContent = fmt(workoutDurationSec(cur, Date.now()))
    }, 1000)

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
        void saveActiveWorkout(cur)
        draw()
      })
    })

    el.querySelectorAll<HTMLButtonElement>('.lg-addset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = getActiveWorkout(); if (!cur) return
        const exi = Number(btn.dataset.ex)
        const ex = cur.exercises[exi]
        const rest = ex.sets.length ? ex.sets[ex.sets.length - 1].restSec : 90
        ex.sets.push(blankSet(rest))
        void saveActiveWorkout(cur)
        draw()
      })
    })

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
      clearTimer()
      await finishWorkout(cur, cur.coachMessage, new Date().toISOString())
      const s = getSession(sessionNum)
      if (s) await markDayFinished(sessionNum, s.exercises)
      onExit()
    })

    el.querySelector('#lgCancel')!.addEventListener('click', async () => {
      if (!confirm('Cancel this workout? All progress will be lost.')) return
      clearTimer()
      await cancelWorkout()
      onExit()
    })
  }
  draw()
}
