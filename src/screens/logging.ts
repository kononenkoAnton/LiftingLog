// Logging mode for an active workout. Owns set-editing, pause/resume clock, rest
// timer, and a coach message.
// SECURITY: catalog/coach names + numbers go through innerHTML (trusted). USER TEXT
// (coach message) is NEVER put in innerHTML — the coach message uses the textarea
// .value property.
import type { WorkoutExercise, LoggedSet, Workout } from '../lib/logger-types'
import { getActiveWorkout, saveActiveWorkout, finishWorkout, cancelWorkout, listWorkouts, updateFinishedWorkout } from '../lib/workouts'
import { workoutDurationSec, togglePause, blankSet, catalogToWorkoutExercise, lastActualFor, withLastActual } from '../lib/logger-model'
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

function exerciseHtml(ex: WorkoutExercise, i: number, last: LoggedSet[] | null): string {
  const lastStr = last && last[0] ? `Last ${last[0].weightLb ?? '–'}×${last[0].reps ?? '–'}` : ''
  return `
    <div class="lg-ex">
      <div class="lg-exh">
        <div><div class="lg-exname">${ex.nameEn}</div><div class="lg-exru">${ex.nameRu}</div></div>
        <button class="lg-ex-del" data-ex="${i}" type="button" aria-label="Remove exercise">✕</button>
      </div>
      ${ex.coachTarget || lastStr ? `<div class="lg-coach">${ex.coachTarget ? 'Coach · ' + ex.coachTarget : ''}${ex.coachTarget && lastStr ? ' · ' : ''}${lastStr}</div>` : ''}
      <div class="lg-thead"><span>Set</span><span class="r">lb</span><span class="r">Reps</span><span class="r">✓</span><span></span></div>
      ${ex.sets.map((st, si) => {
        const lp = last && last[si] ? last[si] : null
        return `
        <div class="lg-row ${st.done ? 'done' : ''}">
          <span class="lg-setno">${si + 1}</span>
          <input class="lg-inp" type="text" inputmode="decimal" data-ex="${i}" data-set="${si}" data-field="weightLb" value="${st.weightLb ?? ''}" placeholder="${lp && lp.weightLb !== null ? lp.weightLb : 'lb'}">
          <input class="lg-inp" type="text" inputmode="numeric" data-ex="${i}" data-set="${si}" data-field="reps" value="${st.reps ?? ''}" placeholder="${lp && lp.reps !== null ? lp.reps : '–'}">
          <button class="lg-chk ${st.done ? 'on' : ''}" data-ex="${i}" data-set="${si}" type="button">✓</button>
          <button class="lg-del" data-ex="${i}" data-set="${si}" type="button" aria-label="Delete set">−</button>
        </div>`
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

export function renderLogging(el: HTMLElement, sessionNum: number, onExit: () => void, editWorkout?: Workout) {
  const edit = !!editWorkout
  const current = () => editWorkout ?? getActiveWorkout()
  const persist = (w: Workout) => { if (editWorkout) void updateFinishedWorkout(w); else void saveActiveWorkout(w) }

  const draw = () => {
    const w = current()
    if (!w) { clearAll(); onExit(); return }
    const paused = !!w.pausedAt
    const history = listWorkouts()

    el.innerHTML = `
      <div class="screen lg">
        <div class="lg-top">
          <div class="lg-clock">
            ${edit ? '<span class="lg-elapsed mono">Editing</span>'
              : `<button class="lg-pause" id="lgPause" type="button">${paused ? '▶' : '⏸'}</button>
            <span class="lg-elapsed mono ${paused ? 'paused' : ''}" id="lgElapsed">${fmt(workoutDurationSec(w, Date.now()))}</span>`}
          </div>
          ${edit ? '<button class="lg-finish" id="lgDone" type="button">Done</button>'
            : `<div class="lg-actions">
            <button class="lg-cancel-x" id="lgCancel" type="button" aria-label="Cancel workout">✕</button>
            <button class="lg-finish" id="lgFinish" type="button">Finish</button>
          </div>`}
        </div>
        <a class="back" id="lgBack" href="#/">‹ Program</a>
        <div class="lg-day">Day ${w.sessionNum} · logging</div>
        ${!edit ? restBannerHtml() : ''}
        <div id="lgEx">${w.exercises.map((ex, i) => exerciseHtml(ex, i, lastActualFor(history, ex.exerciseRef))).join('') || '<div class="note">No exercises — add one below.</div>'}</div>
        <button class="btn-add" id="lgAddEx" type="button">+ Add Exercise</button>
        <label class="lg-msg-l">Message to coach (optional)</label>
        <textarea class="lg-msg" id="lgMsg" rows="2" placeholder="e.g. left knee tight on set 2"></textarea>
      </div>`

    const msg = el.querySelector<HTMLTextAreaElement>('#lgMsg')!
    msg.value = w.coachMessage ?? ''
    msg.addEventListener('input', () => {
      const cur = current(); if (!cur) return
      cur.coachMessage = msg.value
      persist(cur)
    })

    clearElapsed()
    if (!edit && !paused) {
      elapsedTimer = setInterval(() => {
        const cur = current()
        const e = el.querySelector('#lgElapsed')
        if (!cur || !e) { clearElapsed(); return }
        e.textContent = fmt(workoutDurationSec(cur, Date.now()))
      }, 1000)
    }

    clearRest()
    if (!edit && rest) {
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

    el.querySelector('#lgPause')?.addEventListener('click', () => {
      const cur = current(); if (!cur) return
      const next = togglePause(cur, Date.now())
      if (next.pausedAt) { rest = null; clearRest() }
      persist(next)
      draw()
    })

    el.querySelector('#lgBack')!.addEventListener('click', (ev) => {
      ev.preventDefault()
      const msg = edit
        ? 'Leave edit mode? Changes are already saved.'
        : 'Leave this workout? It stays active — resume it from this day.'
      if (confirm(msg)) {
        clearAll()
        location.hash = '#/'
      }
    })

    el.querySelectorAll<HTMLInputElement>('.lg-inp').forEach((inp) => {
      inp.addEventListener('change', () => {
        const cur = current(); if (!cur) return
        const exi = Number(inp.dataset.ex), si = Number(inp.dataset.set)
        const field = inp.dataset.field as 'weightLb' | 'reps'
        const raw = inp.value.trim()
        const num = raw === '' ? null : Number(raw)
        cur.exercises[exi].sets[si][field] = num !== null && Number.isFinite(num) ? num : null
        persist(cur)
      })
    })

    el.querySelectorAll<HTMLButtonElement>('.lg-chk').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = current(); if (!cur) return
        const exi = Number(btn.dataset.ex), si = Number(btn.dataset.set)
        const st = cur.exercises[exi].sets[si]
        st.done = !st.done
        if (!edit && st.done) rest = { exIdx: exi, setIdx: si, endMs: Date.now() + st.restSec * 1000 }
        else if (rest && rest.exIdx === exi && rest.setIdx === si) rest = null
        persist(cur)
        draw()
      })
    })

    el.querySelectorAll<HTMLButtonElement>('.lg-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = current(); if (!cur) return
        const exi = Number(btn.dataset.ex), si = Number(btn.dataset.set)
        cur.exercises[exi].sets.splice(si, 1)
        const removedExercise = cur.exercises[exi].sets.length === 0
        if (removedExercise) cur.exercises.splice(exi, 1)
        if (rest) {
          if (rest.exIdx === exi) rest = null
          else if (removedExercise && rest.exIdx > exi) rest.exIdx--
        }
        persist(cur)
        draw()
      })
    })

    el.querySelectorAll<HTMLButtonElement>('.lg-addset').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = current(); if (!cur) return
        const exi = Number(btn.dataset.ex)
        const ex = cur.exercises[exi]
        const prev = ex.sets[ex.sets.length - 1]
        ex.sets.push(prev
          ? { weightLb: prev.weightLb, reps: prev.reps, done: false, restSec: prev.restSec }
          : blankSet(90))
        persist(cur)
        draw()
      })
    })

    el.querySelectorAll<HTMLButtonElement>('.lg-ex-del').forEach((btn) => {
      btn.addEventListener('click', () => {
        const cur = current(); if (!cur) return
        const exi = Number(btn.dataset.ex)
        const name = cur.exercises[exi]?.nameEn ?? 'this exercise'
        if (!confirm(`Remove ${name} and all its logged sets?`)) return
        cur.exercises.splice(exi, 1)
        if (rest) { if (rest.exIdx === exi) rest = null; else if (rest.exIdx > exi) rest.exIdx-- }
        persist(cur)
        draw()
      })
    })

    const adjustRest = (delta: number) => {
      const cur = current()
      if (!cur || !rest) return
      const st = cur.exercises[rest.exIdx]?.sets[rest.setIdx]
      if (st) { st.restSec = Math.max(0, st.restSec + delta); persist(cur) }
      rest.endMs = Math.max(Date.now(), rest.endMs + delta * 1000)
      const e = el.querySelector('#lgRestTime')
      if (e) e.textContent = fmt(Math.max(0, Math.round((rest.endMs - Date.now()) / 1000)))
    }
    el.querySelector('#lgRestMinus')?.addEventListener('click', () => adjustRest(-15))
    el.querySelector('#lgRestPlus')?.addEventListener('click', () => adjustRest(15))
    el.querySelector('#lgRestSkip')?.addEventListener('click', () => { rest = null; draw() })

    el.querySelector('#lgAddEx')!.addEventListener('click', async () => {
      const chosen = await openExercisePicker({ lang: 'en', multi: true })
      const cur = current()
      if (!cur || !chosen.length) return
      const history = listWorkouts()
      cur.exercises.push(...chosen.map((c) => withLastActual(catalogToWorkoutExercise(c), lastActualFor(history, c.id))))
      persist(cur)
      draw()
    })

    el.querySelector('#lgFinish')?.addEventListener('click', async () => {
      const cur = current(); if (!cur) return
      const hasUnfinished = cur.exercises.some((ex) => ex.sets.some((s) => !s.done))
      if (hasUnfinished && !confirm("Some sets aren't marked done. Finish anyway? Unfinished sets won't be saved.")) return
      // keep only completed sets; drop exercises left with none
      const finished = {
        ...cur,
        exercises: cur.exercises
          .map((ex) => ({ ...ex, sets: ex.sets.filter((s) => s.done) }))
          .filter((ex) => ex.sets.length > 0),
      }
      clearAll()
      await finishWorkout(finished, cur.coachMessage, new Date().toISOString())
      const s = getSession(sessionNum)
      if (s) await markDayFinished(sessionNum, s.exercises)
      onExit()
    })

    el.querySelector('#lgCancel')?.addEventListener('click', async () => {
      if (!confirm('Cancel this workout? All progress will be lost.')) return
      clearAll()
      await cancelWorkout()
      onExit()
    })

    el.querySelector('#lgDone')?.addEventListener('click', () => { clearAll(); onExit() })
  }
  draw()
}
